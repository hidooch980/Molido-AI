import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UtilityMetersService extends BaseCrudService {
  protected readonly table = 'UtilityMeter';
  protected readonly notFoundMessage = 'کنتور آب و گاز یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
