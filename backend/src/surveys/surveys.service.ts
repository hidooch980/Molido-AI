import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SurveysService extends BaseCrudService {
  protected readonly table = 'Survey';
  protected readonly notFoundMessage = 'نظرسنجی یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
