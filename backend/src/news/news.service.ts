import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NewsService extends BaseCrudService {
  protected readonly table = 'NewsPost';
  protected readonly notFoundMessage = 'روابط عمومی یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
