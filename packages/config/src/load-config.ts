import { envSchema, type Env } from './env.schema';

/**
 * The shape services actually consume: grouped, typed, and free of raw
 * `process.env` string wrangling at every call site.
 */
export interface AppConfig {
  readonly env: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly api: {
    readonly port: number;
    readonly host: string;
    readonly corsOrigins: readonly string[];
    /** Base path; the version segment is appended per route group. */
    readonly globalPrefix: 'api';
    readonly defaultVersion: '1';
  };
  readonly database: {
    readonly url: string;
  };
  readonly redis: {
    readonly url: string;
  };
  readonly auth: {
    readonly accessSecret: string;
    readonly accessTokenTtl: string;
    readonly refreshTokenTtlDays: number;
    readonly issuer: string;
    readonly audience: string;
    readonly maxFailedLogins: number;
    readonly accountLockMinutes: number;
  };
  readonly rateLimit: {
    readonly global: { readonly ttlSeconds: number; readonly limit: number };
    readonly auth: { readonly ttlSeconds: number; readonly limit: number };
  };
  readonly ai: {
    readonly provider: Env['AI_PROVIDER'];
    readonly model?: string;
    readonly apiKey?: string;
    readonly baseUrl?: string;
    /** False until an AI provider is configured; the API reports this honestly. */
    readonly enabled: boolean;
  };
}

/** Thrown when the environment fails validation. Never contains secret values. */
export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validate an environment and project it into `AppConfig`.
 *
 * Takes the source explicitly (rather than reading `process.env` internally) so
 * the loader itself is a pure function and can be tested without mutating
 * global state.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    // Report which variable is wrong and why — never what its value was.
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new ConfigValidationError(issues);
  }

  const env = parsed.data;

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
    logLevel: env.LOG_LEVEL,
    api: Object.freeze({
      port: env.API_PORT,
      host: env.API_HOST,
      corsOrigins: Object.freeze([...env.CORS_ORIGINS]),
      globalPrefix: 'api' as const,
      defaultVersion: '1' as const,
    }),
    database: Object.freeze({ url: env.DATABASE_URL }),
    redis: Object.freeze({ url: env.REDIS_URL }),
    auth: Object.freeze({
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTokenTtl: env.ACCESS_TOKEN_TTL,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      maxFailedLogins: env.MAX_FAILED_LOGINS,
      accountLockMinutes: env.ACCOUNT_LOCK_MINUTES,
    }),
    rateLimit: Object.freeze({
      global: Object.freeze({
        ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
        limit: env.RATE_LIMIT_LIMIT,
      }),
      auth: Object.freeze({
        ttlSeconds: env.AUTH_RATE_LIMIT_TTL_SECONDS,
        limit: env.AUTH_RATE_LIMIT_LIMIT,
      }),
    }),
    ai: Object.freeze({
      provider: env.AI_PROVIDER,
      model: env.AI_MODEL,
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL,
      enabled: env.AI_PROVIDER !== 'null',
    }),
  });
}

/**
 * Redact a connection string down to something safe to log: scheme, host and
 * database name, with any embedded credentials removed.
 */
export function describeConnection(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, '');
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '(default)'}${
      database ? `/${database}` : ''
    }`;
  } catch {
    return '(unparseable connection string)';
  }
}
