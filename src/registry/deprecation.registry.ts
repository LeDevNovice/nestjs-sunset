import { Injectable, Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

import { SUNSET_METADATA_KEY } from '../decorators/deprecated.decorator';
import { toDate } from '../core/date-converter';
import { validateDeprecationOptions } from '../core/sunset-validator';
import { SUNSET_OPTIONS_TOKEN } from '../module/sunset.module-definition';
import type { SunsetModuleOptions } from '../module/sunset-module.options';
import type { DeprecatedOptions } from '../types/deprecated-options.type';
import type { DeprecationRecord } from '../types/deprecation-record.type';

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

@Injectable()
export class DeprecationRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeprecationRegistry.name);
  private readonly records = new Map<string, DeprecationRecord>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
    @Inject(SUNSET_OPTIONS_TOKEN)
    private readonly moduleOptions: SunsetModuleOptions,
  ) {}

  onApplicationBootstrap(): void {
    const errors: string[] = [];

    for (const wrapper of this.discoveryService.getControllers()) {
      const instance: unknown = wrapper.instance;
      if (!this.isObject(instance)) continue;
      this.scanController(instance, errors);
    }

    if (errors.length > 0) {
      throw new Error(this.buildBootError(errors));
    }
  }

  increment(routeDescription: string): void {
    const record = this.records.get(routeDescription);
    if (record === undefined) return;
    record.callCount++;
    record.lastCalledAt = new Date();
  }

  getAll(): ReadonlyArray<DeprecationRecord> {
    return Array.from(this.records.values());
  }

  private isObject(value: unknown): value is object {
    return value !== null && value !== undefined && typeof value === 'object';
  }

  private scanController(instance: object, errors: string[]): void {
    const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const controllerPath = this.extractControllerPath(proto);

    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    );

    for (const methodName of methodNames) {
      const rawHandler = proto[methodName];
      if (typeof rawHandler !== 'function') continue;

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

      this.records.set(routeDescription, {
        routeDescription,
        options,
        callCount: 0,
        lastCalledAt: null,
      });

      this.checkSunsetProximity(options, routeDescription);
    }
  }

  private extractControllerPath(proto: Record<string, unknown>): string {
    const raw: unknown = Reflect.getMetadata('path', proto.constructor);
    return typeof raw === 'string' ? raw : '';
  }

  private buildHandlerRoute(
    controllerPath: string,
    handler: (...args: unknown[]) => unknown,
  ): string {
    const rawMethod: unknown = Reflect.getMetadata('method', handler);
    const rawPath: unknown = Reflect.getMetadata('path', handler);

    const methodStr =
      typeof rawMethod === 'number' ? (HTTP_METHOD_NAMES.get(rawMethod) ?? 'UNKNOWN') : 'UNKNOWN';

    const parts = [controllerPath, rawPath].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    const path = parts.length > 0 ? `/${parts.join('/')}` : '/';

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
