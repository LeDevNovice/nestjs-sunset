import { ConfigurableModuleBuilder } from '@nestjs/common';

import { SunsetModuleOptions } from './sunset-module.options';

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: SUNSET_OPTIONS_TOKEN, // to avoid name collision with other modules
} = new ConfigurableModuleBuilder<SunsetModuleOptions>({ moduleName: 'Sunset' })
  .setClassMethodName('forRoot')
  .setExtras({ isGlobal: false }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();
