/**
 * Options accepted by the `@Deprecated()` decorator.
 */
export interface DeprecatedOptions {
  /**
   * Date at which the resource was or will be deprecated.
   *
   * Accepts a `Date` object, an ISO 8601 string, or a Unix timestamp in
   * milliseconds. When omitted, the current instant is used.
   *
   * Emits header: `Deprecation: @<unix_seconds>`  (RFC 9745)
   */
  readonly deprecatedAt?: Date | string | number;
  /**
   * Date at which the resource will stop responding.
   *
   * Must be strictly later than `deprecatedAt` — the application will refuse
   * to start if this constraint is violated (RFC 9745).
   *
   * Emits header: `Sunset: <IMF-fixdate>`  (RFC 8594)
   */
  readonly sunset?: Date | string | number;
  /**
   * URL pointing to the migration documentation or the deprecation policy.
   *
   * Accepts relative paths (`/docs/migration/v2`) or absolute URLs
   * (`https://api.example.com/docs/migration`). The URL is not validated.
   *
   * Emits header: `Link: <url>; rel="deprecation"; type="text/html"`  (RFC 8288)
   */
  readonly link?: string;
  /**
   * Human-readable note for developers explaining the migration path.
   *
   * This field is surfaced in structured logs only — it is never emitted as
   * an HTTP header. Use `link` to point consumers to the documentation.
   */
  readonly message?: string;
}
