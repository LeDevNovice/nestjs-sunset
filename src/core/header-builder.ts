/**
 * RFC-compliant HTTP deprecation header builder.
 */

import type { DeprecatedOptions } from '../types/deprecated-options.type';
import { toDate, toIMFFixdate, toStructuredFieldDate } from './date-converter';

/**
 * The HTTP headers that may be inject on a deprecated endpoint.
 */
export interface DeprecationHeaders {
  Deprecation: string;
  Sunset?: string;
  Link?: string;
}

/**
 * Builds the RFC-compliant HTTP headers for a deprecated endpoint.
 *
 * Always produces a `Deprecation` header (RFC 9745) in Structured Field
 * Date format (`@<unix_seconds>`). When `options.sunset` is provided, adds a
 * `Sunset` header (RFC 8594) in IMF-fixdate format. When `options.link` is
 * provided, adds a `Link` header (RFC 8288) with `rel="deprecation"`.
 *
 * The `options.message` field is intentionally excluded from the returned
 * headers — it is a developer-facing note surfaced only in logs.
 *
 * @param options - The options supplied to the `@Deprecated()` decorator.
 *                  All fields are optional; calling with `{}` is valid and
 *                  returns `{ Deprecation: '@<now>' }`.
 * @returns       A plain object ready for `response.header(name, value)`.
 *
 * @example
 *   // Minimal — only Deprecation emitted
 *   buildDeprecationHeaders({})
 *   // → { Deprecation: '@1751327999' }
 *
 * @example
 *   // Full options
 *   buildDeprecationHeaders({
 *     deprecatedAt: '2025-01-01',
 *     sunset: new Date('2026-01-01'),
 *     link: '/docs/migration',
 *   })
 *   // → {
 *   //     Deprecation: '@1735689600',
 *   //     Sunset:      'Thu, 01 Jan 2026 00:00:00 UTC',
 *   //     Link:        '</docs/migration>; rel="deprecation"; type="text/html"',
 *   //   }
 */
export function buildDeprecationHeaders(options: DeprecatedOptions): DeprecationHeaders {
  const deprecatedAt = toDate(options.deprecatedAt) ?? new Date(); // Fall back to the current instant if the caller did not supply a date.
  const sunset = toDate(options.sunset);

  const headers: DeprecationHeaders = {
    Deprecation: toStructuredFieldDate(deprecatedAt),
  };

  if (sunset !== null) {
    headers.Sunset = toIMFFixdate(sunset);
  }

  if (options.link !== undefined) {
    headers.Link = `<${options.link}>; rel="deprecation"; type="text/html"`;
  }

  return headers;
}
