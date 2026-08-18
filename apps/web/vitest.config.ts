import { defineConfig } from 'vitest/config';

/**
 * Covers the client's pure logic — the status-mapping layer that decides what
 * the user is told about the platform. Component rendering is left to the
 * Playwright end-to-end suite rather than duplicated in a DOM simulator.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
