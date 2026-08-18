import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * The JWT module is registered without a secret on purpose: signing and
 * verification both pass the validated secret explicitly at call time, so there
 * is exactly one place a secret is read from — `@molido/config`.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, SessionService, TokenService],
  exports: [AuthService, SessionService, TokenService],
})
export class AuthModule {}
