import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditLogService extends BaseCrudService {
  protected readonly table = 'AuditLog';
  protected readonly notFoundMessage = 'لاگ سیستم یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
