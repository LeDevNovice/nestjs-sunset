import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  dts: true,

  clean: true,
  sourcemap: true,
  treeshake: true,

  publint: 'ci-only',
  attw: 'ci-only',

  outDir: 'dist',
});
