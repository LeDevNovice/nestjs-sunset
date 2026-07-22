import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { SUNSET_METADATA_KEY } from '../../../src/decorators/deprecated.decorator';
import { DeprecationRegistry } from '../../../src/registry/deprecation.registry';
import { TestController } from './test.controller';
import { TestAppModule } from './test-app.module';

type Handler = (...args: never[]) => unknown;

function getHandler(name: keyof TestController): Handler {
  const descriptor = Object.getOwnPropertyDescriptor(TestController.prototype, name);
  if (descriptor === undefined || typeof descriptor.value !== 'function') {
    throw new Error(`Handler "${name}" not found on TestController`);
  }
  return descriptor.value as Handler;
}

describe('TestAppModule fixture', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await moduleRef.close();
  });

  it('should compile without error', () => {
    expect(moduleRef).toBeDefined();
  });

  it('should provide TestController via DI', () => {
    const ctrl = moduleRef.get(TestController, { strict: false });

    expect(ctrl).toBeInstanceOf(TestController);
  });

  it('should have TestController with exactly three handler methods', () => {
    const ctrl = moduleRef.get(TestController, { strict: false });
    const proto = Object.getPrototypeOf(ctrl) as Record<string, unknown>;
    const methods = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor');

    expect(methods).toHaveLength(3);
    expect(methods).toContain('getDeprecatedFull');
    expect(methods).toContain('getDeprecatedMinimal');
    expect(methods).toContain('getActive');
  });

  it('should have getDeprecatedFull and getDeprecatedMinimal with distinct HTTP paths', () => {
    const fullPath: unknown = Reflect.getMetadata('path', getHandler('getDeprecatedFull'));
    const minPath: unknown = Reflect.getMetadata('path', getHandler('getDeprecatedMinimal'));
    const activePath: unknown = Reflect.getMetadata('path', getHandler('getActive'));

    expect(fullPath).toBe('deprecated-full');
    expect(minPath).toBe('deprecated-minimal');
    expect(activePath).toBe('active');
    expect(new Set([fullPath, minPath, activePath]).size).toBe(3);
  });

  it('should have getDeprecatedFull carries full @Deprecated() options', () => {
    const meta = Reflect.getMetadata(SUNSET_METADATA_KEY, getHandler('getDeprecatedFull')) as
      Record<string, unknown> | undefined;

    expect(meta).toBeDefined();
    expect(meta?.link).toBe('/docs/migration');
    expect(meta?.sunset).toEqual(new Date('2027-01-01'));
    expect(meta?.deprecatedAt).toEqual(new Date('2025-01-01'));
  });

  it('should have getDeprecatedMinimal carries an empty options object from @Deprecated()', () => {
    const meta = Reflect.getMetadata(SUNSET_METADATA_KEY, getHandler('getDeprecatedMinimal')) as
      Record<string, unknown> | undefined;

    expect(meta).toBeDefined();
    expect(meta).toStrictEqual({});
  });

  it('should have getActive with NO @Deprecated() metadata', () => {
    const meta: unknown = Reflect.getMetadata(SUNSET_METADATA_KEY, getHandler('getActive'));

    expect(meta).toBeUndefined();
  });

  it('should have DeprecationRegistry that register exactly 2 deprecated endpoints when bootstrapped', async () => {
    const registry = moduleRef.get(DeprecationRegistry, { strict: false });
    await registry.onApplicationBootstrap();

    const records = registry.getAll();
    expect(records).toHaveLength(2);

    const routes = records.map((r) => r.routeDescription);
    expect(routes).toContain('GET /deprecated-full');
    expect(routes).toContain('GET /deprecated-minimal');
  });

  it('should have deprecated-full record has the exact configured options after bootstrap', async () => {
    const registry = moduleRef.get(DeprecationRegistry, { strict: false });
    await registry.onApplicationBootstrap();

    const record = registry.getAll().find((r) => r.routeDescription === 'GET /deprecated-full');

    expect(record).toBeDefined();
    expect(record?.options.link).toBe('/docs/migration');
    expect(record?.options.sunset).toEqual(new Date('2027-01-01'));
    expect(record?.callCount).toBe(0);
    expect(record?.lastCalledAt).toBeNull();
  });
});
