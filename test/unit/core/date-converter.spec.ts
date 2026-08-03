import { describe, expect, it } from 'vitest';

import { toDate, toIMFFixdate, toStructuredFieldDate } from '../../../src/core/date-converter';

describe('toDate', () => {
  it('should return null when value is undefined', () => {
    expect(toDate(undefined)).toBeNull();
  });

  it('should return the same Date instance when value is already a Date', () => {
    const date = new Date('2025-06-30T23:59:59Z');

    expect(toDate(date)).toBe(date);
  });

  it('should convert an ISO 8601 string to a Date preserving the instant', () => {
    const iso = '2025-06-30T23:59:59Z';
    const result = toDate(iso);

    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(new Date(iso).getTime());
  });

  it('should convert a Unix millisecond number to a Date preserving the instant', () => {
    const ms = 1_751_327_999_000;
    const result = toDate(ms);

    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(ms);
  });

  it('should handle Unix epoch (0) without returning null', () => {
    const result = toDate(0);

    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(0);
  });
});

describe('toStructuredFieldDate', () => {
  it('should convert 2025-06-30T23:59:59Z to the RFC 9745 Structured Field Date "@1751327999"', () => {
    expect(toStructuredFieldDate(new Date('2025-06-30T23:59:59Z'))).toBe('@1751327999');
  });

  it('should truncate sub-second precision - milliseconds must not appear in the output', () => {
    const dateWithMs = new Date('2025-06-30T23:59:59.999Z');

    expect(toStructuredFieldDate(dateWithMs)).toBe('@1751327999');
  });

  it('should always produce a string that starts with "@" followed only by digits', () => {
    const result = toStructuredFieldDate(new Date('2025-01-01T00:00:00Z'));

    expect(result).toMatch(/^@\d+$/);
  });
});

describe('toIMFFixdate', () => {
  it('should convert 2026-01-01T00:00:00Z to the exact IMF-fixdate string', () => {
    expect(toIMFFixdate(new Date('2026-01-01T00:00:00Z'))).toBe('Thu, 01 Jan 2026 00:00:00 GMT');
  });

  it('should end with "GMT" and never "UTC"', () => {
    const result = toIMFFixdate(new Date('2026-01-01T00:00:00Z'));

    expect(result).toMatch(/ GMT$/);
    expect(result).not.toMatch(/ UTC$/);
  });

  it('should produce a format structurally different from toStructuredFieldDate', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const sfDate = toStructuredFieldDate(date);
    const imfDate = toIMFFixdate(date);

    expect(sfDate).toMatch(/^@\d+$/);
    expect(imfDate).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
    expect(sfDate).not.toBe(imfDate);
  });

  it('should correctly pad single-digit day numbers with a leading zero', () => {
    const result = toIMFFixdate(new Date('2026-06-05T12:00:00Z'));

    expect(result).toMatch(/^[A-Z][a-z]{2}, 05 Jun 2026 12:00:00 GMT$/);
  });

  it('should correctly name months other than January', () => {
    expect(toIMFFixdate(new Date('2026-06-15T00:00:00Z'))).toMatch(/ Jun /);
    expect(toIMFFixdate(new Date('2026-12-31T23:59:59Z'))).toMatch(/ Dec /);
  });
});
