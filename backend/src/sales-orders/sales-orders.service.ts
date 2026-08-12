import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SalesOrdersService extends BaseCrudService {
  protected readonly table = 'SalesOrder';
  protected readonly notFoundMessage = 'سفارش آنلاین یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
