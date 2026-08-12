import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CemeteryService extends BaseCrudService {
  protected readonly table = 'Cemetery';
  protected readonly notFoundMessage = 'آرامستان یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
