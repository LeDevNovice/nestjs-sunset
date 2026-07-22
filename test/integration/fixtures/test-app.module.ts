import { Module } from '@nestjs/common';

import { SunsetModule } from '../../../src/module/sunset.module';
import { TestController } from './test.controller';

@Module({
  imports: [
    SunsetModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [TestController],
})
export class TestAppModule {}
