import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TaxiService extends BaseCrudService {
  protected readonly table = 'TaxiDriver';
  protected readonly notFoundMessage = 'تاکسیرانی یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
