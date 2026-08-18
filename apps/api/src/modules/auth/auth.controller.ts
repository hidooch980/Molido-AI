import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthResponse, PublicSession, PublicUser } from '@molido/types';
import { Actor } from '../../common/decorators/actor.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  clientIp,
  clientUserAgent,
  type AuthenticatedActor,
  type MolidoRequest,
} from '../../common/request-context';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import type { SessionContext } from './session.service';

/**
 * Authentication endpoints.
 *
 * Every route under this controller is governed by the stricter `auth` rate
 * limiter, scoped by path in `AppModule` — so the tighter ceiling cannot be
 * forgotten on a route added later, and its value stays configurable rather
 * than baked into a decorator here.
 */
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account and start a session.' })
  async register(@Body() dto: RegisterDto, @Req() request: MolidoRequest): Promise<AuthResponse> {
    return this.auth.register(dto, sessionContext(request, dto.deviceId));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an access and refresh token.' })
  async login(@Body() dto: LoginDto, @Req() request: MolidoRequest): Promise<AuthResponse> {
    return this.auth.login(dto, sessionContext(request, dto.deviceId));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token. The presented token is invalidated.' })
  async refresh(@Body() dto: RefreshDto, @Req() request: MolidoRequest): Promise<AuthResponse> {
    return this.auth.refresh(dto.refreshToken, sessionContext(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session.' })
  async logout(
    @Body() dto: LogoutDto,
    @Actor() actor: AuthenticatedActor,
    @Req() request: MolidoRequest,
  ): Promise<{ revoked: number }> {
    return this.auth.logout(actor.userId, actor.sessionId, dto.refreshToken, sessionContext(request));
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every active session for the current user.' })
  async logoutAll(
    @Actor() actor: AuthenticatedActor,
    @Req() request: MolidoRequest,
  ): Promise<{ revoked: number }> {
    return this.auth.logoutAll(actor.userId, sessionContext(request));
  }

  @Get('me')
  @ApiOperation({ summary: 'The authenticated account. Never includes credentials.' })
  async me(@Actor() actor: AuthenticatedActor): Promise<PublicUser> {
    return this.auth.getPublicUser(actor.userId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List the current user’s active sessions.' })
  async sessions(@Actor() actor: AuthenticatedActor): Promise<PublicSession[]> {
    return this.auth.listSessions(actor.userId, actor.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke one of the current user’s sessions.' })
  async revokeSession(
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Actor() actor: AuthenticatedActor,
    @Req() request: MolidoRequest,
  ): Promise<{ revoked: boolean }> {
    // Scoped to the actor's own sessions inside the service, so passing another
    // user's session id simply revokes nothing.
    const revoked = await this.auth.revokeSession(actor.userId, sessionId, sessionContext(request));
    return { revoked };
  }
}

function sessionContext(request: MolidoRequest, deviceId?: string): SessionContext {
  return {
    ipAddress: clientIp(request),
    userAgent: clientUserAgent(request),
    deviceId: deviceId ?? null,
    requestId: request.requestId ?? null,
  };
}
