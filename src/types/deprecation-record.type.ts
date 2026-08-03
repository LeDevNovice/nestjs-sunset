import type { DeprecatedOptions } from './deprecated-options.type';

/**
 * A single entry in the `DeprecationRegistry`, representing one endpoint
 * decorated with `@Deprecated()`.
 *
 * `routeDescription`, `options`, and `resolvedDeprecatedAt` are sealed at
 * registration time (during `onApplicationBootstrap`).
 * `callCount` and `lastCalledAt` are updated by `DeprecationRegistry.recordCall()`
 * on every request to the endpoint.
 */
export interface DeprecationRecord {
  /** Route identifier as registered at boot, e.g. `"GET /v1/users"`. */
  readonly routeDescription: string;
  /** Options from the `@Deprecated()` decorator on this endpoint. */
  readonly options: DeprecatedOptions;
  /**
   * The effective deprecation date, resolved once at application boot.
   *
   * When `options.deprecatedAt` is provided, this equals that value
   * (converted to a `Date`). When `options.deprecatedAt` is omitted, this
   * defaults to the instant the application started, ensuring a **stable,
   * deterministic** value for every subsequent request to this endpoint.
   *
   * The `Deprecation` HTTP header (RFC 9745) is derived from this field, not
   * from `options.deprecatedAt`, so the header value never changes between
   * requests and is safe for caching by downstream systems.
   */
  readonly resolvedDeprecatedAt: Date;
  /**
   * Number of requests to this endpoint since the last application restart.
   * Starts at `0`; incremented by `DeprecationRegistry.recordCall()`.
   */
  callCount: number;
  /**
   * Timestamp of the most recent request to this endpoint, or `null` if
   * no request has been received since the last application restart.
   */
  lastCalledAt: Date | null;
}
