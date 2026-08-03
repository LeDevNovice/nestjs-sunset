import { lastValueFrom, of, tap } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DeprecationInterceptor } from '../../../src/interceptors/deprecation.interceptor';
import { SUNSET_OPTIONS_TOKEN } from '../../../src/module/sunset.module-definition';
import type { SunsetModuleOptions } from '../../../src/module/sunset-module.options';
import { DeprecationRegistry } from '../../../src/registry/deprecation.registry';
import type { DeprecatedOptions } from '../../../src/types/deprecated-options.type';
import type { DeprecationEvent } from '../../../src/types/deprecation-event.type';
import type { DeprecationRecord } from '../../../src/types/deprecation-record.type';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FULL_OPTIONS: DeprecatedOptions = {
  deprecatedAt: new Date('2025-01-01T00:00:00.000Z'),
  sunset: new Date('2027-01-01T00:00:00.000Z'),
  link: '/docs/migration/v2-users',
  message: 'Use GET /v2/users',
};

const RESOLVED_DEPRECATED_AT = new Date('2025-01-01T00:00:00.000Z');

/** Full DeprecationRecord as returned by registry.getRecord() */
const FULL_RECORD: DeprecationRecord = {
  routeDescription: 'GET /v1/users',
  options: FULL_OPTIONS,
  resolvedDeprecatedAt: RESOLVED_DEPRECATED_AT,
  callCount: 0,
  lastCalledAt: null,
};

class MockController {}

function makeMockResponse() {
  return { header: vi.fn() };
}

function makeMockCallHandler(payload: unknown = { data: 'ok' }) {
  return { handle: vi.fn().mockReturnValue(of(payload)) };
}

// The canonical handler function reference returned by context.getHandler().
const MOCK_HANDLER = function mockHandler() {};

function makeMockContext(response = makeMockResponse()): ExecutionContext {
  return {
    getHandler: vi.fn().mockReturnValue(MOCK_HANDLER),
    getClass: vi.fn().mockReturnValue(MockController),
    switchToHttp: vi.fn().mockReturnValue({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/v1/users' }),
    }),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeprecationInterceptor', () => {
  let interceptor: DeprecationInterceptor;
  let mockRegistry: {
    getRecord: ReturnType<typeof vi.fn>;
    recordCall: ReturnType<typeof vi.fn>;
  };
  let mockOptions: SunsetModuleOptions;
  let warnSpy: MockInstance;

  beforeEach(async () => {
    mockRegistry = {
      getRecord: vi.fn(),
      recordCall: vi.fn(),
    };
    mockOptions = {};

    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined);

    const module = await Test.createTestingModule({
      providers: [
        DeprecationInterceptor,
        { provide: DeprecationRegistry, useValue: mockRegistry },
        { provide: SUNSET_OPTIONS_TOKEN, useValue: mockOptions },
      ],
    }).compile();

    interceptor = module.get(DeprecationInterceptor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // When the handler IS registered as deprecated
  // -------------------------------------------------------------------------

  describe('when registry.getRecord() returns a DeprecationRecord', () => {
    let mockResponse: ReturnType<typeof makeMockResponse>;
    let mockContext: ExecutionContext;
    let mockCallHandler: ReturnType<typeof makeMockCallHandler>;

    beforeEach(() => {
      mockRegistry.getRecord.mockReturnValue(FULL_RECORD);
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

    it('should inject a Deprecation header derived from record.resolvedDeprecatedAt — "@<seconds>" format', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const calls = mockResponse.header.mock.calls;
      const depCall = calls.find(([name]) => name === 'Deprecation');

      expect(depCall).toBeDefined();
      // resolvedDeprecatedAt = 2025-01-01T00:00:00Z = 1735689600 unix seconds
      expect(depCall![1]).toBe('@1735689600');
    });

    it('should produce the same Deprecation header value on every request (determinism)', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));
      await lastValueFrom(interceptor.intercept(mockContext, makeMockCallHandler() as CallHandler));

      const allDeprecationCalls = mockResponse.header.mock.calls.filter(
        ([name]) => name === 'Deprecation',
      );

      expect(allDeprecationCalls[0]?.[1]).toBe(allDeprecationCalls[1]?.[1]);
    });

    it('should inject a Sunset header when record.options.sunset is provided', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const calls = mockResponse.header.mock.calls;
      const sunsetCall = calls.find(([name]) => name === 'Sunset');

      expect(sunsetCall).toBeDefined();
      expect(sunsetCall![1]).toMatch(/GMT$/);
    });

    it('should NOT inject a Sunset header when record.options.sunset is absent', async () => {
      mockRegistry.getRecord.mockReturnValue({
        ...FULL_RECORD,
        options: { deprecatedAt: new Date('2025-01-01') },
      });

      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const sunsetCall = mockResponse.header.mock.calls.find(([name]) => name === 'Sunset');

      expect(sunsetCall).toBeUndefined();
    });

    it('should inject a Link header when record.options.link is provided', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const calls = mockResponse.header.mock.calls;
      const linkCall = calls.find(([name]) => name === 'Link');

      expect(linkCall).toBeDefined();
      expect(linkCall![1]).toContain('rel="deprecation"');
    });

    it('should NOT inject a Link header when record.options.link is absent', async () => {
      mockRegistry.getRecord.mockReturnValue({
        ...FULL_RECORD,
        options: { deprecatedAt: new Date('2025-01-01') },
      });

      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const linkCall = mockResponse.header.mock.calls.find(([name]) => name === 'Link');

      expect(linkCall).toBeUndefined();
    });

    it('should NOT call registry.recordCall() until the observable is subscribed', () => {
      interceptor.intercept(mockContext, mockCallHandler as CallHandler);

      expect(mockRegistry.recordCall).not.toHaveBeenCalled();
    });

    it('should call registry.recordCall() exactly once after subscription', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(mockRegistry.recordCall).toHaveBeenCalledOnce();
    });

    it('should call registry.recordCall() with the handler function reference from context.getHandler()', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(mockRegistry.recordCall).toHaveBeenCalledWith(MOCK_HANDLER);
      expect(mockRegistry.recordCall).not.toHaveBeenCalledWith(expect.any(String));
    });

    it('should call registry.recordCall() AFTER the handler emits, not before', async () => {
      const callOrder: string[] = [];

      mockRegistry.recordCall.mockImplementation(() => callOrder.push('recordCall'));
      mockCallHandler.handle.mockReturnValue(
        of('result').pipe(tap(() => callOrder.push('handler-emitted'))),
      );

      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(callOrder).toStrictEqual(['handler-emitted', 'recordCall']);
    });

    it('should use record.routeDescription as the endpoint in logs and hooks', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      const logArg = warnSpy.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(logArg?.['endpoint']).toBe('GET /v1/users');
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

  // -------------------------------------------------------------------------
  // When the handler is NOT registered as deprecated
  // -------------------------------------------------------------------------

  describe('when registry.getRecord() returns undefined (non-deprecated handler)', () => {
    let mockResponse: ReturnType<typeof makeMockResponse>;
    let mockContext: ExecutionContext;
    let mockCallHandler: ReturnType<typeof makeMockCallHandler>;

    beforeEach(() => {
      // getRecord returns undefined → handler is not deprecated
      mockRegistry.getRecord.mockReturnValue(undefined);
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

    it('should NOT call registry.recordCall()', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(mockRegistry.recordCall).not.toHaveBeenCalled();
    });

    it('should NOT emit a log entry', async () => {
      await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler as CallHandler));

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // registry.getRecord() is the SOLE detection mechanism
  // -------------------------------------------------------------------------

  describe('registry.getRecord() as sole detection mechanism', () => {
    it('should call getRecord with the handler function reference from context.getHandler()', () => {
      mockRegistry.getRecord.mockReturnValue(undefined);

      interceptor.intercept(makeMockContext(), makeMockCallHandler() as CallHandler);

      expect(mockRegistry.getRecord).toHaveBeenCalledWith(MOCK_HANDLER);
    });

    it('should call getRecord on every request (no caching at interceptor level)', async () => {
      mockRegistry.getRecord.mockReturnValue(undefined);
      const ctx = makeMockContext();

      await lastValueFrom(interceptor.intercept(ctx, makeMockCallHandler() as CallHandler));
      await lastValueFrom(interceptor.intercept(ctx, makeMockCallHandler() as CallHandler));

      expect(mockRegistry.getRecord).toHaveBeenCalledTimes(2);
    });
  });
});
