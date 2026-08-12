import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CategoriesService extends BaseCrudService {
  protected readonly table = 'Category';
  protected readonly notFoundMessage = 'دسته‌بندی یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
