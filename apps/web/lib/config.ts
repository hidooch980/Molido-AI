/**
 * Client configuration.
 *
 * Only `NEXT_PUBLIC_*` values are readable here, and every one of them ends up
 * in the browser bundle. Nothing secret may ever be routed through this file —
 * the API key, the database URL and the JWT secret live server-side only.
 */

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'MOLIDO AI',
  tagline: 'FROM ZERO. FOR THE FUTURE.',
} as const;

export const API_V1 = `${config.apiUrl}/api/v1`;
