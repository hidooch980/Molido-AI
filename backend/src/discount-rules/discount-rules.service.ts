import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DiscountRulesService extends BaseCrudService {
  protected readonly table = 'DiscountRule';
  protected readonly notFoundMessage = 'قوانین تخفیف یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
