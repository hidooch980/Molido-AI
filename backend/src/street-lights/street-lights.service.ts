import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class StreetLightsService extends BaseCrudService {
  protected readonly table = 'StreetLight';
  protected readonly notFoundMessage = 'روشنایی معابر یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
