import { generateRequestId } from '@molido/security';
import type { FastifyInstance } from 'fastify';
import type { MolidoRequest } from './request-context';

/**
 * Assign every request a correlation id, before anything else runs.
 *
 * This is a Fastify `onRequest` hook rather than a Nest interceptor for a
 * specific reason: interceptors run *after* guards, so a request rejected by
 * authentication or rate limiting would carry no id — losing the correlation
 * precisely on the failures an operator most needs to trace.
 *
 * An inbound `X-Request-Id` is never trusted: honouring it would let a caller
 * collide their requests with someone else's log entries.
 */
export function registerRequestIdHook(instance: FastifyInstance): void {
  instance.addHook('onRequest', (request, reply, done) => {
    const requestId = generateRequestId();
    (request as unknown as MolidoRequest).requestId = requestId;
    void reply.header('x-request-id', requestId);
    done();
  });
}
