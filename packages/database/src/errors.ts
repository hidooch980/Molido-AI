import { Prisma } from '@prisma/client';

/**
 * Prisma error codes the application handles deliberately.
 * @see https://www.prisma.io/docs/reference/api-reference/error-reference
 */
export const PRISMA_ERROR = {
  UNIQUE_CONSTRAINT: 'P2002',
  FOREIGN_KEY_CONSTRAINT: 'P2003',
  RECORD_NOT_FOUND: 'P2025',
} as const;

export function isPrismaKnownError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/** True when the failure was a unique-constraint violation on `field`. */
export function isUniqueConstraintViolation(error: unknown, field?: string): boolean {
  if (!isPrismaKnownError(error) || error.code !== PRISMA_ERROR.UNIQUE_CONSTRAINT) return false;
  if (!field) return true;
  const target = error.meta?.['target'];
  return Array.isArray(target) ? target.includes(field) : target === field;
}

export function isRecordNotFound(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === PRISMA_ERROR.RECORD_NOT_FOUND;
}
