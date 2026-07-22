import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { Logger } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { SUNSET_METADATA_KEY } from '../../../src/decorators/deprecated.decorator';
import { SUNSET_OPTIONS_TOKEN } from '../../../src/module/sunset.module-definition';
import type { SunsetModuleOptions } from '../../../src/module/sunset-module.options';
import { DeprecationRegistry } from '../../../src/registry/deprecation.registry';
import type { DeprecatedOptions } from '../../../src/types/deprecated-options.type';

function makeHandler(opts?: {
  deprecated?: DeprecatedOptions;
  httpMethod?: number;
  httpPath?: string;
}): () => void {
  function handler() {}
  if (opts?.httpMethod !== undefined) Reflect.defineMetadata('method', opts.httpMethod, handler);
  if (opts?.httpPath !== undefined) Reflect.defineMetadata('path', opts.httpPath, handler);
  if (opts?.deprecated !== undefined)
    Reflect.defineMetadata(SUNSET_METADATA_KEY, opts.deprecated, handler);
  return handler;
}

function makeWrapper(
  controllerPath: string,
  handlers: Record<string, () => void>,
): { instance: object } {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest metadata host
  class Ctrl {}
  Reflect.defineMetadata('path', controllerPath, Ctrl);
  for (const [name, fn] of Object.entries(handlers)) {
    Object.defineProperty(Ctrl.prototype, name, {
      value: fn,
      configurable: true,
      enumerable: true,
    });
  }
  return { instance: new Ctrl() };
}

const VALID_OPTIONS: DeprecatedOptions = {
  deprecatedAt: new Date('2025-01-01T00:00:00.000Z'),
  sunset: new Date('2099-12-31T00:00:00.000Z'),
  message: 'Use /v2/users',
};

const INVALID_OPTIONS: DeprecatedOptions = {
  deprecatedAt: new Date('2026-01-01T00:00:00.000Z'),
  sunset: new Date('2025-01-01T00:00:00.000Z'),
};

describe('DeprecationRegistry', () => {
  let registry: DeprecationRegistry;
  let mockDiscovery: { getControllers: ReturnType<typeof vi.fn> };
  let mockOptions: SunsetModuleOptions;
  let warnSpy: MockInstance;

  beforeEach(async () => {
    mockDiscovery = { getControllers: vi.fn().mockReturnValue([]) };
    mockOptions = {};

    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      /* no-op */
    });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {
      /* no-op */
    });

    const module = await Test.createTestingModule({
      providers: [
        DeprecationRegistry,
        { provide: DiscoveryService, useValue: mockDiscovery },
        { provide: Reflector, useValue: new Reflector() },
        { provide: SUNSET_OPTIONS_TOKEN, useValue: mockOptions },
      ],
    }).compile();

    registry = module.get(DeprecationRegistry);
    warnSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onApplicationBootstrap', () => {
    it('should scan all controllers returned by DiscoveryService', async () => {
      const handler = makeHandler({
        deprecated: VALID_OPTIONS,
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await registry.onApplicationBootstrap();

      expect(mockDiscovery.getControllers).toHaveBeenCalledOnce();
    });

    it('should register valid endpoints in the internal Map and getAll() should return them', async () => {
      const handler = makeHandler({
        deprecated: VALID_OPTIONS,
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await registry.onApplicationBootstrap();

      const records = registry.getAll();

      expect(records).toHaveLength(1);
      expect(records[0]?.routeDescription).toBe('GET /v1/users');
      expect(records[0]?.options).toBe(VALID_OPTIONS);
    });

    it('should skip methods without @Deprecated() metadata', async () => {
      const decorated = makeHandler({ deprecated: VALID_OPTIONS, httpMethod: 0, httpPath: 'a' });
      const bare = makeHandler({ httpMethod: 1, httpPath: 'b' });
      mockDiscovery.getControllers.mockReturnValue([
        makeWrapper('v1', { methodA: decorated, methodB: bare }),
      ]);

      await registry.onApplicationBootstrap();

      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getAll()[0]?.routeDescription).toBe('GET /v1/a');
    });

    it('should throw an Error when sunset < deprecatedAt', async () => {
      const handler = makeHandler({
        deprecated: INVALID_OPTIONS,
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await expect(registry.onApplicationBootstrap()).rejects.toThrow(Error);
    });

    it('should contain the route description of the misconfigured endpoint in the error message', async () => {
      const handler = makeHandler({
        deprecated: INVALID_OPTIONS,
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await expect(registry.onApplicationBootstrap()).rejects.toThrow(/GET \/v1\/users/);
    });

    it('should contain RFC 9745 in the error message', async () => {
      const handler = makeHandler({ deprecated: INVALID_OPTIONS, httpMethod: 1, httpPath: 'x' });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('', { h: handler })]);

      await expect(registry.onApplicationBootstrap()).rejects.toThrow(/RFC 9745/);
    });

    it('should collect all invalid endpoints into a single Error and not stop at the first', async () => {
      const invalidA = makeHandler({ deprecated: INVALID_OPTIONS, httpMethod: 0, httpPath: 'a' });
      const invalidB = makeHandler({ deprecated: INVALID_OPTIONS, httpMethod: 1, httpPath: 'b' });
      mockDiscovery.getControllers.mockReturnValue([
        makeWrapper('v1', { handlerA: invalidA, handlerB: invalidB }),
      ]);

      await expect(registry.onApplicationBootstrap()).rejects.toThrow(/\/v1\/a[\s\S]*\/v1\/b/);
    });

    it('should emit Logger.warn when sunset is within the default 30-day threshold', async () => {
      const nearSunset = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
      const handler = makeHandler({
        deprecated: { deprecatedAt: new Date('2025-01-01'), sunset: nearSunset },
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await registry.onApplicationBootstrap();

      expect(warnSpy).toHaveBeenCalled();
    });

    it('should emit Logger.warn when sunset has already passed', async () => {
      const pastSunset = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const handler = makeHandler({
        deprecated: {
          deprecatedAt: new Date('2020-01-01'),
          sunset: pastSunset,
        },
        httpMethod: 0,
        httpPath: 'old',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getOld: handler })]);

      await registry.onApplicationBootstrap();

      expect(warnSpy).toHaveBeenCalled();
    });

    it('should not emit a warn when no sunset is defined', async () => {
      const handler = makeHandler({
        deprecated: { deprecatedAt: new Date('2025-01-01') }, // no sunset
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await registry.onApplicationBootstrap();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should respect a custom sunsetWarningThresholdDays from module options', async () => {
      mockOptions.sunsetWarningThresholdDays = 60;

      const nearSunset = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
      const handler = makeHandler({
        deprecated: { deprecatedAt: new Date('2025-01-01'), sunset: nearSunset },
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await registry.onApplicationBootstrap();

      expect(warnSpy).toHaveBeenCalled();
    });

    it('should handle controllers with no methods gracefully', async () => {
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', {})]);

      await expect(registry.onApplicationBootstrap()).resolves.not.toThrow();
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should handle a null/undefined instance in the wrapper gracefully', async () => {
      mockDiscovery.getControllers.mockReturnValue([{ instance: null }]);

      await expect(registry.onApplicationBootstrap()).resolves.not.toThrow();
    });
  });

  describe('increment', () => {
    const ROUTE = 'GET /v1/users';

    beforeEach(async () => {
      const handler = makeHandler({
        deprecated: VALID_OPTIONS,
        httpMethod: 0,
        httpPath: 'users',
      });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);
      await registry.onApplicationBootstrap();
    });

    it('should increment callCount on a registered endpoint', () => {
      registry.increment(ROUTE);

      expect(registry.getAll()[0]?.callCount).toBe(1);
    });

    it('should accumulate across multiple calls', () => {
      registry.increment(ROUTE);
      registry.increment(ROUTE);
      registry.increment(ROUTE);

      expect(registry.getAll()[0]?.callCount).toBe(3);
    });

    it('should update lastCalledAt to approximately now', () => {
      const before = new Date();
      registry.increment(ROUTE);
      const after = new Date();

      const lastCalledAt = registry.getAll()[0]?.lastCalledAt;

      expect(lastCalledAt).not.toBeNull();
      expect(lastCalledAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastCalledAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should be a silent no-op for unknown route descriptions and never throw', () => {
      expect(() => {
        registry.increment('DELETE /route/that/does/not/exist');
      }).not.toThrow();
    });

    it('should leave registered endpoints unaffected when an unknown route is incremented', () => {
      registry.increment('DELETE /unknown');

      expect(registry.getAll()[0]?.callCount).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return an empty array before any endpoints are registered', () => {
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should return all registered records after bootstrap', async () => {
      const h1 = makeHandler({ deprecated: VALID_OPTIONS, httpMethod: 0, httpPath: 'a' });
      const h2 = makeHandler({ deprecated: VALID_OPTIONS, httpMethod: 1, httpPath: 'b' });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { a: h1, b: h2 })]);

      await registry.onApplicationBootstrap();

      expect(registry.getAll()).toHaveLength(2);
    });

    it('should initialise callCount at 0 and lastCalledAt as null for new records', async () => {
      const handler = makeHandler({ deprecated: VALID_OPTIONS, httpMethod: 0, httpPath: 'users' });
      mockDiscovery.getControllers.mockReturnValue([makeWrapper('v1', { getUsers: handler })]);

      await registry.onApplicationBootstrap();

      expect(registry.getAll()[0]?.callCount).toBe(0);
      expect(registry.getAll()[0]?.lastCalledAt).toBeNull();
    });

    it('should return ReadonlyArray and the TypeScript type prevents push/pop at compile time', () => {
      const result = registry.getAll();

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
