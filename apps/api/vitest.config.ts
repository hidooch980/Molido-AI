import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against a dedicated `molido_test` database, loaded from
 * `.env.test`. Using the real database rather than a mock is deliberate: the
 * behaviour under test — unique constraints, transactional token rotation,
 * cascade deletes — lives in the schema, and a mock would assert nothing about
 * it.
 */

/**
 * NestJS depends on decorator metadata that `esbuild` (Vitest's default
 * transformer) does not emit. SWC is used instead so dependency injection
 * behaves in tests exactly as it does at runtime.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/load-env.ts'],
    globals: false,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The scrypt work factor and the Fastify bootstrap make these tests
    // heavier than a pure unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    // One worker: the suites share a database and truncate between tests, so
    // parallel files would race each other's fixtures.
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
