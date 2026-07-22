import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts'],

    setupFiles: ['./test/setup.ts'], // Must run before any decorated class is imported because NestJS DI reads Reflect metadata at construction time

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types/**/*.ts', 'src/module/sunset-module.options.ts'],
      thresholds: {
        statements: 95,
        functions: 95,
        branches: 90,
        lines: 95,
      },
    },
  },

  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
