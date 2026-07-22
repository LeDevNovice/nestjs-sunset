import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DynamicModule } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { DeprecationInterceptor } from '../../../src/interceptors/deprecation.interceptor';
import { DeprecationRegistry } from '../../../src/registry/deprecation.registry';
import { SunsetModule } from '../../../src/module/sunset.module';
import type { SunsetModuleOptions } from '../../../src/module/sunset-module.options';

const FULL_OPTIONS: SunsetModuleOptions = {
  logLevel: 'warn',
  sunsetWarningThresholdDays: 60,
  onDeprecatedEndpointCalled: () => {
    /* hook */
  },
};

describe('SunsetModule', () => {
  beforeEach(() => {
    // Silence NestJS Logger during module compilation
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('forRoot() — module shape', () => {
    it('should not throw when called with no arguments', () => {
      expect(() => SunsetModule.forRoot()).not.toThrow();
    });

    it('should not throw when called with all options', () => {
      expect(() => SunsetModule.forRoot(FULL_OPTIONS)).not.toThrow();
    });

    it('should return a DynamicModule with SunsetModule as the module class', () => {
      const dyn: DynamicModule = SunsetModule.forRoot();

      expect(dyn.module).toBe(SunsetModule);
    });

    it('should has global at false value by default', () => {
      const dyn: DynamicModule = SunsetModule.forRoot();

      expect(dyn.global).toBe(false);
    });
  });

  describe('isGlobal', () => {
    it('should set global at true on the DynamicModule when isGlobal is true', () => {
      const dyn: DynamicModule = SunsetModule.forRoot({ isGlobal: true });

      expect(dyn.global).toBe(true);
    });

    it('should set global at false on the DynamicModule when isGlobal is false', () => {
      const dyn: DynamicModule = SunsetModule.forRoot({ isGlobal: false });

      expect(dyn.global).toBe(false);
    });

    it('should make DeprecationRegistry available without explicit import when global', async () => {
      const mod = await Test.createTestingModule({
        imports: [SunsetModule.forRoot({ isGlobal: true })],
      }).compile();

      const registry = mod.get(DeprecationRegistry, { strict: false });

      expect(registry).toBeInstanceOf(DeprecationRegistry);
    });
  });

  describe('forRoot() — DI', () => {
    it('should provide DeprecationRegistry via DI after module compilation', async () => {
      const mod = await Test.createTestingModule({
        imports: [SunsetModule.forRoot()],
      }).compile();

      const registry = mod.get(DeprecationRegistry, { strict: false });

      expect(registry).toBeInstanceOf(DeprecationRegistry);
    });

    it('should provide DeprecationRegistry with a working getAll() method', async () => {
      const mod = await Test.createTestingModule({
        imports: [SunsetModule.forRoot()],
      }).compile();

      const registry = mod.get(DeprecationRegistry, { strict: false });

      expect(registry.getAll()).toStrictEqual([]);
    });

    it('should register DeprecationInterceptor as the APP_INTERCEPTOR global interceptor', () => {
      const providers = Reflect.getMetadata('providers', SunsetModule) as Array<{
        provide?: unknown;
        useClass?: unknown;
      }>;

      const appInterceptorEntry = providers.find((p) => p.provide === APP_INTERCEPTOR);

      expect(appInterceptorEntry).toBeDefined();
      expect(appInterceptorEntry?.useClass).toBe(DeprecationInterceptor);
    });

    it('should export DeprecationRegistry so it can be injected by other modules', () => {
      const moduleExports = Reflect.getMetadata('exports', SunsetModule) as unknown[];

      expect(moduleExports).toContain(DeprecationRegistry);
    });
  });

  describe('forRootAsync()', () => {
    it('should not throw when called with useFactory returning an empty object', () => {
      expect(() => SunsetModule.forRootAsync({ useFactory: () => ({}) })).not.toThrow();
    });

    it('should return a DynamicModule with SunsetModule as the module class', () => {
      const dyn = SunsetModule.forRootAsync({ useFactory: () => ({}) });

      expect(dyn.module).toBe(SunsetModule);
    });

    it('should provide DeprecationRegistry via DI after async compilation', async () => {
      const mod = await Test.createTestingModule({
        imports: [
          SunsetModule.forRootAsync({
            useFactory: (): SunsetModuleOptions => ({ logLevel: 'log' }),
          }),
        ],
      }).compile();

      const registry = mod.get(DeprecationRegistry, { strict: false });

      expect(registry).toBeInstanceOf(DeprecationRegistry);
    });

    it('should accept a useFactory with an inject array without throwing at module creation time', () => {
      expect(() =>
        SunsetModule.forRootAsync({
          inject: ['SOME_TOKEN'],
          useFactory: (threshold: number): SunsetModuleOptions => ({
            sunsetWarningThresholdDays: threshold,
          }),
        }),
      ).not.toThrow();
    });
  });
});
