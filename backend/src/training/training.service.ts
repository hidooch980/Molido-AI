import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TrainingService extends BaseCrudService {
  protected readonly table = 'TrainingCourse';
  protected readonly notFoundMessage = 'آموزش کارکنان یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
