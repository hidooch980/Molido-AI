import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PerformanceService extends BaseCrudService {
  protected readonly table = 'PerformanceReview';
  protected readonly notFoundMessage = 'ارزیابی عملکرد یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
