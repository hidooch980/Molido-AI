/**
 * @molido/logger — structured logging with redaction built in.
 *
 * Redaction is not opt-in. Every logger produced here strips credentials before
 * anything is serialised, so "don't log the password" is a property of the
 * infrastructure rather than a rule each developer has to remember.
 */

export * from './logger';
export * from './security-events';
