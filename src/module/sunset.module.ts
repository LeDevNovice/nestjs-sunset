import { DynamicModule, Module } from '@nestjs/common';

import { ConfigurableModuleClass, OPTIONS_TYPE } from './sunset.module-definition';
import { DiscoveryModule, APP_INTERCEPTOR } from '@nestjs/core';
import { DeprecationInterceptor } from '../interceptors/deprecation.interceptor';
import { DeprecationRegistry } from '../registry/deprecation.registry';

/**
 * Main entry-point module.
 *
 * @example Minimal setup (zero configuration)
 * ```typescript
 * // app.module.ts
 * @Module({ imports: [SunsetModule.forRoot()] })
 * export class AppModule {}
 * ```
 *
 * @example Global module with custom options
 * ```typescript
 * @Module({
 *   imports: [
 *     SunsetModule.forRoot({
 *       isGlobal: true,
 *       logLevel: 'warn',
 *       sunsetWarningThresholdDays: 60,
 *       onDeprecatedEndpointCalled: (event) => metrics.increment(event.endpoint),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Async configuration (e.g. from ConfigService)
 * ```typescript
 * SunsetModule.forRootAsync({
 *   useFactory: (config: ConfigService) => ({
 *     sunsetWarningThresholdDays: config.get('SUNSET_WARNING_DAYS'),
 *   }),
 *   inject: [ConfigService],
 * })
 * ```
 */
@Module({
  imports: [DiscoveryModule],
  providers: [
    DeprecationRegistry,
    {
      provide: APP_INTERCEPTOR,
      useClass: DeprecationInterceptor,
    },
  ],
  exports: [DeprecationRegistry],
})
export class SunsetModule extends ConfigurableModuleClass {
  /**
   * Creates a synchronous dynamic module with the given options.
   */
  static override forRoot(options: typeof OPTIONS_TYPE = {}): DynamicModule {
    return super.forRoot(options);
  }
}
