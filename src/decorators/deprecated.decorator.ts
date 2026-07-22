import { SetMetadata } from '@nestjs/common';

import type { DeprecatedOptions } from '../types/deprecated-options.type';

/**
 * Internal Reflect metadata key used to attach Deprecated options to a
 * handler function.
 */
export const SUNSET_METADATA_KEY = Symbol('nestjs-sunset:deprecated');

/**
 * Marks a REST endpoint handler as deprecated.
 *
 * @param options - Deprecation metadata. All fields are optional; calling
 *                  `@Deprecated()` with no arguments is valid and signals an
 *                  immediate, unscheduled deprecation.
 *
 * @example Minimal — deprecation effective immediately, no sunset date
 * ```typescript
 * @Deprecated()
 * @Get('v1/users')
 * async listUsersLegacy() { ... }
 * ```
 *
 * @example Full — with sunset date and migration link
 * ```typescript
 * @Deprecated({
 *   deprecatedAt: '2025-06-01',
 *   sunset:       '2026-01-01',
 *   link:         '/docs/migration/v2-users',
 *   message:      'Use GET /v2/users — supports cursor-based pagination',
 * })
 * @Get('v1/users')
 * async listUsersLegacy() { ... }
 * ```
 */
export function Deprecated(options: DeprecatedOptions = {}): MethodDecorator {
  return SetMetadata(SUNSET_METADATA_KEY, options);
}
