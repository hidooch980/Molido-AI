import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CctvService extends BaseCrudService {
  protected readonly table = 'CctvCamera';
  protected readonly notFoundMessage = 'دوربین‌های شهری یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
