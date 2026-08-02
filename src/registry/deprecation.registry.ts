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
   * string reconstruction and guarantees O(1) lookup with adapter-agnostic
   * correctness (Express and Fastify, with or without URL parameters).
   */
  private readonly handlerIndex = new Map<(...args: unknown[]) => unknown, DeprecationRecord>();

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
   * initialised. Throws a single `Error` listing ALL configuration problems
   * if any `@Deprecated()` options are invalid.
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
   * This is the core of the B1 fix: the interceptor passes
   * `context.getHandler()` directly — no string reconstruction, no adapter-
   * specific path extraction. The same function reference that was stored in
   * `handlerIndex` at boot time is used as the lookup key at request time.
   *
   * @param handler - The handler function returned by `context.getHandler()`.
   * Silently ignored if the handler is not in the index (e.g.,
   * a non-deprecated endpoint or an uninitialised registry).
   */
  recordCall(handler: (...args: unknown[]) => unknown): void {
    const record = this.handlerIndex.get(handler);

    if (record === undefined) return;

    record.callCount++;
    record.lastCalledAt = new Date();
  }

  /**
   * Returns the canonical route description for a given handler, or
   * `undefined` if the handler is not registered as deprecated.
   *
   * The description is built once at boot time from NestJS Reflect metadata
   * (e.g. `"GET /v1/users/:id"`) and is the single source of truth for the
   * `endpoint` field in structured logs and `DeprecationEvent` hooks.
   *
   * @param handler - The handler function returned by `context.getHandler()`.
   */
  getRouteDescription(handler: (...args: unknown[]) => unknown): string | undefined {
    return this.handlerIndex.get(handler)?.routeDescription;
  }

  /**
   * Returns all registered deprecation records as a `ReadonlyArray`.
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

      const routeDescription = this.buildHandlerRoute(
        controllerPath,
        rawHandler as (...args: unknown[]) => unknown,
      );
      const validation = validateDeprecationOptions(options, routeDescription);

      if (!validation.valid) {
        errors.push(validation.errorMessage);
        continue;
      }

      // Store the record indexed by the handler function reference.
      // The same reference will be passed by the interceptor via
      // `context.getHandler()`, making the lookup O(1) and adapter-agnostic.
      this.handlerIndex.set(rawHandler as (...args: unknown[]) => unknown, {
        routeDescription,
        options,
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

  private buildHandlerRoute(
    controllerPath: string,
    handler: (...args: unknown[]) => unknown,
  ): string {
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
