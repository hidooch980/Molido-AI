import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ParkingService extends BaseCrudService {
  protected readonly table = 'ParkingLot';
  protected readonly notFoundMessage = 'پارکینگ یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
