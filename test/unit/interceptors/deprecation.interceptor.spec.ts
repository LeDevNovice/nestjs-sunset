import { lastValueFrom, of, tap } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { SUNSET_METADATA_KEY } from '../../../src/decorators/deprecated.decorator';
import { DeprecationInterceptor } from '../../../src/interceptors/deprecation.interceptor';
import { SUNSET_OPTIONS_TOKEN } from '../../../src/module/sunset.module-definition';
import type { SunsetModuleOptions } from '../../../src/module/sunset-module.options';
import { DeprecationRegistry } from '../../../src/registry/deprecation.registry';
import type { DeprecatedOptions } from '../../../src/types/deprecated-options.type';
import type { DeprecationEvent } from '../../../src/types/deprecation-event.type';

const FULL_OPTIONS: DeprecatedOptions = {
  deprecatedAt: new Date('2025-01-01T00:00:00.000Z'),
  sunset: new Date('2027-01-01T00:00:00.000Z'),
  link: '/docs/migration/v2-users',
  message: 'Use GET /v2/users',
};

/** Minimal Nest controller double — not empty so no-extraneous-class stays happy. */
class MockController {
  handle(): void {
    // no-op test double
  }
}

function makeMockResponse() {
  return { header: vi.fn<(name: string, value: string) => void>() };
}

function makeMockRequest(method = 'GET', routePath = '/v1/users') {
  return { method, url: routePath, route: { path: routePath } };
}

function makeMockCallHandler(payload: unknown = { data: 'ok' }) {
  return { handle: vi.fn().mockReturnValue(of(payload)) };
}

function makeMockContext(
  response = makeMockResponse(),
  request = makeMockRequest(),
): ExecutionContext {
  return {
    getHandler: vi.fn().mockReturnValue(function mockHandler() {}),
    getClass: vi.fn().mockReturnValue(MockController),
    switchToHttp: vi.fn().mockReturnValue({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('DeprecationInterceptor', () => {
  let interceptor: DeprecationInterceptor;
  let mockReflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let mockRegistry: { increment: ReturnType<typeof vi.fn> };
  let mockOptions: SunsetModuleOptions;
  let warnSpy: MockInstance;

  beforeEach(async () => {
    mockReflector = { getAllAndOverride: vi.fn() };
    mockRegistry = { increment: vi.fn() };
    mockOptions = {};

    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined);

    const module = await Test.createTestingModule({
      providers: [
        DeprecationInterceptor,
        { provide: Reflector, useValue: mockReflector },
        { provide: DeprecationRegistry, useValue: mockRegistry },
        { provide: SUNSET_OPTIONS_TOKEN, useValue: mockOptions },
      ],
    }).compile();

    interceptor = module.get(DeprecationInterceptor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when @Deprecated() metadata is present', () => {
    let mockResponse: ReturnType<typeof makeMockResponse>;
    let mockContext: ExecutionContext;
    let mockCallHandler: ReturnType<typeof makeMockCallHandler>;

    beforeEach(() => {
      mockReflector.getAllAndOverride.mockReturnValue(FULL_OPTIONS);
      mockResponse = makeMockResponse();
      mockContext = makeMockContext(mockResponse);
      mockCallHandler = makeMockCallHandler();
    });

    it('should call response.header("Deprecation", ...) before next.handle() is invoked', () => {
      const callOrder: string[] = [];

      mockResponse.header.mockImplementation((name: string) => {
        callOrder.push(`header:${name}`);
      });
      mockCallHandler.handle.mockImplementation(() => {
        callOrder.push('handle');
        return of('ok');
      });

      interceptor.intercept(mockContext, mockCallHandler as CallHandler);

      const headerIdx = callOrder.indexOf('header:Deprecation');
      const handleIdx = callOrder.indexOf('handle');
      expect(headerIdx).toBeGreaterThanOrEqual(0);
      expect(handleIdx).toBeGreaterThanOrEqual(0);
      expect(headerIdx).toBeLessThan(handleIdx);
    });

    it('should inject a Deprecation header in "@<seconds>" Structured Field Date format', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const calls = mockResponse.header.mock.calls;
      const depCall = calls.find(([name]) => name === 'Deprecation');
      expect(depCall).toBeDefined();
      expect(depCall![1]).toMatch(/^@\d+$/);
    });

    it('should inject a Sunset header when options.sunset is provided', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const calls = mockResponse.header.mock.calls;
      const sunsetCall = calls.find(([name]) => name === 'Sunset');
      expect(sunsetCall).toBeDefined();
      expect(sunsetCall![1]).toMatch(/UTC$/);
    });

    it('should NOT inject a Sunset header when options.sunset is absent', async () => {
      mockReflector.getAllAndOverride.mockReturnValue({ deprecatedAt: new Date('2025-01-01') });

      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const sunsetCall = mockResponse.header.mock.calls.find(([name]) => name === 'Sunset');
      expect(sunsetCall).toBeUndefined();
    });

    it('should inject a Link header when options.link is provided', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const calls = mockResponse.header.mock.calls;
      const linkCall = calls.find(([name]) => name === 'Link');
      expect(linkCall).toBeDefined();
      expect(linkCall![1]).toContain('rel="deprecation"');
    });

    it('should NOT inject a Link header when options.link is absent', async () => {
      mockReflector.getAllAndOverride.mockReturnValue({ deprecatedAt: new Date('2025-01-01') });

      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const linkCall = mockResponse.header.mock.calls.find(([name]) => name === 'Link');
      expect(linkCall).toBeUndefined();
    });

    it('should NOT call registry.increment() until the observable is subscribed', () => {
      interceptor.intercept(mockContext, mockCallHandler as CallHandler);

      expect(mockRegistry.increment).not.toHaveBeenCalled();
    });

    it('should call registry.increment() exactly once after subscription', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(mockRegistry.increment).toHaveBeenCalledOnce();
    });

    it('should call registry.increment() with the route description derived from the request', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(mockRegistry.increment).toHaveBeenCalledWith('GET /v1/users');
    });

    it('should call registry.increment() AFTER the handler emits, not before', async () => {
      const callOrder: string[] = [];

      mockRegistry.increment.mockImplementation(() => callOrder.push('increment'));
      mockCallHandler.handle.mockReturnValue(
        of('result').pipe(tap(() => callOrder.push('handler-emitted'))),
      );

      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(callOrder).toStrictEqual(['handler-emitted', 'increment']);
    });

    it('should call onDeprecatedEndpointCalled hook when configured', async () => {
      const hookSpy = vi.fn<(event: DeprecationEvent) => void>();
      mockOptions.onDeprecatedEndpointCalled = hookSpy;

      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(hookSpy).toHaveBeenCalledOnce();

      const event = hookSpy.mock.calls[0]?.[0];
      expect(event).toBeDefined();
      expect(event).toEqual(
        expect.objectContaining({
          endpoint: 'GET /v1/users',
          options: FULL_OPTIONS,
        }),
      );
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(typeof event.daysUntilSunset).toBe('number');
    });

    it('should NOT call onDeprecatedEndpointCalled when hook is not configured', async () => {
      await expect(
        lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler)),
      ).resolves.toBeDefined();
    });

    it('should log at warn level by default via tap()', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('should log at the configured logLevel when set to "log"', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      mockOptions.logLevel = 'log';

      const freshModule = await Test.createTestingModule({
        providers: [
          DeprecationInterceptor,
          { provide: Reflector, useValue: mockReflector },
          { provide: DeprecationRegistry, useValue: mockRegistry },
          { provide: SUNSET_OPTIONS_TOKEN, useValue: mockOptions },
        ],
      }).compile();
      const freshInterceptor = freshModule.get(DeprecationInterceptor);

      warnSpy.mockClear();
      logSpy.mockClear();

      await lastValueFrom(freshInterceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(logSpy).toHaveBeenCalledOnce();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('when @Deprecated() metadata is absent', () => {
    let mockResponse: ReturnType<typeof makeMockResponse>;
    let mockContext: ExecutionContext;
    let mockCallHandler: ReturnType<typeof makeMockCallHandler>;

    beforeEach(() => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      mockResponse = makeMockResponse();
      mockContext = makeMockContext(mockResponse);
      mockCallHandler = makeMockCallHandler({ data: 'passthrough' });
    });

    it('should NOT call response.header() for any deprecation header', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(mockResponse.header).not.toHaveBeenCalled();
    });

    it('should pass the handler response through unmodified', async () => {
      const result = await lastValueFrom(
        interceptor.intercept(mockContext, mockCallHandler as CallHandler),
      );

      expect(result).toStrictEqual({ data: 'passthrough' });
    });

    it('should NOT call registry.increment()', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(mockRegistry.increment).not.toHaveBeenCalled();
    });

    it('should NOT emit a log entry', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('getAllAndOverride metadata lookup', () => {
    it('should read metadata with [handler, class] priority order and handler options should override controller', () => {
      const mockHandler = vi.fn();

      const ctx = {
        getHandler: vi.fn().mockReturnValue(mockHandler),
        getClass: vi.fn().mockReturnValue(MockController),
        switchToHttp: vi.fn().mockReturnValue({
          getResponse: () => makeMockResponse(),
          getRequest: () => makeMockRequest(),
        }),
      } as unknown as ExecutionContext;

      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      interceptor.intercept(ctx, makeMockCallHandler() as CallHandler);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(SUNSET_METADATA_KEY, [
        mockHandler,
        MockController,
      ]);
    });
  });
});
