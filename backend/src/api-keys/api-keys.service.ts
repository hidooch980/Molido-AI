import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ApiKeysService extends BaseCrudService {
  protected readonly table = 'ApiKey';
  protected readonly notFoundMessage = 'کلیدهای API یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
