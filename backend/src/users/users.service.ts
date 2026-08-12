import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type SafeUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  avatar: string | null;
  companyId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const SAFE_COLUMNS = `id, "firstName", "lastName", email, phone, role, status, avatar,
  "companyId", "createdAt", "updatedAt"`;

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId: string | null): Promise<SafeUser[]> {
    return companyId
      ? this.db.query<SafeUser>(`SELECT ${SAFE_COLUMNS} FROM "User" WHERE "companyId" = $1 ORDER BY "createdAt" DESC`, [companyId])
      : this.db.query<SafeUser>(`SELECT ${SAFE_COLUMNS} FROM "User" ORDER BY "createdAt" DESC`);
  }

  async findOne(id: string): Promise<SafeUser> {
    const users = await this.db.query<SafeUser>(`SELECT ${SAFE_COLUMNS} FROM "User" WHERE id = $1`, [id]);
    if (!users[0]) throw new NotFoundException('User not found');
    return users[0];
  }

  async create(dto: CreateUserDto, companyId: string | null): Promise<SafeUser> {
    const duplicate = await this.db.query<{ id: string }>('SELECT id FROM "User" WHERE email = $1', [dto.email]);
    if (duplicate[0]) throw new ConflictException('A user with this email already exists');
    const password = await bcrypt.hash(dto.password, 10);
    const users = await this.db.query<SafeUser>(
      `INSERT INTO "User" (id, "firstName", "lastName", email, phone, password, role, "companyId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${SAFE_COLUMNS}`,
      [randomUUID(), dto.firstName, dto.lastName, dto.email, dto.phone ?? null, password, dto.role ?? 'EMPLOYEE', companyId],
    );
    return users[0];
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.findOne(id);
    const allowed = ['firstName', 'lastName', 'email', 'phone', 'role', 'status', 'avatar'] as const;
    const entries: Array<[string, unknown]> = allowed
      .filter((key) => dto[key] !== undefined)
      .map((key) => [key, dto[key]]);
    if (dto.password) entries.push(['password', await bcrypt.hash(dto.password, 10)]);
    if (!entries.length) return this.findOne(id);
    const sets = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(', ');
    const users = await this.db.query<SafeUser>(
      `UPDATE "User" SET ${sets}, "updatedAt" = now() WHERE id = $${entries.length + 1} RETURNING ${SAFE_COLUMNS}`,
      [...entries.map(([, value]) => value), id],
    );
    return users[0];
  }

  async remove(id: string): Promise<SafeUser> {
    await this.findOne(id);
    const users = await this.db.query<SafeUser>(`DELETE FROM "User" WHERE id = $1 RETURNING ${SAFE_COLUMNS}`, [id]);
    return users[0];
  }
}
