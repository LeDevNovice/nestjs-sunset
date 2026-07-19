import { Module } from '@nestjs/common';

import { ConfigurableModuleClass } from './sunset.module-definition';

/**
 * Main module
 * The extension of ConfigurableModuleClass automatically generates the static methods forRoot() and forRootAsync() with their complete typings
 */
@Module({})
export class SunsetModule extends ConfigurableModuleClass {}
