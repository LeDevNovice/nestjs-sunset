import { Injectable, Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

import { SUNSET_METADATA_KEY } from '../decorators/deprecated.decorator';
import { toDate } from '../core/date-converter';
import { validateDeprecationOptions } from '../core/sunset-validator';
import { SUNSET_OPTIONS_TOKEN } from '../module/sunset.module-definition';
import type { SunsetModuleOptions } from '../module/sunset-module.options';
import type { DeprecatedOptions } from '../types/deprecated-options.type';
import type { DeprecationRecord } from '../types/deprecation-record.type';
import { patchSwaggerOperation } from '../swagger/swagger-patcher';

/** Representing route handler references. */
type RouteHandler = (...args: unknown[]) => unknown;

// Maps NestJS RequestMethod enum values to HTTP method name strings.
const HTTP_METHOD_NAMES = new Map<number, string>([
  [0, 'GET'],
  [1, 'POST'],
  [2, 'PUT'],
  [3, 'DELETE'],
  [4, 'PATCH'],
  [5, 'ALL'],
  [6, 'OPTIONS'],
  [7, 'HEAD'],
  [8, 'SEARCH'],
]);

/**
 * Central registry of all `@Deprecated()` endpoints.
 */
@Injectable()
export class DeprecationRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeprecationRegistry.name);

  /**
   * Primary index: handler function reference → DeprecationRecord.
   *
   * Using the function reference as the key eliminates any dependence on
   * string reconstruction and is the entry point for boot-time
   * resolution of `resolvedDeprecatedAt`.
   */
  private readonly handlerIndex = new Map<RouteHandler, DeprecationRecord>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
    @Inject(SUNSET_OPTIONS_TOKEN)
    private readonly moduleOptions: SunsetModuleOptions,
  ) {}

  /**
   * Scans all registered NestJS controllers for `@Deprecated()` metadata.
   *
   * Called automatically by the NestJS lifecycle after all modules are
   * initialised. For each valid `@Deprecated()` endpoint:
   *   - Computes `resolvedDeprecatedAt` (once, from `options.deprecatedAt`
   *     or the current instant) and stores it in the record.
   *   - Emits a startup warning when the sunset date is within the configured
   *     threshold.
   *
   * Throws a single `Error` listing ALL configuration problems if any
   * `@Deprecated()` options are invalid (e.g. `sunset < deprecatedAt`).
   *
   * @throws {Error} When one or more endpoints have invalid date configuration.
   */
  async onApplicationBootstrap(): Promise<void> {
    const errors: string[] = [];

    for (const wrapper of this.discoveryService.getControllers()) {
      const instance: unknown = wrapper.instance;
      if (!this.isObject(instance)) continue;
      await this.scanController(instance, errors);
    }

    if (errors.length > 0) {
      throw new Error(this.buildBootError(errors));
    }
  }

  /**
   * Records a call to a deprecated endpoint by its handler function reference.
   *
   * Passed `context.getHandler()` from the interceptor — the same function
   * reference stored as the index key at boot time. The lookup is O(1) and
   * requires no string reconstruction or adapter-specific path extraction.
   *
   * @param handler - The handler function returned by `context.getHandler()`.
   *                  Silently ignored if the handler is not in the index.
   */
  recordCall(handler: RouteHandler): void {
    const record = this.handlerIndex.get(handler);

    if (record === undefined) return;

    record.callCount++;
    record.lastCalledAt = new Date();
  }

  /**
   * Returns the full `DeprecationRecord` for a handler, or `undefined` if the
   * handler is not registered as deprecated.
   *
   * This is the **sole detection mechanism** used by the interceptor: if this
   * method returns a record, the endpoint is deprecated. The record contains
   * everything the interceptor needs — `resolvedDeprecatedAt` for the
   * `Deprecation` header, `options` for `Sunset`/`Link`, and
   * `routeDescription` for structured logs and hook events.
   *
   * Returning `Readonly<DeprecationRecord>` prevents the interceptor from
   * accidentally mutating internal registry state. `callCount` and
   * `lastCalledAt` are intentionally still mutable via `recordCall()`.
   *
   * @param handler - The handler function returned by `context.getHandler()`.
   */
  getRecord(handler: RouteHandler): Readonly<DeprecationRecord> | undefined {
    return this.handlerIndex.get(handler);
  }

  /**
   * Returns the canonical route description for a given handler, or
   * `undefined` if the handler is not registered as deprecated.
   *
   * @param handler - The handler function returned by `context.getHandler()`.
   */
  getRouteDescription(handler: RouteHandler): string | undefined {
    return this.handlerIndex.get(handler)?.routeDescription;
  }

  /**
   * Returns all registered deprecation records as a `ReadonlyArray`.
   *
   * Each record includes `resolvedDeprecatedAt`, the stable, boot-time
   * effective deprecation date, alongside the raw `options` from the
   * decorator, call counters, and the canonical route description.
   */
  getAll(): ReadonlyArray<DeprecationRecord> {
    return Array.from(this.handlerIndex.values());
  }

  private isObject(value: unknown): value is object {
    return value !== null && value !== undefined && typeof value === 'object';
  }

  private async scanController(instance: object, errors: string[]): Promise<void> {
    const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const controllerPath = this.extractControllerPath(proto);

    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    );

    for (const methodName of methodNames) {
      const rawHandler = proto[methodName];

      /* v8 ignore next */ if (typeof rawHandler !== 'function') continue;

      const options = this.reflector.get<DeprecatedOptions | undefined>(
        SUNSET_METADATA_KEY,
        rawHandler,
      );

      if (options === undefined) continue;

      const routeDescription = this.buildHandlerRoute(controllerPath, rawHandler as RouteHandler);
      const validation = validateDeprecationOptions(options, routeDescription);

      if (!validation.valid) {
        errors.push(validation.errorMessage);
        continue;
      }

      // Resolve the effective deprecation date once at boot time.
      // If options.deprecatedAt is absent, default to the current instant.
      // This value is stored in `resolvedDeprecatedAt` and used exclusively
      // by the interceptor to build the `Deprecation` HTTP header, ensuring
      // the header value is stable and deterministic for all subsequent
      // requests to this endpoint.
      const resolvedDeprecatedAt = toDate(options.deprecatedAt) ?? new Date();

      this.handlerIndex.set(rawHandler as RouteHandler, {
        routeDescription,
        options,
        resolvedDeprecatedAt,
        callCount: 0,
        lastCalledAt: null,
      });

      this.checkSunsetProximity(options, routeDescription);
      await patchSwaggerOperation(instance, methodName);
    }
  }

  private extractControllerPath(proto: Record<string, unknown>): string {
    const raw: unknown = Reflect.getMetadata('path', proto.constructor);

    /* v8 ignore next */ if (typeof raw !== 'string') return '';
    if (raw === '/') return '';

    return raw.replace(/^\//, '');
  }

  private buildHandlerRoute(controllerPath: string, handler: RouteHandler): string {
    const rawMethod: unknown = Reflect.getMetadata('method', handler);
    const rawPath: unknown = Reflect.getMetadata('path', handler);

    const methodStr =
      /* v8 ignore next */ typeof rawMethod === 'number'
        ? (HTTP_METHOD_NAMES.get(rawMethod) ?? 'UNKNOWN')
        : 'UNKNOWN';

    const parts = [controllerPath, rawPath].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    /* v8 ignore next */ const path = parts.length > 0 ? `/${parts.join('/')}` : '/';

    return `${methodStr} ${path}`;
  }

  private checkSunsetProximity(options: DeprecatedOptions, routeDescription: string): void {
    const sunset = toDate(options.sunset);
    if (sunset === null) return;

    const threshold = this.moduleOptions.sunsetWarningThresholdDays ?? 30;
    const daysUntilSunset = Math.floor((sunset.getTime() - Date.now()) / (1_000 * 60 * 60 * 24));

    if (daysUntilSunset < 0) {
      this.logger.warn(
        `[nestjs-sunset] SUNSET PASSED — ${routeDescription} should have been removed ` +
          `${String(Math.abs(daysUntilSunset))} day(s) ago (sunset was ${sunset.toISOString()}).`,
      );
    } else if (daysUntilSunset <= threshold) {
      this.logger.warn(
        `[nestjs-sunset] Sunset in ${String(daysUntilSunset)} day(s) — ${routeDescription} ` +
          `(sunset: ${sunset.toISOString()}).`,
      );
    }
  }

  private buildBootError(errors: string[]): string {
    const header = `[nestjs-sunset] ${String(errors.length)} configuration error(s) found at startup:`;
    return [header, ...errors].join('\n\n');
  }
}
