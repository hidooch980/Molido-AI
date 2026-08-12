import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AttendanceService extends BaseCrudService {
  protected readonly table = 'AttendanceRecord';
  protected readonly notFoundMessage = 'حضور و غیاب یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
