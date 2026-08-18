import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigValidationError } from '@molido/config';
import { bootstrap } from './bootstrap';

/**
 * A configuration failure kills the process here, before anything can serve a
 * request. The message names the offending variables and never their values.
 */
bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');

  if (error instanceof ConfigValidationError) {
    logger.error('MOLIDO AI API failed to start — invalid configuration');
    for (const issue of error.issues) {
      logger.error(`  ${issue}`);
    }
    logger.error('See .env.example for the full list of required variables.');
  } else {
    logger.error('MOLIDO AI API failed to start', error instanceof Error ? error.stack : error);
  }

  process.exit(1);
});
