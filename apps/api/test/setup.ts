import { randomUUID } from 'node:crypto';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from '../src/app.module';
import { registerRequestIdHook } from '../src/common/request-id.hook';
import { PrismaService } from '../src/modules/prisma/prisma.service';

/**
 * Boot the real application for integration tests.
 *
 * The point of these tests is that they exercise the same guards, the same
 * validation pipe and the same security headers the production bootstrap
 * installs. A test harness that skips those would prove nothing about the
 * controls it is meant to verify.
 */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 256 * 1024, logger: false }),
    // Without this, a dependency-injection failure calls `process.abort()`,
    // which a test worker cannot do — the real error is lost and the run dies
    // with an unrelated IPC message. Throwing surfaces the actual cause.
    { logger: false, abortOnError: false },
  );

  registerRequestIdHook(app.getHttpAdapter().getInstance());

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    noSniff: true,
    hsts: false,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/**
 * Remove all transactional data between tests, leaving the seeded roles,
 * permissions and agent registry intact.
 *
 * TRUNCATE ... CASCADE rather than deleteMany: it is one statement, it resets
 * the tables regardless of foreign-key order, and it cannot leave a partially
 * cleaned database behind if a test failed mid-write.
 */
export async function resetData(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ai_tasks", "security_events", "audit_logs", "system_events", "sessions", "user_roles", "users" RESTART IDENTITY CASCADE',
  );
}

/** A password that satisfies the policy, unique per call. */
export function strongPassword(): string {
  return `Molido-${randomUUID()}-passphrase`;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@molido.test`;
}
