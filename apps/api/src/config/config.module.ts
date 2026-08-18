import { Global, Module } from '@nestjs/common';
import { loadConfig, type AppConfig } from '@molido/config';

/** DI token for the validated application configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Configuration is loaded once, at module construction, and shared as a frozen
 * value. If the environment is invalid the process dies here — before Nest
 * builds a single controller and long before a request can arrive.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(process.env),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
