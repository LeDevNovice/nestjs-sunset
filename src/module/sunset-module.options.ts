import type { LogLevel } from '@nestjs/common';

import { DeprecationEvent } from '../types/deprecation-event.type';

/**
 * Configuration options for `SunsetModule.forRoot()`.
 *
 * Defaults produce RFC-compliant headers, structured warn-level logs, and a
 * 30-day pre-sunset alert window.
 */
export interface SunsetModuleOptions {
  /**
   * NestJS log level used when logging calls to deprecated endpoints.
   *
   * @default 'warn'
   */
  logLevel?: LogLevel;
  /**
   * Number of days before the sunset date that triggers a startup warning.
   * When an endpoint's sunset is within this window, a warning is logged
   * during `onApplicationBootstrap`.
   *
   * @default 30
   */
  sunsetWarningThresholdDays?: number;
  /**
   * Hook invoked on every incoming request to a deprecated endpoint.
   *
   * Use this to forward deprecation events to an external metrics or
   * alerting system (e.g. Datadog, Prometheus, Slack).
   *
   * @example
   * ```typescript
   * onDeprecatedEndpointCalled: (event) => {
   *   metrics.increment('api.deprecated.calls', { endpoint: event.endpoint });
   * }
   * ```
   */
  onDeprecatedEndpointCalled?: (event: DeprecationEvent) => void;
  /**
   * When `true`, registers `SunsetModule` as a NestJS global module so that
   * its providers (including `DeprecationRegistry`) are available everywhere
   * without explicit import.
   *
   * Managed automatically by `ConfigurableModuleBuilder` — do not set this
   * field directly; use `SunsetModule.forRoot({ isGlobal: true })` instead.
   *
   * @internal
   */
  isGlobal?: boolean;
}
