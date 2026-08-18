import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from './logger';
import { SECURITY_EVENT_LEVELS, SECURITY_EVENTS } from './security-events';

/**
 * Builds a logger with the production redaction configuration but a captured
 * destination, so what actually reaches the sink can be asserted on.
 */
function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)));
      callback();
    },
  });

  const logger = pino(
    {
      level: 'trace',
      base: { service: 'molido-test' },
      messageKey: 'message',
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]', remove: false },
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );

  return { logger, lines };
}

describe('createLogger redaction', () => {
  it('never writes a password to the sink', () => {
    const { logger, lines } = captureLogger();
    logger.info({ email: 'founder@molido.ai', password: 'super-secret' }, 'register attempt');

    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain('super-secret');
    expect(lines[0]!['password']).toBe('[REDACTED]');
    expect(lines[0]!['email']).toBe('founder@molido.ai');
  });

  it('never writes a refresh token or API key, in any spelling', () => {
    const { logger, lines } = captureLogger();
    logger.warn(
      {
        refreshToken: 'leak-camel',
        refresh_token: 'leak-snake',
        'refresh-token': 'leak-kebab',
        REFRESH_TOKEN: 'leak-upper',
        apiKey: 'leak-api',
        api_key: 'leak-api-snake',
      },
      'token event',
    );

    const serialized = JSON.stringify(lines);
    for (const secret of [
      'leak-camel',
      'leak-snake',
      'leak-kebab',
      'leak-upper',
      'leak-api',
      'leak-api-snake',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('redacts credentials nested one level deep', () => {
    const { logger, lines } = captureLogger();
    logger.info({ context: { accessToken: 'leak-access' }, body: { password: 'leak-pw' } }, 'nested');

    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain('leak-access');
    expect(serialized).not.toContain('leak-pw');
  });

  it('strips the Authorization and Cookie headers from request logs', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      { req: { headers: { authorization: 'Bearer leak-me', cookie: 'sid=leak', accept: '*/*' } } },
      'request',
    );

    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain('leak-me');
    expect(serialized).not.toContain('sid=leak');
    expect(serialized).toContain('*/*');
  });

  it('emits newline-delimited JSON with a level label and message key', () => {
    const { logger, lines } = captureLogger();
    logger.error({ requestId: 'req-1' }, 'something failed');

    expect(lines[0]!['level']).toBe('error');
    expect(lines[0]!['message']).toBe('something failed');
    expect(lines[0]!['requestId']).toBe('req-1');
    expect(lines[0]!['service']).toBe('molido-test');
  });
});

describe('security event catalogue', () => {
  it('assigns a severity to every defined event', () => {
    for (const name of Object.values(SECURITY_EVENTS)) {
      expect(SECURITY_EVENT_LEVELS[name]).toBeDefined();
    }
  });

  it('treats refresh-token reuse as critical', () => {
    expect(SECURITY_EVENT_LEVELS[SECURITY_EVENTS.TOKEN_REUSE_DETECTED]).toBe('CRITICAL');
  });
});
