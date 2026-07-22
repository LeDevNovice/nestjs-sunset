import { ConfigurableModuleBuilder } from '@nestjs/common';

import { SunsetModuleOptions } from './sunset-module.options';

/**
 * Output of NestJS's `ConfigurableModuleBuilder` for `SunsetModule`.
 */
export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: SUNSET_OPTIONS_TOKEN, // to avoid name collision with other modules
  OPTIONS_TYPE, // a type-proxy used to type `forRoot()`'s parameter.
} = new ConfigurableModuleBuilder<SunsetModuleOptions>({ moduleName: 'Sunset' })
  .setClassMethodName('forRoot')
  .setExtras({ isGlobal: false }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();
