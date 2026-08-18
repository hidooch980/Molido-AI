/**
 * @molido/queue — the boundary between "a task was requested" and "a task was
 * done".
 *
 * Shared by the API (which enqueues) and the worker (which consumes), so the
 * queue name, the payload shape and the retry policy have exactly one
 * definition.
 */

export * from './ai-tasks.queue';
