import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LoansService extends BaseCrudService {
  protected readonly table = 'Loan';
  protected readonly notFoundMessage = 'وام‌ها یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
