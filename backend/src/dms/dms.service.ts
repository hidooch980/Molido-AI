import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DmsService extends BaseCrudService {
  protected readonly table = 'DocumentFolder';
  protected readonly notFoundMessage = 'مدیریت اسناد یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
