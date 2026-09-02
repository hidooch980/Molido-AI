import { Global, Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { BarcodeCatalogService } from './barcode-catalog.service';
import { CatalogController } from './catalog.controller';

/**
 * ⚠️ `@Global()` چون `ProductsService` هم هنگام ثبتِ کالا صدایش
 *    می‌زند — «هر جنسی که ثبت شود» باید به فهرستِ مشترک برگردد،
 *    وگرنه حافظه هرگز پر نمی‌شود.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [BarcodeCatalogService],
  exports: [BarcodeCatalogService],
})
export class CatalogModule {}
