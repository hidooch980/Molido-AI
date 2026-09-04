import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TendersService extends BaseCrudService {
  protected readonly table = 'Tender';
  protected readonly notFoundMessage = 'مناقصه یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
