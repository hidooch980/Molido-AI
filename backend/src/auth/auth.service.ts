import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  password: string;
  role: string;
  status: string;
  avatar: string | null;
  companyId: string | null;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.findUser('email', dto.email);
    if (existing) throw new ConflictException('A user with this email already exists');

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.db.transaction(async (client) => {
      let companyId: string | null = null;
      if (dto.companyName) {
        companyId = randomUUID();
        await client.query('INSERT INTO "Company" (id, name) VALUES ($1, $2)', [
          companyId,
          dto.companyName,
        ]);
      }

      const rows = await client.query<UserRow>(
        `INSERT INTO "User" (id, "firstName", "lastName", email, phone, password, role, "companyId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, "firstName", "lastName", email, phone, password, role, status, avatar, "companyId", "createdAt"`,
        [
          randomUUID(),
          dto.firstName,
          dto.lastName,
          dto.email,
          dto.phone ?? null,
          password,
          dto.companyName ? 'ADMIN' : 'EMPLOYEE',
          companyId,
        ],
      );
      return rows.rows[0];
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.findUser('email', dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('User account is inactive');
    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token is required');
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: this.refreshSecret() });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const user = await this.findUser('id', payload.sub);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User not found or inactive');
    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    const rows = await this.db.query<UserRow & { companyName: string | null }>(
      `SELECT u.id, u."firstName", u."lastName", u.email, u.phone, u.role, u.status, u.avatar,
              u."companyId", u."createdAt", c.name AS "companyName"
       FROM "User" u LEFT JOIN "Company" c ON c.id = u."companyId" WHERE u.id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user) throw new UnauthorizedException('User not found');
    const { companyName, ...safeUser } = user;
    return { ...safeUser, company: user.companyId ? { id: user.companyId, name: companyName } : null };
  }

  private async findUser(field: 'id' | 'email', value: string): Promise<UserRow | undefined> {
    const rows = await this.db.query<UserRow>(
      `SELECT id, "firstName", "lastName", email, phone, password, role, status, avatar, "companyId", "createdAt"
       FROM "User" WHERE ${field === 'id' ? 'id' : 'email'} = $1`,
      [value],
    );
    return rows[0];
  }

  private refreshSecret(): string {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (refreshSecret) return refreshSecret;
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) throw new Error('JWT_SECRET is required');
    return `${jwtSecret}_refresh`;
  }

  private buildAuthResponse(user: Pick<UserRow, 'id' | 'firstName' | 'lastName' | 'email' | 'role' | 'companyId'>) {
    const payload = { sub: user.id, email: user.email, role: user.role, companyId: user.companyId };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.refreshSecret(),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d') as never,
      }),
      user,
    };
  }
}
