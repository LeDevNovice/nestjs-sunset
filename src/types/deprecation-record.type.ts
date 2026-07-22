import type { DeprecatedOptions } from './deprecated-options.type';

/**
 * A single entry in the `DeprecationRegistry`, representing one endpoint
 * decorated with `@Deprecated()`.
 *
 * `routeDescription` and `options` are sealed at registration time.
 * `callCount` and `lastCalledAt` are updated by `DeprecationRegistry.increment()`
 * on every request to the endpoint.
 */
export interface DeprecationRecord {
  /** Route identifier as registered at boot, e.g. `"GET /v1/users"`. */
  readonly routeDescription: string;
  /** Options from the `@Deprecated()` decorator on this endpoint. */
  readonly options: DeprecatedOptions;
  /**
   * Number of requests to this endpoint since the last application restart.
   * Starts at `0`; incremented by `DeprecationRegistry.increment()`.
   */
  callCount: number;
  /**
   * Timestamp of the most recent request to this endpoint, or `null` if
   * no request has been received since the last application restart.
   */
  lastCalledAt: Date | null;
}
