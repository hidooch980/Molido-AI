import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type CashBox = Record<string, unknown> & { id: string; balance: string };

@Injectable()
export class CashBoxService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId: string) {
    return this.db.query(
      `SELECT b.*, (SELECT count(*)::int FROM "Payment" p WHERE p."cashBoxId" = b.id) AS "paymentCount"
       FROM "CashBox" b WHERE b."companyId" = $1 ORDER BY b."createdAt" DESC`,
      [companyId],
    );
  }

  async findOne(id: string, companyId: string) {
    const boxes = await this.db.query<CashBox>(
      'SELECT * FROM "CashBox" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!boxes[0]) throw new NotFoundException('صندوق یافت نشد');

    const payments = await this.db.query(
      'SELECT * FROM "Payment" WHERE "cashBoxId" = $1 ORDER BY "createdAt" DESC LIMIT 30',
      [id],
    );
    return { ...boxes[0], payments };
  }

  async create(companyId: string, data: { name: string; code: string; balance?: number }) {
    const boxes = await this.db.query<CashBox>(
      `INSERT INTO "CashBox" (id, "companyId", name, code, balance)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [randomUUID(), companyId, data.name, data.code, data.balance ?? 0],
    );
    return boxes[0];
  }

  /** واریز به صندوق */
  async deposit(id: string, companyId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('مبلغ باید بزرگ‌تر از صفر باشد');

    const boxes = await this.db.query<CashBox>(
      `UPDATE "CashBox" SET balance = balance + $1, "updatedAt" = now()
       WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [amount, id, companyId],
    );
    if (!boxes[0]) throw new NotFoundException('صندوق یافت نشد');
    return boxes[0];
  }

  /**
   * برداشت از صندوق. The balance check lives in the UPDATE itself so a
   * concurrent withdrawal cannot drive the box negative.
   */
  async withdraw(id: string, companyId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('مبلغ باید بزرگ‌تر از صفر باشد');

    const boxes = await this.db.query<CashBox>(
      `UPDATE "CashBox" SET balance = balance - $1, "updatedAt" = now()
       WHERE id = $2 AND "companyId" = $3 AND balance >= $1 RETURNING *`,
      [amount, id, companyId],
    );
    if (boxes[0]) return boxes[0];

    await this.findOne(id, companyId); // throws when the box does not exist
    throw new BadRequestException('موجودی صندوق کافی نیست');
  }

  async remove(id: string, companyId: string) {
    const box = await this.findOne(id, companyId);
    await this.db.execute('DELETE FROM "CashBox" WHERE id = $1', [id]);
    return box;
  }
}
