import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type { AppConfig } from '@molido/config';
import { isPrismaKnownError } from '@molido/database';
import { redact } from '@molido/security';
import type { ApiErrorResponse } from '@molido/types';
import type { FastifyReply } from 'fastify';
import { APP_CONFIG } from '../../config/config.module';
import type { MolidoRequest } from '../request-context';

/**
 * Single exit point for every error the API produces.
 *
 * The contract: the client learns *that* something failed and gets a request id
 * to quote; it never learns how. Stack traces, driver messages, SQL, file paths
 * and constraint names stay in the server log, which is where an operator can
 * see them and an attacker cannot.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<MolidoRequest>();
    const requestId = request.requestId ?? 'unknown';

    const { status, error, message, isExpected } = this.classify(exception);

    // 5xx is a defect in our system; 4xx is the client being told "no".
    const logPayload = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: status,
      actorId: request.actor?.userId,
      error: exception instanceof Error ? exception : { value: redact(exception) },
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Unhandled error on ${request.method} ${request.url}`, logPayload);
    } else if (!isExpected) {
      this.logger.warn(`Request rejected: ${request.method} ${request.url}`, logPayload);
    }

    const body: ApiErrorResponse = {
      statusCode: status,
      error,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    };

    void reply.status(status).send(body);
  }

  private classify(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
    isExpected: boolean;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      // Nest's ValidationPipe returns { message: string[], error: string }.
      if (typeof response === 'object' && response !== null) {
        const shaped = response as { message?: unknown; error?: unknown };
        return {
          status,
          error: typeof shaped.error === 'string' ? shaped.error : exception.name,
          message: normalizeMessage(shaped.message ?? exception.message),
          isExpected: status < HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }

      return {
        status,
        error: exception.name,
        message: normalizeMessage(response),
        isExpected: status < HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }

    // A Prisma error reaching this point is a bug, and its message can contain
    // column names, query fragments and connection details. It is logged in
    // full and reported as a bare 500.
    if (isPrismaKnownError(exception)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        isExpected: false,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      // Even in development the response stays generic; the detail is in the
      // log, correlated by request id.
      message: this.config.isProduction
        ? 'An unexpected error occurred'
        : 'An unexpected error occurred (see server logs for this requestId)',
      isExpected: false,
    };
  }
}

function normalizeMessage(value: unknown): string | string[] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value as string[];
  }
  return 'Request could not be processed';
}
