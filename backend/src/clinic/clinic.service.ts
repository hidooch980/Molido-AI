import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ClinicService extends BaseCrudService {
  protected readonly table = 'ClinicRecord';
  protected readonly notFoundMessage = 'درمانگاه یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
