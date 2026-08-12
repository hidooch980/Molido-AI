import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WarehousesService extends BaseCrudService {
  protected readonly table = 'Warehouse';
  protected readonly notFoundMessage = 'انبار یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
