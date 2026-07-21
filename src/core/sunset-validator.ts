import type { DeprecatedOptions } from '../types/deprecated-options.type';
import { toDate } from './date-converter';

export type ValidationResult =
  { readonly valid: true } | { readonly valid: false; readonly errorMessage: string };

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
    `  Fix : set sunset to a date after ${deprecatedAt.toISOString()}`
  );
}
