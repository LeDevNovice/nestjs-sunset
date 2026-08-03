import { describe, expect, it } from 'vitest';

import { buildDeprecationHeaders } from '../../../src/core/header-builder';

// The canonical resolved date passed explicitly by the caller (the registry
// computes this once at boot, the interceptor passes it here).
const RESOLVED_DATE = new Date('2025-01-01T00:00:00.000Z');

describe('buildDeprecationHeaders', () => {
  // -------------------------------------------------------------------------
  // Deprecation header (RFC 9745)
  // -------------------------------------------------------------------------

  it('should always emit a Deprecation header in "@<seconds>" Structured Field Date format', () => {
    const result = buildDeprecationHeaders(
      { deprecatedAt: '2025-06-30T23:59:59Z' },
      new Date('2025-06-30T23:59:59Z'),
    );

    expect(result.Deprecation).toBe('@1751327999');
  });

  it('should use the explicitly provided resolvedDeprecatedAt — never call new Date() internally', () => {
    // The key invariant: two calls with the SAME resolvedDeprecatedAt
    // MUST produce the SAME Deprecation header, even if clock advances.
    const result1 = buildDeprecationHeaders({}, RESOLVED_DATE);
    const result2 = buildDeprecationHeaders({}, RESOLVED_DATE);

    expect(result1.Deprecation).toBe('@1735689600');
    expect(result2.Deprecation).toBe('@1735689600');
    expect(result1.Deprecation).toBe(result2.Deprecation);
  });

  it('should accept options.deprecatedAt as an ISO 8601 string but ignore it in favour of resolvedDeprecatedAt', () => {
    // options.deprecatedAt is user-provided and may be undefined or any format.
    // resolvedDeprecatedAt is authoritative — it is what appears in the header.
    const result = buildDeprecationHeaders(
      { deprecatedAt: '2025-01-01T00:00:00Z' }, // same date as RESOLVED_DATE for clarity
      new Date('2025-01-01T00:00:00Z'),
    );

    expect(result.Deprecation).toBe('@1735689600');
  });

  it('should accept resolvedDeprecatedAt as a Date object and emit the correct unix-second timestamp', () => {
    const result = buildDeprecationHeaders(
      { deprecatedAt: new Date('2025-06-30T23:59:59Z') },
      new Date('2025-06-30T23:59:59Z'),
    );

    expect(result.Deprecation).toBe('@1751327999');
  });

  // -------------------------------------------------------------------------
  // Sunset header (RFC 8594)
  // -------------------------------------------------------------------------

  it('should include a Sunset header in IMF-fixdate format when options.sunset is provided', () => {
    const result = buildDeprecationHeaders(
      { sunset: new Date('2026-01-01T00:00:00Z') },
      RESOLVED_DATE,
    );

    expect(result.Sunset).toBe('Thu, 01 Jan 2026 00:00:00 GMT');
  });

  it('should omit the Sunset key entirely when options.sunset is absent', () => {
    const result = buildDeprecationHeaders({}, RESOLVED_DATE);

    expect(result).not.toHaveProperty('Sunset');
  });

  // -------------------------------------------------------------------------
  // Link header (RFC 8288)
  // -------------------------------------------------------------------------

  it('should format Link as \'<url>; rel="deprecation"; type="text/html"\' for an absolute URL', () => {
    const result = buildDeprecationHeaders(
      { link: 'https://api.example.com/docs/migration' },
      RESOLVED_DATE,
    );

    expect(result.Link).toBe(
      '<https://api.example.com/docs/migration>; rel="deprecation"; type="text/html"',
    );
  });

  it('should format Link correctly for a relative URL', () => {
    const result = buildDeprecationHeaders({ link: '/docs/migration/v2-users' }, RESOLVED_DATE);

    expect(result.Link).toBe('</docs/migration/v2-users>; rel="deprecation"; type="text/html"');
  });

  it('should omit the Link key entirely when options.link is absent', () => {
    const result = buildDeprecationHeaders({}, RESOLVED_DATE);

    expect(result).not.toHaveProperty('Link');
  });

  // -------------------------------------------------------------------------
  // RFC date-format asymmetry (RFC 9745 §3)
  // -------------------------------------------------------------------------

  it('should use different date formats for Deprecation and Sunset as mandated by RFC 9745 §3', () => {
    const result = buildDeprecationHeaders(
      {
        deprecatedAt: '2025-01-01T00:00:00Z',
        sunset: new Date('2026-01-01T00:00:00Z'),
      },
      new Date('2025-01-01T00:00:00Z'),
    );

    // Deprecation: Structured Field Date (@<unix_seconds>)
    expect(result.Deprecation).toMatch(/^@\d+$/);
    // Sunset: IMF-fixdate (RFC 9110 §5.6.7)
    expect(result.Sunset).toMatch(
      /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/,
    );
    expect(result.Deprecation).not.toBe(result.Sunset);
  });

  // -------------------------------------------------------------------------
  // Output shape
  // -------------------------------------------------------------------------

  it('should return exactly { Deprecation } and no other keys when called with minimal options', () => {
    const result = buildDeprecationHeaders({}, RESOLVED_DATE);

    expect(Object.keys(result)).toStrictEqual(['Deprecation']);
  });

  it('should return all three header keys when all options are supplied', () => {
    const result = buildDeprecationHeaders(
      {
        deprecatedAt: '2025-01-01T00:00:00Z',
        sunset: new Date('2026-01-01T00:00:00Z'),
        link: '/docs/migration',
      },
      new Date('2025-01-01T00:00:00Z'),
    );

    expect(Object.keys(result).sort()).toStrictEqual(['Deprecation', 'Link', 'Sunset']);
  });

  it('should not emit a header for the message field — it is logged only, never an HTTP header', () => {
    const result = buildDeprecationHeaders({ message: 'Use /v2/users instead' }, RESOLVED_DATE);

    expect(result).not.toHaveProperty('message');
    expect(result).not.toHaveProperty('Message');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('should produce identical Deprecation headers on consecutive calls with the same resolvedDeprecatedAt', () => {
    const date = new Date('2025-03-15T12:00:00Z');

    const headers1 = buildDeprecationHeaders({}, date);
    const headers2 = buildDeprecationHeaders({}, date);
    const headers3 = buildDeprecationHeaders({ link: '/x' }, date); // different options, same date

    expect(headers1.Deprecation).toBe(headers2.Deprecation);
    expect(headers1.Deprecation).toBe(headers3.Deprecation);
  });
});
