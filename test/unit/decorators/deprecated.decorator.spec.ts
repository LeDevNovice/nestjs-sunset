import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { Deprecated, SUNSET_METADATA_KEY } from '../../../src/decorators/deprecated.decorator';
import type { DeprecatedOptions } from '../../../src/types/deprecated-options.type';

function getDeprecatedMetadata(
  prototype: object,
  methodName: string,
): DeprecatedOptions | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);

  if (!descriptor || typeof descriptor.value !== 'function') {
    return undefined;
  }

  const method = descriptor.value as object;

  return Reflect.getMetadata(SUNSET_METADATA_KEY, method) as DeprecatedOptions | undefined;
}

describe('@Deprecated()', () => {
  it('should return a function (satisfies the MethodDecorator contract)', () => {
    expect(typeof Deprecated()).toBe('function');
    expect(typeof Deprecated({ message: 'test' })).toBe('function');
  });

  it('should work with no arguments and store an empty-object as metadata', () => {
    class TestClass {
      @Deprecated()
      myMethod() {}
    }

    const stored = getDeprecatedMetadata(TestClass.prototype, 'myMethod');

    expect(stored).toEqual({});
  });

  it('should store the provided options as Reflect metadata on the decorated handler', () => {
    const options: DeprecatedOptions = { message: 'use /v2/users' };

    class TestClass {
      @Deprecated(options)
      myMethod() {}
    }

    const stored = getDeprecatedMetadata(TestClass.prototype, 'myMethod');

    expect(stored).toEqual(options);
  });

  it('should store all four option fields when all are provided', () => {
    const options: DeprecatedOptions = {
      deprecatedAt: new Date('2025-01-01'),
      sunset: new Date('2026-01-01'),
      link: '/docs/migration/v2-users',
      message: 'Use GET /v2/users',
    };

    class TestClass {
      @Deprecated(options)
      myMethod() {}
    }

    const stored = getDeprecatedMetadata(TestClass.prototype, 'myMethod');

    expect(stored).toEqual(options);
  });

  it('should store the exact options reference without copying or mutating', () => {
    const options: DeprecatedOptions = { message: 'test' };

    class TestClass {
      @Deprecated(options)
      myMethod() {}
    }

    const stored = getDeprecatedMetadata(TestClass.prototype, 'myMethod');

    expect(stored).toBe(options);
  });

  it('should hold independent metadata for each decorated handler and not shared between methods', () => {
    const optsA: DeprecatedOptions = { message: 'handler A is deprecated' };
    const optsB: DeprecatedOptions = { message: 'handler B is deprecated' };

    class TestClass {
      @Deprecated(optsA)
      methodA() {}

      @Deprecated(optsB)
      methodB() {}
    }

    expect(getDeprecatedMetadata(TestClass.prototype, 'methodA')).toBe(optsA);
    expect(getDeprecatedMetadata(TestClass.prototype, 'methodB')).toBe(optsB);
  });

  it('should leave undecorated handlers without metadata @Deprecated() is not applied globally', () => {
    class TestClass {
      undecorated() {}
    }

    const stored = getDeprecatedMetadata(TestClass.prototype, 'undecorated');

    expect(stored).toBeUndefined();
  });

  it('should be a Symbol and never a string', () => {
    expect(typeof SUNSET_METADATA_KEY).toBe('symbol');
  });

  it('should have the expected namespaced description for debuggability', () => {
    expect(SUNSET_METADATA_KEY.description).toBe('nestjs-sunset:deprecated');
  });

  it('should be not exported from the public barrel src/index.ts', () => {
    const indexPath = fileURLToPath(new URL('../../../src/index.ts', import.meta.url));
    const indexSource = readFileSync(indexPath, 'utf-8');
    const exportLines = indexSource.split('\n').filter((line) => /^export/.test(line));
    const isExported = exportLines.some((line) => line.includes('SUNSET_METADATA_KEY'));

    expect(isExported).toBe(false);
  });
});
