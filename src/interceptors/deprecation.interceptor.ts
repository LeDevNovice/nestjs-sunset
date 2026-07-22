import {
  Injectable,
  Inject,
  Logger,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  type LogLevel,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap, type Observable } from 'rxjs';

import { SUNSET_METADATA_KEY } from '../decorators/deprecated.decorator';
import { toDate } from '../core/date-converter';
import { buildDeprecationHeaders } from '../core/header-builder';
import { SUNSET_OPTIONS_TOKEN } from '../module/sunset.module-definition';
import type { SunsetModuleOptions } from '../module/sunset-module.options';
import { DeprecationRegistry } from '../registry/deprecation.registry';
import type { DeprecatedOptions } from '../types/deprecated-options.type';
import type { DeprecationEvent } from '../types/deprecation-event.type';

interface HttpResponse {
  header(name: string, value: string): void;
}

interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly route?: { readonly path: string };
}

/**
 * Global NestJS interceptor that injects RFC-compliant deprecation headers
 * into every response from an endpoint decorated with `@Deprecated()`.
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DeprecationInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly registry: DeprecationRegistry,
    @Inject(SUNSET_OPTIONS_TOKEN)
    private readonly moduleOptions: SunsetModuleOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<DeprecatedOptions | undefined>(
      SUNSET_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (options === undefined) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<HttpResponse>();
    const headers = buildDeprecationHeaders(options);

    response.header('Deprecation', headers.Deprecation);

    if (headers.Sunset !== undefined) response.header('Sunset', headers.Sunset);
    if (headers.Link !== undefined) response.header('Link', headers.Link);

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const routeDescription = `${request.method} ${request.route?.path ?? request.url}`;

    // Days until sunset - positive = future, negative = past, null = no sunset
    const sunset = toDate(options.sunset);
    const daysUntilSunset =
      sunset !== null ? Math.floor((sunset.getTime() - Date.now()) / (1_000 * 60 * 60 * 24)) : null;

    return next.handle().pipe(
      tap(() => {
        this.emitLog(routeDescription, options, daysUntilSunset);
        this.registry.increment(routeDescription);

        if (this.moduleOptions.onDeprecatedEndpointCalled !== undefined) {
          const event: DeprecationEvent = {
            endpoint: routeDescription,
            options,
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
   */
  private emitLog(
    endpoint: string,
    options: DeprecatedOptions,
    daysUntilSunset: number | null,
  ): void {
    const message = {
      context: 'nestjs-sunset',
      endpoint,
      deprecatedAt: options.deprecatedAt,
      sunset: options.sunset,
      daysUntilSunset,
      ...(options.message !== undefined ? { developerNote: options.message } : {}),
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
