import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PriceLevelsService extends BaseCrudService {
  protected readonly table = 'PriceLevel';
  protected readonly notFoundMessage = 'سطح قیمت یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
