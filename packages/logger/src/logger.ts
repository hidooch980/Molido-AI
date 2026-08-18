import { keySpellingVariants, REDACTED, SENSITIVE_KEYS } from '@molido/security';
import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger };

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface CreateLoggerOptions {
  /** Service name stamped on every line, e.g. `molido-api`. */
  service: string;
  level?: LogLevel;
  environment?: string;
  /** Human-readable output for local development. Never enable in production. */
  pretty?: boolean;
  /** Extra static fields merged into every line. Redacted like anything else. */
  base?: Record<string, unknown>;
}

/**
 * Paths pino removes before serialisation.
 *
 * pino matches redaction paths literally and case-sensitively, so each
 * sensitive key is expanded into every spelling it plausibly appears under and
 * placed in each container a credential tends to travel in. `redact()` from
 * `@molido/security` covers the arbitrary-depth case for payloads we build
 * ourselves; this covers what pino serialises on our behalf.
 */
function buildRedactPaths(): string[] {
  const containers = [
    '',
    '*.',
    'req.',
    'req.headers.',
    'req.body.',
    'req.query.',
    'res.headers.',
    'context.',
    'metadata.',
    'payload.',
    'body.',
    'err.',
  ];
  const paths = new Set<string>();

  for (const key of SENSITIVE_KEYS) {
    for (const spelling of keySpellingVariants(key)) {
      for (const container of containers) {
        // Bracket notation for anything pino's dot-path grammar would misread.
        paths.add(
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(spelling)
            ? `${container}${spelling}`
            : `${container}["${spelling}"]`,
        );
      }
    }
  }

  // Header names exactly as they arrive on the wire.
  paths.add('req.headers["x-api-key"]');
  paths.add('req.headers["x-refresh-token"]');
  paths.add('req.headers["proxy-authorization"]');

  return [...paths];
}

export const REDACT_PATHS = buildRedactPaths();

/**
 * Create the structured logger used across MOLIDO AI services.
 *
 * Output is newline-delimited JSON so it can be shipped to any collector later
 * without a rewrite — observability is a property of the system from day one,
 * not an add-on.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const { service, level = 'info', environment = 'development', pretty = false, base = {} } = options;

  const pinoOptions: LoggerOptions = {
    level,
    base: { service, environment, pid: process.pid, ...base },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: 'message',
    errorKey: 'error',
    redact: {
      paths: REDACT_PATHS,
      censor: REDACTED,
      remove: false,
    },
    formatters: {
      // `level: "info"` reads better in a log search than `level: 30`.
      level: (label) => ({ level: label }),
    },
  };

  if (pretty) {
    return pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service,environment' },
      },
    });
  }

  return pino(pinoOptions);
}

/**
 * Child logger bound to a request. Every line emitted while handling a request
 * carries the same `requestId`, which is also returned in error responses — so
 * a user-reported failure can be traced to the exact log lines that produced it.
 */
export function createRequestLogger(parent: Logger, requestId: string, extra: Record<string, unknown> = {}): Logger {
  return parent.child({ requestId, ...extra });
}
