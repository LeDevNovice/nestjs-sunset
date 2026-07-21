import type { DeprecatedOptions } from './deprecated-options.type';

export interface DeprecationRecord {
  readonly routeDescription: string;
  readonly options: DeprecatedOptions;
  callCount: number;
  lastCalledAt: Date | null;
}
