/**
 * Transport contracts shared by the API and the web client.
 *
 * Keeping these in one place means a breaking change to a response shape is a
 * compile error in the frontend rather than a runtime surprise.
 */

import type { AiAgentStatus, AiTaskStatus, EventLevel, UserStatus } from './enums';
import type { Permission, RoleName } from './roles';

/** Health of a single dependency the API relies on. */
export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'down' | 'disabled';
  /** Round-trip time of the probe, in milliseconds. */
  latencyMs?: number;
  /** Human-readable detail. Never contains credentials or connection strings. */
  detail?: string;
}

/** `GET /api/v1/health` */
export interface HealthResponse {
  status: 'ok';
  service: 'molido-api';
}

/** `GET /api/v1/health/detailed` */
export interface DetailedHealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: 'molido-api';
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    ai: ComponentHealth;
  };
}

/** Shape of every error the API returns. Deliberately free of internals. */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Correlates a user-facing error with the structured server log. */
  requestId: string;
  timestamp: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  roles: RoleName[];
  permissions: Permission[];
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  /**
   * Opaque, high-entropy value. Stored server-side only as a SHA-256 digest and
   * rotated on every refresh.
   */
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}

export interface PublicSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  /** True for the session the request itself was authenticated with. */
  current: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface PublicAiAgent {
  id: string;
  key: string;
  name: string;
  description: string;
  status: AiAgentStatus;
  permissions: string[];
}

export interface PublicAiTask {
  id: string;
  goal: string;
  status: AiTaskStatus;
  agentKey: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PublicSystemEvent {
  id: string;
  level: EventLevel;
  category: string;
  message: string;
  createdAt: string;
}
