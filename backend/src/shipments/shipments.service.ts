import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ShipmentsService extends BaseCrudService {
  protected readonly table = 'Shipment';
  protected readonly notFoundMessage = 'ارسال‌ها یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
