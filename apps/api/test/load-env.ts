import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load `.env.test` before any module reads configuration.
 *
 * Parsed here rather than through a dotenv dependency so the test environment
 * has exactly one, visible source — and so a stray `.env` from development can
 * never leak real credentials into a test run.
 */
const envPath = resolve(__dirname, '..', '.env.test');

for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;

  const separator = trimmed.indexOf('=');
  if (separator === -1) continue;

  const key = trimmed.slice(0, separator).trim();
  const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
  process.env[key] = value;
}
