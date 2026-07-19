import { DeprecatedOptions } from './deprecated-options.type';

export interface DeprecationEvent {
  readonly endpoint: string;
  readonly options: DeprecatedOptions;
  readonly timestamp: Date;
  readonly daysUntilSunset: number | null;
}
