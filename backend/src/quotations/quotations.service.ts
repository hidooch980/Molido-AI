import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class QuotationsService extends BaseCrudService {
  protected readonly table = 'Quotation';
  protected readonly notFoundMessage = 'پیشنهاد قیمت یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
