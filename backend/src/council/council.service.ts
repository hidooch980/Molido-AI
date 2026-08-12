import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CouncilService extends BaseCrudService {
  protected readonly table = 'CouncilMeeting';
  protected readonly notFoundMessage = 'جلسات شورا یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
