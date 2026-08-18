import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import type { AppConfig } from '@molido/config';
import { AppModule } from './app.module';
import { registerRequestIdHook } from './common/request-id.hook';
import { APP_CONFIG } from './config/config.module';

/** Requests larger than this are refused before a handler ever sees them. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Build the application with every transport-level control in place.
 *
 * Exported separately from `main.ts` so tests boot the identical stack — a
 * security control that is only wired up in production is a control nobody has
 * actually tested.
 */
export async function createApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    bodyLimit: MAX_BODY_BYTES,
    // X-Forwarded-* is ignored unless a trusted proxy is declared. Otherwise a
    // caller could spoof their own IP and defeat rate limiting.
    trustProxy: process.env['TRUST_PROXY'] === 'true',
    // Fastify's own request logging is off: RequestContextInterceptor assigns
    // the correlation id, and request logging is owned by the structured
    // logger rather than duplicated by the adapter.
    logger: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  const config = app.get<AppConfig>(APP_CONFIG);

  // Registered on the raw Fastify instance so the correlation id exists before
  // any guard can reject the request.
  registerRequestIdHook(app.getHttpAdapter().getInstance());

  await app.register(helmet, {
    // The API returns JSON, never HTML, so the strictest possible CSP applies.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    // HSTS only makes sense over TLS, which terminates upstream in production.
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    // Removes the header that advertises the framework version.
    hidePoweredBy: true,
    frameguard: { action: 'deny' },
    noSniff: true,
  });

  // An explicit allow-list, validated at config load. `*` is rejected there.
  app.enableCors({
    origin: [...config.api.corsOrigins],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 600,
  });

  app.setGlobalPrefix(config.api.globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: config.api.defaultVersion });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip anything not declared on the DTO...
      whitelist: true,
      // ...and reject outright rather than silently dropping it. Together these
      // close off mass assignment: `{"status":"ACTIVE","roles":["FOUNDER"]}`
      // posted to /auth/register is a 400, not a privilege escalation.
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Validation messages describe the shape of the request, never the state
      // of the system.
      disableErrorMessages: false,
      validationError: { target: false, value: false },
    }),
  );

  app.enableShutdownHooks();

  // OpenAPI is served in non-production environments only: an always-on schema
  // endpoint hands an attacker a map of the API surface.
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('MOLIDO AI API')
        .setDescription('FROM ZERO. FOR THE FUTURE.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = new Logger('Bootstrap');

  await app.listen({ port: config.api.port, host: config.api.host });

  logger.log(`MOLIDO AI API listening on http://${config.api.host}:${config.api.port}`);
  logger.log(`Health: http://${config.api.host}:${config.api.port}/api/v1/health`);
  logger.log(`AI provider: ${config.ai.enabled ? config.ai.provider : 'not configured'}`);
}
