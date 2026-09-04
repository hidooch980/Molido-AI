import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BudgetService extends BaseCrudService {
  protected readonly table = 'Budget';
  protected readonly notFoundMessage = 'بودجه یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
