import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PropertyAuditService extends BaseCrudService {
  protected readonly table = 'PropertyAudit';
  protected readonly notFoundMessage = 'ممیزی نوسازی یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
