import { DeprecatedOptions } from './deprecated-options.type';

/**
 * Payload emitted by the `onDeprecatedEndpointCalled` hook defined in
 * `SunsetModuleOptions`.
 */
export interface DeprecationEvent {
  /** Route description, e.g. `"GET /v1/users"`. */
  readonly endpoint: string;
  /** The options from the `@Deprecated()` decorator on this endpoint. */
  readonly options: DeprecatedOptions;
  /** Timestamp of the incoming request that triggered this event. */
  readonly timestamp: Date;
  /**
   * Number of calendar days until the sunset date, or `null` when no sunset
   * date was configured. Negative values indicate the sunset date has passed.
   */
  readonly daysUntilSunset: number | null;
}
