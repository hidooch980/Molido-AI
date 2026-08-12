import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ECityService extends BaseCrudService {
  protected readonly table = 'CityServiceRequest';
  protected readonly notFoundMessage = 'شهر الکترونیک یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
