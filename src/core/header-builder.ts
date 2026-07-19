import type { DeprecatedOptions } from '../types/deprecated-options.type';
import { toDate, toIMFFixdate, toStructuredFieldDate } from './date-converter';

export interface DeprecationHeaders {
  Deprecation: string;
  Sunset?: string;
  Link?: string;
}

export function buildDeprecationHeaders(options: DeprecatedOptions): DeprecationHeaders {
  const deprecatedAt = toDate(options.deprecatedAt) ?? new Date();
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
