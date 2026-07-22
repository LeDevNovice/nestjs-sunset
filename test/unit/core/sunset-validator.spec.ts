import { describe, expect, it } from 'vitest';

import { validateDeprecationOptions } from '../../../src/core/sunset-validator';

const DEPRECATED_AT = new Date('2025-01-01T00:00:00.000Z');
const SUNSET = new Date('2026-01-01T00:00:00.000Z');

describe('validateDeprecationOptions', () => {
  it('should return { valid: true } when sunset is strictly after deprecatedAt', () => {
    const result = validateDeprecationOptions(
      { deprecatedAt: DEPRECATED_AT, sunset: SUNSET },
      'GET /v1/users',
    );

    expect(result.valid).toBe(true);
  });

  it('should return { valid: true } when sunset is absent', () => {
    const result = validateDeprecationOptions({ deprecatedAt: DEPRECATED_AT }, 'GET /v1/users');

    expect(result.valid).toBe(true);
  });

  it('should return { valid: true } when deprecatedAt is absent', () => {
    const result = validateDeprecationOptions({ sunset: SUNSET }, 'GET /v1/users');

    expect(result.valid).toBe(true);
  });

  it('should return { valid: true } when both dates are absent', () => {
    const result = validateDeprecationOptions({}, 'GET /v1/users');

    expect(result.valid).toBe(true);
  });

  it('should carry no errorMessage property', () => {
    const result = validateDeprecationOptions(
      { deprecatedAt: DEPRECATED_AT, sunset: SUNSET },
      'GET /v1/users',
    );

    expect(result).not.toHaveProperty('errorMessage');
  });

  it('should return { valid: false } when sunset equals deprecatedAt', () => {
    const sameInstant = new Date('2025-06-01T00:00:00.000Z');
    const alsosameInstant = new Date('2025-06-01T00:00:00.000Z');

    const result = validateDeprecationOptions(
      { deprecatedAt: sameInstant, sunset: alsosameInstant },
      'DELETE /v1/resources',
    );

    expect(result.valid).toBe(false);
  });

  it('should return { valid: false } when sunset is before deprecatedAt', () => {
    const result = validateDeprecationOptions(
      { deprecatedAt: SUNSET, sunset: DEPRECATED_AT },
      'POST /v1/users',
    );

    expect(result.valid).toBe(false);
  });

  it('should contain the routeDescription in the errorMessage', () => {
    const route = 'PATCH /api/v1/very-specific-endpoint';
    const result = validateDeprecationOptions(
      { deprecatedAt: SUNSET, sunset: DEPRECATED_AT },
      route,
    );

    if (result.valid) throw new Error('Expected invalid result');

    expect(result.errorMessage).toContain(route);
  });

  it('should contain the deprecatedAt date in ISO 8601 format in the errorMessage', () => {
    const result = validateDeprecationOptions(
      { deprecatedAt: SUNSET, sunset: DEPRECATED_AT },
      'GET /test',
    );

    if (result.valid) throw new Error('Expected invalid result');

    expect(result.errorMessage).toContain(SUNSET.toISOString());
  });

  it('should contain the sunset date in ISO 8601 format in the errorMessage', () => {
    const result = validateDeprecationOptions(
      { deprecatedAt: SUNSET, sunset: DEPRECATED_AT },
      'GET /test',
    );

    if (result.valid) throw new Error('Expected invalid result');

    expect(result.errorMessage).toContain(DEPRECATED_AT.toISOString());
  });

  it('should accept deprecatedAt as an ISO 8601 string and sunset as a Date', () => {
    const result = validateDeprecationOptions(
      {
        deprecatedAt: '2025-01-01T00:00:00.000Z',
        sunset: SUNSET,
      },
      'GET /v1/users',
    );

    expect(result.valid).toBe(true);
  });

  it('should accept both dates as Unix millisecond numbers', () => {
    const result = validateDeprecationOptions(
      {
        deprecatedAt: DEPRECATED_AT.getTime(),
        sunset: SUNSET.getTime(),
      },
      'GET /v1/users',
    );

    expect(result.valid).toBe(true);
  });

  it('should return { valid: false } when dates are provided as numbers with sunset ≤ deprecatedAt', () => {
    const result = validateDeprecationOptions(
      {
        deprecatedAt: SUNSET.getTime(),
        sunset: DEPRECATED_AT.getTime(),
      },
      'GET /v1/users',
    );

    expect(result.valid).toBe(false);
  });
});
