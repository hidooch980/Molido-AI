import { type ExecutionContext, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { AppConfig } from '@molido/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { MolidoThrottlerGuard } from './common/guards/throttler.guard';
import { APP_CONFIG, AppConfigModule } from './config/config.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { OversightModule } from './modules/oversight/oversight.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';

/** Routes that accept credentials, and are therefore rate limited far harder. */
const AUTH_ROUTE_PREFIX = '/api/v1/auth/';

function isAuthRoute(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') return false;
  const request = context.switchToHttp().getRequest<{ url?: string }>();
  return (request.url ?? '').startsWith(AUTH_ROUTE_PREFIX);
}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    OversightModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        // Two limiters with disjoint scopes, both driven entirely by validated
        // configuration. Nothing is hardcoded at a route, so an operator can
        // retune limits for an environment without touching code — and the
        // test suite can raise them without weakening what ships.
        throttlers: [
          {
            name: 'default',
            ttl: config.rateLimit.global.ttlSeconds * 1000,
            limit: config.rateLimit.global.limit,
            skipIf: (context) => isAuthRoute(context),
          },
          {
            // Credential-accepting routes only, where a generous ceiling would
            // be an invitation to guess passwords.
            name: 'auth',
            ttl: config.rateLimit.auth.ttlSeconds * 1000,
            limit: config.rateLimit.auth.limit,
            skipIf: (context) => !isAuthRoute(context),
          },
        ],
      }),
    }),
    AuthModule,
    HealthModule,
    AiModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters and is deliberate: rate limiting first so an unauthenticated
    // flood is cheap to reject, then authentication, then authorisation. Every
    // route is protected unless it carries @Public().
    { provide: APP_GUARD, useClass: MolidoThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
