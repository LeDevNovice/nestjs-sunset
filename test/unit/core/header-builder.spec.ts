import { describe, expect, it } from 'vitest';

import { buildDeprecationHeaders } from '../../../src/core/header-builder';

describe('buildDeprecationHeaders', () => {
  it('should always return a Deprecation header in "@<seconds>" Structured Field Date format"', () => {
    const result = buildDeprecationHeaders({ deprecatedAt: '2025-06-30T23:59:59Z' });

    expect(result.Deprecation).toBe('@1751327999');
  });

  it('should default Deprecation to the current instant when deprecatedAt is absent', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = buildDeprecationHeaders({});
    const after = Math.floor(Date.now() / 1000);

    expect(result.Deprecation).toMatch(/^@\d+$/);

    const ts = parseInt(result.Deprecation.slice(1), 10);

    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('should accept deprecatedAt as an ISO 8601 string', () => {
    const result = buildDeprecationHeaders({ deprecatedAt: '2025-01-01T00:00:00Z' });

    expect(result.Deprecation).toBe('@1735689600');
  });

  it('should accept deprecatedAt as a Unix millisecond number', () => {
    const result = buildDeprecationHeaders({ deprecatedAt: 1_751_327_999_000 });

    expect(result.Deprecation).toBe('@1751327999');
  });

  it('should accept deprecatedAt as a Date object', () => {
    const result = buildDeprecationHeaders({ deprecatedAt: new Date('2025-06-30T23:59:59Z') });

    expect(result.Deprecation).toBe('@1751327999');
  });

  it('should include a Sunset header in IMF-fixdate format when sunset is provided', () => {
    const result = buildDeprecationHeaders({ sunset: new Date('2026-01-01T00:00:00Z') });

    expect(result.Sunset).toBe('Thu, 01 Jan 2026 00:00:00 UTC');
  });

  it('should omit the Sunset key entirely when sunset is absent', () => {
    const result = buildDeprecationHeaders({});

    expect(result).not.toHaveProperty('Sunset');
  });

  it('should format Link as \'<url>; rel="deprecation"; type="text/html"\' for an absolute URL', () => {
    const result = buildDeprecationHeaders({ link: 'https://api.example.com/docs/migration' });

    expect(result.Link).toBe(
      '<https://api.example.com/docs/migration>; rel="deprecation"; type="text/html"',
    );
  });

  it('should format Link correctly for a relative URL', () => {
    const result = buildDeprecationHeaders({ link: '/docs/migration/v2-users' });

    expect(result.Link).toBe('</docs/migration/v2-users>; rel="deprecation"; type="text/html"');
  });

  it('should omit the Link key entirely when link is absent', () => {
    const result = buildDeprecationHeaders({});

    expect(result).not.toHaveProperty('Link');
  });

  it('should use different date formats for Deprecation and Sunset as mandated by RFC 9745 §3', () => {
    const result = buildDeprecationHeaders({
      deprecatedAt: '2025-01-01T00:00:00Z',
      sunset: new Date('2026-01-01T00:00:00Z'),
    });

    expect(result.Deprecation).toMatch(/^@\d+$/);
    expect(result.Sunset).toMatch(
      /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} UTC$/,
    );
    expect(result.Deprecation).not.toBe(result.Sunset);
  });

  it('should return exactly { Deprecation } and no other keys when called with {}', () => {
    const result = buildDeprecationHeaders({});

    expect(Object.keys(result)).toStrictEqual(['Deprecation']);
  });

  it('should return all three header keys when all options are supplied', () => {
    const result = buildDeprecationHeaders({
      deprecatedAt: '2025-01-01T00:00:00Z',
      sunset: new Date('2026-01-01T00:00:00Z'),
      link: '/docs/migration',
    });

    expect(Object.keys(result).sort()).toStrictEqual(['Deprecation', 'Link', 'Sunset']);
  });

  it('should not emit a header for the message field — it is logged only, never an HTTP header', () => {
    const result = buildDeprecationHeaders({ message: 'Use /v2/users instead' });

    expect(result).not.toHaveProperty('message');
    expect(result).not.toHaveProperty('Message');
    expect(Object.keys(result)).toHaveLength(1);
  });
});
