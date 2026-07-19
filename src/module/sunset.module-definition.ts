import { ConfigurableModuleBuilder } from '@nestjs/common';

export const {} = new ConfigurableModuleBuilder()
  .setClassMethodName('forRoot')
  .setExtras({ isGlobal: false })
  .build();
