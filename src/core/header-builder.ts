/**
 * RFC-compliant HTTP deprecation header builder.
 */

import type { DeprecatedOptions } from '../types/deprecated-options.type';
import { toDate, toIMFFixdate, toStructuredFieldDate } from './date-converter';

/**
 * The HTTP headers that may be injected on a deprecated endpoint.
 */
export interface DeprecationHeaders {
  Deprecation: string;
  Sunset?: string;
  Link?: string;
}

/**
 * Builds the RFC-compliant HTTP headers for a deprecated endpoint.
 *
 * The effective deprecation date is resolved once at application boot
 * by `DeprecationRegistry` and passed here as `resolvedDeprecatedAt`,
 * ensuring the `Deprecation` header value is stable and deterministic
 * for the lifetime of the application.
 *
 * ## Headers produced
 *
 * - `Deprecation` (RFC 9745) — always emitted; Structured Field Date format
 *   `@<unix_seconds>`, derived from `resolvedDeprecatedAt`.
 * - `Sunset` (RFC 8594) — emitted when `options.sunset` is provided; IMF-fixdate
 *   format as required by RFC 9110 §5.6.7.
 * - `Link` (RFC 8288) — emitted when `options.link` is provided; `rel="deprecation"`.
 *
 * Note: `options.message` is intentionally excluded — it is a developer-facing
 * note surfaced only in structured logs, never in HTTP headers.
 *
 * @param options              - Options from the `@Deprecated()` decorator.
 *                               Only `sunset` and `link` are read; `deprecatedAt`
 *                               and `message` are ignored (see `resolvedDeprecatedAt`).
 * @param resolvedDeprecatedAt - The effective deprecation date, pre-resolved by
 *                               the registry at boot time. This is the single
 *                               source of truth for the `Deprecation` header.
 * @returns A plain object ready for `response.header(name, value)`.
 *
 * @example Minimal: only Deprecation emitted
 * ```ts
 * buildDeprecationHeaders({}, new Date('2025-01-01'))
 * // → { Deprecation: '@1735689600' }
 * ```
 *
 * @example Full: all headers emitted
 * ```ts
 * buildDeprecationHeaders(
 *   { sunset: new Date('2026-01-01'), link: '/docs/migration' },
 *   new Date('2025-01-01'),
 * )
 * // → {
 * //     Deprecation: '@1735689600',
 * //     Sunset:      'Thu, 01 Jan 2026 00:00:00 GMT',
 * //     Link:        '</docs/migration>; rel="deprecation"; type="text/html"',
 * //   }
 * ```
 */
export function buildDeprecationHeaders(
  options: DeprecatedOptions,
  resolvedDeprecatedAt: Date,
): DeprecationHeaders {
  const sunset = toDate(options.sunset);

  const headers: DeprecationHeaders = {
    Deprecation: toStructuredFieldDate(resolvedDeprecatedAt),
  };

  if (sunset !== null) {
    headers.Sunset = toIMFFixdate(sunset);
  }

  if (options.link !== undefined) {
    headers.Link = `<${options.link}>; rel="deprecation"; type="text/html"`;
  }

  return headers;
}
