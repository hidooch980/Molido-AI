import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ApprovalsService extends BaseCrudService {
  protected readonly table = 'ApprovalRequest';
  protected readonly notFoundMessage = 'گردش‌کار تأیید یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
