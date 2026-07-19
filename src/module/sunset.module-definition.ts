import { ConfigurableModuleBuilder } from '@nestjs/common';

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: SUNSET_OPTIONS_TOKEN, // to avoid name collision with other modules
} = new ConfigurableModuleBuilder({ moduleName: 'Sunset' })
  .setClassMethodName('forRoot')
  .setExtras({ isGlobal: false }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();
