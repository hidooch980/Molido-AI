import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@molido/database';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { SessionService } from '../../modules/auth/session.service';
import { TokenService } from '../../modules/auth/token.service';
import type { MolidoRequest } from '../request-context';

/**
 * Authenticates every request that has not explicitly opted out.
 *
 * A valid signature is necessary but not sufficient. The guard also confirms
 * that the session behind the token is still active and that the account is
 * still ACTIVE — otherwise a logged-out or suspended user would keep working
 * until their access token happened to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<MolidoRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let claims;
    try {
      claims = await this.tokens.verifyAccessToken(token);
    } catch {
      // Expired, wrong issuer, tampered — the caller learns none of that.
      throw new UnauthorizedException('Authentication required');
    }

    if (!(await this.sessions.isActive(claims.sid))) {
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, status: true, email: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    request.actor = {
      userId: claims.sub,
      sessionId: claims.sid,
      email: user.email,
      roles: claims.roles ?? [],
      permissions: claims.permissions ?? [],
    };

    // Fire-and-forget: session bookkeeping must not add latency to every call.
    void this.sessions.touch(claims.sid);

    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}
