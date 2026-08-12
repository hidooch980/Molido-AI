import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InvestmentsService extends BaseCrudService {
  protected readonly table = 'Investment';
  protected readonly notFoundMessage = 'سرمایه‌گذاری یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
