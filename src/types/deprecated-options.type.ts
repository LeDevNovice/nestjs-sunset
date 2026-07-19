export interface DeprecatedOptions {
  // Date at which the resource will be or was deprecated
  readonly deprecatedAt?: Date | string | number;
  // Date at which the resource will stop responding
  readonly sunset?: Date | string | number;
  // URL to the migration documentation or deprecation policy
  readonly link?: string;
  readonly message?: string;
}
