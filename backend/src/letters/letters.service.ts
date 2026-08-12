import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LettersService extends BaseCrudService {
  protected readonly table = 'Letter';
  protected readonly notFoundMessage = 'دبیرخانه یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
