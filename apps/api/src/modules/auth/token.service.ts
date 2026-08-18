import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type AppConfig, parseDurationToSeconds } from '@molido/config';
import { generateOpaqueToken, hashToken } from '@molido/security';
import type { Permission, RoleName } from '@molido/types';
import { APP_CONFIG } from '../../config/config.module';

/** Claims carried by an access token. Small, and never secret. */
export interface AccessTokenClaims {
  /** Subject: the user id. */
  sub: string;
  /** Session id, so an access token can be tied back to a revocable session. */
  sid: string;
  email: string;
  roles: RoleName[];
  permissions: Permission[];
}

export interface IssuedRefreshToken {
  /** Returned to the client exactly once. Never persisted. */
  token: string;
  /** SHA-256 digest — this is what goes in the database. */
  hash: string;
  expiresAt: Date;
}

/**
 * Mints and verifies tokens.
 *
 * Access tokens are JWTs: short-lived, self-contained, cheap to verify on every
 * request. Refresh tokens are opaque random values: long-lived, meaningless
 * without their database row, and therefore revocable the instant that row is
 * marked revoked.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get accessTokenTtlSeconds(): number {
    return parseDurationToSeconds(this.config.auth.accessTokenTtl);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.auth.accessSecret,
      // Validated at config load against /^\d+(ms|s|m|h|d)?$/; `jsonwebtoken`
      // types this as a template-literal union that a plain string cannot
      // satisfy, so the shape is asserted rather than re-validated here.
      expiresIn: this.config.auth.accessTokenTtl as `${number}${'s' | 'm' | 'h' | 'd'}`,
      issuer: this.config.auth.issuer,
      audience: this.config.auth.audience,
    });
  }

  /**
   * Verify an access token.
   *
   * Issuer and audience are checked, not just the signature: a token minted by
   * this secret for a different service must not be accepted here.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token, {
      secret: this.config.auth.accessSecret,
      issuer: this.config.auth.issuer,
      audience: this.config.auth.audience,
    });
  }

  issueRefreshToken(): IssuedRefreshToken {
    const token = generateOpaqueToken();
    const expiresAt = new Date(
      Date.now() + this.config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    return { token, hash: hashToken(token), expiresAt };
  }

  hashRefreshToken(token: string): string {
    return hashToken(token);
  }
}
