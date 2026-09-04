import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  [key: string]: unknown;
};

type CategoryNode = CategoryRow & {
  productCount: number;
  children: CategoryNode[];
};

/**
 * دسته‌بندی کالا.
 *
 * ستون `parentId` از ابتدا وجود داشت ولی هیچ‌جا استفاده نمی‌شد: لیست تخت
 * برمی‌گشت و ساختن «نوشیدنی ← نوشابه ← نوشابهٔ قوطی» ممکن نبود.
 */
@Injectable()
export class CategoriesService extends BaseCrudService<CategoryRow> {
  protected readonly table = 'Category';
  protected readonly notFoundMessage = 'دسته‌بندی یافت نشد';
  protected readonly orderColumn = 'name';
  protected readonly searchColumns = ['name', 'description'] as const;

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * درخت دسته‌بندی به همراه تعداد کالای هر گره.
   *
   * درخت **در حافظه** ساخته می‌شود نه با `WITH RECURSIVE`: تعداد دسته‌ها در
   * یک فروشگاه ده‌ها است نه ده‌ها هزار، و پرس‌وجوی بازگشتی اینجا فقط
   * پیچیدگی اضافه می‌کند بی‌آنکه چیزی سریع‌تر شود.
   */
  async tree(companyId: string): Promise<CategoryNode[]> {
    const rows = await this.db.query<CategoryRow & { productCount: string }>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM "Product" p
                WHERE p."categoryId" = c.id) AS "productCount"
         FROM "Category" c
        WHERE c."companyId" = $1
        ORDER BY c.name`,
      [companyId],
    );

    const byId = new Map<string, CategoryNode>();

    for (const row of rows) {
      byId.set(row.id, {
        ...row,
        productCount: Number(row.productCount ?? 0),
        children: [],
      });
    }

    const roots: CategoryNode[] = [];

    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : null;

      // والدِ گم‌شده (حذف‌شده، یا متعلق به شرکت دیگر و پشت RLS نامرئی) گره
      // را ریشه می‌کند.  اگر رها می‌شد، دسته از درخت ناپدید می‌شد بی‌آنکه
      // کسی بفهمد کالاهایش کجا رفته‌اند.
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    return roots;
  }

  async create(companyId: string, data: Record<string, unknown>) {
    await this.assertParentExists(companyId, data.parentId);
    return super.create(companyId, this.normalise(data));
  }

  async update(companyId: string, id: string, data: Record<string, unknown>) {
    if (data.parentId) {
      if (data.parentId === id) {
        throw new BadRequestException('دسته نمی‌تواند والد خودش باشد');
      }

      await this.assertParentExists(companyId, data.parentId);
      await this.assertNoCycle(id, String(data.parentId));
    }

    return super.update(companyId, id, this.normalise(data));
  }

  /**
   * حذف دسته.
   *
   * دسته‌ای که کالا یا زیرمجموعه دارد حذف نمی‌شود: در حالت اول کالاها
   * بی‌دسته می‌شدند و در حالت دوم زیرشاخه‌ها از درخت می‌افتادند — هر دو
   * بی‌سروصدا، چون FK اینجا CASCADE نیست.
   */
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);

    const [blockers] = await this.db.query<{ products: string; children: string }>(
      `SELECT
         (SELECT COUNT(*) FROM "Product"  WHERE "categoryId" = $1) AS products,
         (SELECT COUNT(*) FROM "Category" WHERE "parentId"   = $1) AS children`,
      [id],
    );

    const products = Number(blockers?.products ?? 0);
    const children = Number(blockers?.children ?? 0);

    if (products > 0) {
      throw new BadRequestException(
        `${products} کالا در این دسته است؛ اول آن‌ها را به دستهٔ دیگری منتقل کنید`,
      );
    }

    if (children > 0) {
      throw new BadRequestException(
        `${children} زیرمجموعه دارد؛ اول آن‌ها را حذف یا جابه‌جا کنید`,
      );
    }

    return super.remove(companyId, id);
  }

  /** رشتهٔ خالی از فرم یعنی «بدون والد»، نه والدی به نام «». */
  private normalise(data: Record<string, unknown>): Record<string, unknown> {
    if (data.parentId === '') return { ...data, parentId: null };
    return data;
  }

  private async assertParentExists(companyId: string, parentId: unknown) {
    if (!parentId) return;

    const rows = await this.db.query<{ id: string }>(
      'SELECT id FROM "Category" WHERE id = $1 AND "companyId" = $2',
      [parentId, companyId],
    );

    if (!rows[0]) throw new NotFoundException('دستهٔ والد یافت نشد');
  }

  /**
   * والدِ تازه نباید از نوادگان همین گره باشد.
   *
   * بدون این بررسی درخت به چرخه تبدیل می‌شود و ساخت درخت در حافظه هر دو
   * شاخه را از ریشه‌ها حذف می‌کند — دسته‌ها بی‌سروصدا از صفحه غیب می‌شوند.
   */
  private async assertNoCycle(id: string, parentId: string) {
    const descendants = await this.db.query<{ id: string }>(
      `WITH RECURSIVE sub AS (
         SELECT id FROM "Category" WHERE "parentId" = $1
         UNION
         SELECT c.id FROM "Category" c JOIN sub ON c."parentId" = sub.id
       )
       SELECT id FROM sub`,
      [id],
    );

    if (descendants.some((row) => row.id === parentId)) {
      throw new BadRequestException(
        'والد انتخابی زیرمجموعهٔ همین دسته است و حلقه می‌سازد',
      );
    }
  }
}
