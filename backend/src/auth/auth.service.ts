import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('کاربری با این ایمیل قبلاً ثبت شده است');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    let companyId: string | null = null;

    if (dto.companyName) {
      const company = await this.prisma.company.create({
        data: { name: dto.companyName },
      });
      companyId = company.id;
    }

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        password: hashedPassword,
        role: dto.companyName ? 'ADMIN' : 'EMPLOYEE',
        companyId,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('ایمیل یا رمز عبور اشتباه است');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('ایمیل یا رمز عبور اشتباه است');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('حساب کاربری شما غیرفعال است');
    }

    return this.buildAuthResponse(user);
  }

  /**
   * تمدید توکن با Refresh Token
   */
  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('توکن ارسال نشده است');
    }

    let payload: { sub: string };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('توکن نامعتبر یا منقضی شده است');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('کاربر یافت نشد یا غیرفعال است');
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        avatar: true,
        companyId: true,
        company: { select: { id: true, name: true } },
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد');
    }

    return user;
  }

  private refreshSecret(): string {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET');

    if (refreshSecret) {
      return refreshSecret;
    }

    const jwtSecret = this.configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error(
        'JWT_SECRET is required. Set it in your .env file (e.g. openssl rand -hex 32).',
      );
    }

    return `${jwtSecret}_refresh`;
  }

  private buildAuthResponse(user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    companyId: string | null;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.refreshSecret(),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ||
          '30d') as JwtSignOptions['expiresIn'],
      }),
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
    };
  }
}
