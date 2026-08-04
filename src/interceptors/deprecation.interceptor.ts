import {
  Injectable,
  Inject,
  Logger,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  type LogLevel,
} from '@nestjs/common';
import { tap, type Observable } from 'rxjs';

import { toDate } from '../core/date-converter';
import { buildDeprecationHeaders } from '../core/header-builder';
import { SUNSET_OPTIONS_TOKEN } from '../module/sunset.module-definition';
import type { SunsetModuleOptions } from '../module/sunset-module.options';
import { DeprecationRegistry } from '../registry/deprecation.registry';
import type { DeprecationRecord } from '../types/deprecation-record.type';
import type { DeprecationEvent } from '../types/deprecation-event.type';

/** Representing route handler references. */
type RouteHandler = (...args: unknown[]) => unknown;

interface HttpResponse {
  header(name: string, value: string): void;
}

/**
 * Global NestJS interceptor that injects RFC-compliant deprecation headers
 * into every response from an endpoint decorated with `@Deprecated()`.
 *
 * ## handler reference as registry lookup key
 *
 * `registry.getRecord(context.getHandler())` is the sole detection mechanism.
 * The handler function reference is stable and adapter-agnostic — no string
 * reconstruction from the HTTP request. This fixes the Fastify key-mismatch
 * that prevented `callCount` from incrementing for parameterised routes.
 *
 * ## stable Deprecation header via resolvedDeprecatedAt
 *
 * The `DeprecationRegistry` resolves `options.deprecatedAt` once at
 * application boot and stores it as `record.resolvedDeprecatedAt`. The
 * interceptor passes this pre-resolved date to `buildDeprecationHeaders`,
 * making the `Deprecation` header value stable and deterministic across all
 * requests to a given endpoint. Before this fix, `buildDeprecationHeaders`
 * called `new Date()` on every request when `deprecatedAt` was absent,
 * producing a different header value each time.
 *
 * ## Registry as single authority
 *
 * `DeprecationRegistry.getRecord()` replaces the previous `Reflector`-based
 * detection (which was redundant with the registry scan). The registry IS the
 * source of truth: if `getRecord()` returns a record, the endpoint is
 * deprecated. This removes a dependency (`Reflector`) from the interceptor
 * and makes the request-time contract explicit: "ask the registry".
 *
 * ## Header injection order
 *
 * Headers are injected **before** `next.handle()` because Fastify does not
 * allow header modification once response body transmission has started.
 * Logging, the registry update, and the user hook run in `tap()` (post-handler)
 * so they can include handler result metadata in future iterations.
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DeprecationInterceptor.name);

  constructor(
    private readonly registry: DeprecationRegistry,
    @Inject(SUNSET_OPTIONS_TOKEN)
    private readonly moduleOptions: SunsetModuleOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler() as RouteHandler;

    // registry.getRecord() is the sole detection mechanism.
    // Returns undefined → handler is not deprecated → pass through.
    // Returns a record → endpoint is deprecated; the record contains all data
    // needed to build headers, log, and fire the user hook.
    const record = this.registry.getRecord(handler);

    if (record === undefined) {
      return next.handle();
    }

    // Inject RFC-compliant headers BEFORE the handler executes.
    // resolvedDeprecatedAt was computed once at boot, so the
    // Deprecation header value is identical for every request.
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const headers = buildDeprecationHeaders(record.options, record.resolvedDeprecatedAt);

    response.header('Deprecation', headers.Deprecation);

    if (headers.Sunset !== undefined) response.header('Sunset', headers.Sunset);
    if (headers.Link !== undefined) response.header('Link', headers.Link);

    // Pre-compute daysUntilSunset outside tap() — it depends only on
    // the stable options, not on the handler result.
    const sunset = toDate(record.options.sunset);
    const daysUntilSunset =
      sunset !== null ? Math.floor((sunset.getTime() - Date.now()) / (1_000 * 60 * 60 * 24)) : null;

    return next.handle().pipe(
      tap(() => {
        this.emitLog(record, daysUntilSunset);
        this.registry.recordCall(handler);

        if (this.moduleOptions.onDeprecatedEndpointCalled !== undefined) {
          const event: DeprecationEvent = {
            endpoint: record.routeDescription,
            options: record.options,
            timestamp: new Date(),
            daysUntilSunset,
          };

          this.moduleOptions.onDeprecatedEndpointCalled(event);
        }
      }),
    );
  }

  /**
   * Emits a structured log entry at the configured log level.
   *
   * Uses `record.routeDescription` (the canonical boot-time key) rather than
   * reconstructing the path from the HTTP request.
   */
  private emitLog(record: Readonly<DeprecationRecord>, daysUntilSunset: number | null): void {
    const message = {
      context: 'nestjs-sunset',
      endpoint: record.routeDescription,
      deprecatedAt: record.options.deprecatedAt,
      sunset: record.options.sunset,
      daysUntilSunset,
      ...(record.options.message !== undefined ? { developerNote: record.options.message } : {}),
    };

    this.dispatchLog(this.moduleOptions.logLevel ?? 'warn', message);
  }

  private dispatchLog(level: LogLevel, message: object): void {
    switch (level) {
      case 'log':
        this.logger.log(message);
        return;
      /* v8 ignore next 2 */
      case 'error':
        this.logger.error(message);
        return;
      /* v8 ignore next 2 */
      case 'debug':
        this.logger.debug(message);
        return;
      /* v8 ignore next 2 */
      case 'verbose':
        this.logger.verbose(message);
        return;
      /* v8 ignore next 2 */
      case 'fatal':
        this.logger.fatal(message);
        return;
      default:
        this.logger.warn(message);
    }
  }
}
