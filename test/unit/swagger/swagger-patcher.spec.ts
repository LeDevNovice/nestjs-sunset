import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeInstance(
  methodName: string,
  opts?: { existingMeta?: Record<string, unknown> },
): { instance: object; handler: () => void } {
  class Ctrl {
    handle(): void {
      // no-op test double
    }
  }

  function handler() {}

  Object.defineProperty(Ctrl.prototype, methodName, {
    value: handler,
    configurable: true,
    enumerable: true,
  });

  if (opts?.existingMeta) {
    Reflect.defineMetadata('swagger/apiOperation', opts.existingMeta, handler);
  }

  return { instance: new Ctrl(), handler };
}

describe('patchSwaggerOperation', () => {
  describe('when @nestjs/swagger is absent (import rejects)', () => {
    beforeEach(() => {
      vi.doMock('@nestjs/swagger', () => {
        throw new Error('@nestjs/swagger is not installed');
      });
      vi.resetModules();
    });

    afterEach(() => {
      vi.doUnmock('@nestjs/swagger');
      vi.resetModules();
    });

    it('should return void silently and does not throw or reject', async () => {
      const { patchSwaggerOperation } = await import('../../../src/swagger/swagger-patcher');
      const { instance } = makeInstance('getUsers');

      await expect(patchSwaggerOperation(instance, 'getUsers')).resolves.toBeUndefined();
    });

    it('should leave the handler without any API_OPERATION metadata', async () => {
      const { patchSwaggerOperation } = await import('../../../src/swagger/swagger-patcher');
      const { instance, handler } = makeInstance('getUsers');

      await patchSwaggerOperation(instance, 'getUsers');

      const meta: unknown = Reflect.getMetadata('swagger/apiOperation', handler);

      expect(meta).toBeUndefined();
    });
  });

  describe('when @nestjs/swagger is present', () => {
    let patchSwaggerOperation: Awaited<
      typeof import('../../../src/swagger/swagger-patcher')
    >['patchSwaggerOperation'];

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../../../src/swagger/swagger-patcher');
      patchSwaggerOperation = mod.patchSwaggerOperation;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should ses deprecated: true on the handler's API_OPERATION metadata", async () => {
      const { instance, handler } = makeInstance('getUsers');

      await patchSwaggerOperation(instance, 'getUsers');

      const meta = Reflect.getMetadata('swagger/apiOperation', handler) as Record<string, unknown>;

      expect(meta).toBeDefined();
      expect(meta.deprecated).toBe(true);
    });

    it('should preserve pre-existing @ApiOperation metadata (summary, description, etc...)', async () => {
      const { instance, handler } = makeInstance('getUsers', {
        existingMeta: {
          summary: 'List users',
          description: 'Returns all users',
          deprecated: false,
        },
      });

      await patchSwaggerOperation(instance, 'getUsers');

      const meta = Reflect.getMetadata('swagger/apiOperation', handler) as Record<string, unknown>;

      expect(meta.deprecated).toBe(true);
      expect(meta.summary).toBe('List users');
      expect(meta.description).toBe('Returns all users');
    });

    it('should be idempotent and calling twice should produce the same result as calling once', async () => {
      const { instance, handler } = makeInstance('getUsers', {
        existingMeta: { summary: 'original' },
      });

      await patchSwaggerOperation(instance, 'getUsers');
      await patchSwaggerOperation(instance, 'getUsers');

      const meta = Reflect.getMetadata('swagger/apiOperation', handler) as Record<string, unknown>;

      expect(meta.deprecated).toBe(true);
      expect(meta.summary).toBe('original');
      expect(Object.keys(meta)).toHaveLength(2);
    });

    it('should not throw even if Reflect.getMetadata throws an unexpected error', async () => {
      vi.spyOn(Reflect, 'getMetadata').mockImplementation(() => {
        throw new Error('Reflect.getMetadata failed unexpectedly');
      });

      const { instance } = makeInstance('getUsers');

      await expect(patchSwaggerOperation(instance, 'getUsers')).resolves.toBeUndefined();
    });

    it('should be a no-op for a method name that does not exist on the instance', async () => {
      const { instance } = makeInstance('getUsers');

      await expect(patchSwaggerOperation(instance, 'nonExistent')).resolves.toBeUndefined();
    });
  });
});
