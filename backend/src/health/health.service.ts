import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class HealthService extends BaseCrudService {
  protected readonly table = 'HealthCheckLog';
  protected readonly notFoundMessage = 'وضعیت سیستم یافت نشد';
  protected readonly orderColumn = 'checkedAt';

  constructor(db: DatabaseService) {
    super(db);
  }
}
