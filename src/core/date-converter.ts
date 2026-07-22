/**
 * RFC-compliant date conversion utilities.
 */

// Day and month abbreviations used by IMF-fixdate (RFC 9110).
const UTC_DAYS: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const UTC_MONTHS: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Normalizes a date value to a JavaScript `Date`, or `null`.
 *
 * This is the canonical entry point for any value that comes from
 * `DeprecatedOptions.deprecatedAt` or `DeprecatedOptions.sunset`.
 *
 * @param value - A Date object, an ISO 8601 string, a Unix timestamp in
 *                milliseconds, or `undefined` when the option was omitted.
 * @returns     A `Date` object representing the same instant, or `null` when
 *              `value` is `undefined`.
 */
export function toDate(value: Date | string | number | undefined): Date | null {
  if (value === undefined) return null;
  if (value instanceof Date) return value;

  return new Date(value);
}

/**
 * Converts a `Date` to the Structured Field Date format required by RFC 9745.
 *
 * Format: `@<integer_unix_seconds>`
 *
 * @param date - The deprecation date to encode.
 * @returns    A string such as `"@1751327999"`.
 *
 * @example
 *   toStructuredFieldDate(new Date('2025-06-30T23:59:59Z')) // '@1751327999'
 */
export function toStructuredFieldDate(date: Date): string {
  return `@${String(Math.floor(date.getTime() / 1000))}`;
}

/**
 * Converts a `Date` to the IMF-fixdate format required by RFC 8594.
 *
 * Format: `Ddd, DD Mon YYYY HH:MM:SS UTC`
 *
 * @param date - The sunset date to encode.
 * @returns    A string such as `"Thu, 01 Jan 2026 00:00:00 UTC"`.
 *
 * @example
 *   toIMFFixdate(new Date('2026-01-01T00:00:00Z')) // 'Thu, 01 Jan 2026 00:00:00 UTC'
 */
export function toIMFFixdate(date: Date): string {
  const day = UTC_DAYS[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const month = UTC_MONTHS[date.getUTCMonth()];
  const year = String(date.getUTCFullYear());
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');

  return `${day}, ${dd} ${month} ${year} ${hh}:${mm}:${ss} UTC`;
}
