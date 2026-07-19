import type { LogLevel } from '@nestjs/common';

import { DeprecationEvent } from '../types/deprecation-event.type';

export interface SunsetModuleOptions {
  // Log level for each call on a deprecated endpoint
  logLevel?: LogLevel;
  // Number of days before the sunset date triggering a warning at startup
  sunsetWarningThresholdDays?: number;
  // Hook called on each request on a deprecated endpoint
  onDeprecatedEndpointCalled?: (event: DeprecationEvent) => void;
  isGlobal?: boolean;
}
