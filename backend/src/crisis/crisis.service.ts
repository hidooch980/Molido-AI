import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CrisisService extends BaseCrudService {
  protected readonly table = 'CrisisEvent';
  protected readonly notFoundMessage = 'مدیریت بحران یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
