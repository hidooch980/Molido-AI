import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LeaveRequestsService extends BaseCrudService {
  protected readonly table = 'LeaveRequest';
  protected readonly notFoundMessage = 'مرخصی یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
