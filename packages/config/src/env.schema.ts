import { z } from 'zod';

/**
 * Runtime configuration schema for MOLIDO AI services.
 *
 * Two rules drive the design:
 *
 *  1. The process refuses to start on invalid configuration. A service that
 *     boots with a missing secret and fails later, under load, is far worse
 *     than one that never boots.
 *  2. No secret has a default. Anything with a default is, by definition, not
 *     a secret — so `JWT_ACCESS_SECRET` must be supplied, in every environment.
 */

const MIN_SECRET_LENGTH = 32;

/** Accepts `15m`, `3600s`, `1h`, `7d` or a bare number of seconds. */
const durationPattern = /^(\d+)(ms|s|m|h|d)?$/;

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');

const port = z.coerce.number().int().min(1).max(65535);

const secret = z
  .string()
  .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`)
  .refine((value) => !/^(change[_-]?me|secret|password|test)$/i.test(value.trim()), {
    message: 'must not be a placeholder value',
  });

/** Comma-separated origins → array. Rejects the `*` wildcard outright. */
const corsOrigins = z
  .string()
  .default('http://localhost:3000')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .refine((origins) => origins.length > 0, { message: 'at least one origin is required' })
  .refine((origins) => !origins.includes('*'), {
    message: 'wildcard origin is not permitted; list origins explicitly',
  });

export const envSchema = z
  .object({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

    // --- API ---
    API_PORT: port.default(4000),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    CORS_ORIGINS: corsOrigins,

    // --- Data stores ---
    DATABASE_URL: z
      .string()
      .min(1)
      .refine((value) => /^postgres(ql)?:\/\//.test(value), {
        message: 'must be a postgresql:// connection string',
      }),
    REDIS_URL: z
      .string()
      .default('redis://localhost:6380')
      .refine((value) => /^rediss?:\/\//.test(value), {
        message: 'must be a redis:// connection string',
      }),

    // --- Authentication ---
    JWT_ACCESS_SECRET: secret,
    ACCESS_TOKEN_TTL: z.string().regex(durationPattern).default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    JWT_ISSUER: z.string().min(1).default('molido-ai'),
    JWT_AUDIENCE: z.string().min(1).default('molido-api'),
    MAX_FAILED_LOGINS: z.coerce.number().int().min(1).max(100).default(10),
    ACCOUNT_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

    // --- Rate limiting ---
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().min(1).default(120),
    AUTH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    AUTH_RATE_LIMIT_LIMIT: z.coerce.number().int().min(1).default(10),

    // --- AI provider abstraction (Phase 6) ---
    // `null` is a first-class provider: the platform must run, and report
    // honestly, with no AI backend configured at all.
    AI_PROVIDER: z.enum(['null', 'ollama', 'openai-compatible']).default('null'),
    AI_MODEL: z.string().optional(),
    AI_API_KEY: z.string().optional(),
    AI_BASE_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  })
  .superRefine((env, ctx) => {
    // Production must never fall back to a development-shaped configuration.
    if (env.NODE_ENV === 'production') {
      for (const origin of env.CORS_ORIGINS) {
        if (origin.startsWith('http://') && !origin.startsWith('http://localhost')) {
          ctx.addIssue({
            code: 'custom',
            path: ['CORS_ORIGINS'],
            message: `insecure origin "${origin}" is not permitted in production`,
          });
        }
      }
    }
    // A configured provider without a model is a silent misconfiguration that
    // would only surface on the first user request.
    if (env.AI_PROVIDER !== 'null' && !env.AI_MODEL) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_MODEL'],
        message: `AI_MODEL is required when AI_PROVIDER is "${env.AI_PROVIDER}"`,
      });
    }
    if (env.AI_PROVIDER === 'openai-compatible' && !env.AI_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_BASE_URL'],
        message: 'AI_BASE_URL is required for an openai-compatible provider',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
