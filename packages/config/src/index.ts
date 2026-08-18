/**
 * @molido/config — validated runtime configuration.
 *
 * Services import `loadConfig` once at boot. If the environment is wrong, the
 * process exits before it can accept a single request.
 */

export * from './env.schema';
export * from './load-config';
export * from './duration';
