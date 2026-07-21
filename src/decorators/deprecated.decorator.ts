import { SetMetadata } from '@nestjs/common';

import type { DeprecatedOptions } from '../types/deprecated-options.type';

export const SUNSET_METADATA_KEY = Symbol('nestjs-sunset:deprecated');

export function Deprecated(options: DeprecatedOptions = {}): MethodDecorator {
  return SetMetadata(SUNSET_METADATA_KEY, options);
}
