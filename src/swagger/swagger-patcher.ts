/**
 * Optional OpenAPI/Swagger integration.
 *
 * This module patches the `deprecated: true` field onto the API operation
 * metadata of `@Deprecated()` handlers when `@nestjs/swagger` is present in
 * the project. It is completely optional — if the package is absent, the
 * function returns immediately without any error or warning.
 *
 * @param instance   - The controller instance (not its class / prototype).
 * @param methodName - The name of the handler method on the controller.
 */
export async function patchSwaggerOperation(instance: object, methodName: string): Promise<void> {
  try {
    const swagger = await import('@nestjs/swagger').catch(() => null);

    if (swagger === null) return;

    const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const handler = proto[methodName];

    if (typeof handler !== 'function') return;

    const rawMeta = Reflect.getMetadata(swagger.DECORATORS.API_OPERATION, handler) as
      Record<string, unknown> | undefined;

    const existingMeta: Record<string, unknown> = rawMeta ?? {};

    Reflect.defineMetadata(
      swagger.DECORATORS.API_OPERATION,
      { ...existingMeta, deprecated: true },
      handler,
    );
  } catch {
    // SwaggerPatcher must never interrupt the application lifecycle.
  }
}
