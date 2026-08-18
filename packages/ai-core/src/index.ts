/**
 * @molido/ai-core — the boundary between MOLIDO and any AI vendor.
 *
 * Everything above this package talks to `AIProvider`. Nothing above it knows
 * whether the model runs on the developer's laptop or behind someone's API, and
 * that is what keeps the platform from being captured by a single supplier.
 */

export * from './types';
export * from './errors';
export * from './usage';
export * from './factory';
export * from './providers/null.provider';
export * from './providers/ollama.provider';
export * from './providers/openai-compatible.provider';
export { extractJson } from './providers/http';
