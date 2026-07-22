/**
 * Boot-time configuration validator for `@Deprecated()` options.
 */

import type { DeprecatedOptions } from '../types/deprecated-options.type';
import { toDate } from './date-converter';

export type ValidationResult =
  { readonly valid: true } | { readonly valid: false; readonly errorMessage: string };

/**
 * Validates that `options.sunset` is strictly after `options.deprecatedAt`.
 *
 * Returns `{ valid: true }` whenever the constraint cannot be evaluated
 * (either date absent) or is satisfied. Returns `{ valid: false, errorMessage }`
 * with an actionable, RFC-citing message when the constraint is violated.
 *
 * @param options          - The options from the `@Deprecated()` decorator.
 * @param routeDescription - Human-readable route identifier used in the error
 *                           message, e.g. `"GET /v1/users"`.
 * @returns `{ valid: true }` or `{ valid: false; errorMessage: string }`.
 *
 * @example
 * ```typescript
 * const result = validateDeprecationOptions(
 *   { deprecatedAt: new Date('2026-01-01'), sunset: new Date('2025-01-01') },
 *   'GET /v1/users',
 * );
 * // result.valid === false
 * // result.errorMessage contains 'RFC 9745 §4' and both ISO dates
 * ```
 */
export function validateDeprecationOptions(
  options: DeprecatedOptions,
  routeDescription: string,
): ValidationResult {
  const deprecatedAt = toDate(options.deprecatedAt);
  const sunset = toDate(options.sunset);

  if (deprecatedAt === null || sunset === null) {
    return { valid: true };
  }

  if (sunset <= deprecatedAt) {
    return {
      valid: false,
      errorMessage: buildErrorMessage(routeDescription, sunset, deprecatedAt),
    };
  }

  return { valid: true };
}

function buildErrorMessage(routeDescription: string, sunset: Date, deprecatedAt: Date): string {
  return (
    `[nestjs-sunset] Invalid configuration on ${routeDescription}:\n` +
    `  Problem  : sunset (${sunset.toISOString()}) must be strictly after` +
    ` deprecatedAt (${deprecatedAt.toISOString()})\n` +
    `  Rule     : RFC 9745 requires sunset to be after the deprecation date\n` +
    `  Fix : set sunset to a date after ${deprecatedAt.toISOString()}`
  );
}
