/**
 * صفِ نوشتنِ آفلاین — روی IndexedDB.
 *
 * وقتی شبکه نیست، نوشتن به‌جای شکست خوردن اینجا می‌نشیند و به‌محضِ
 * برگشتِ اتصال فرستاده می‌شود.
 *
 * ⚠️ هر کاربر صفِ **جدا** دارد.
 *
 *    کلیدِ هر رکورد با شناسهٔ کاربر شروع می‌شود، و همگام‌سازی فقط
 *    رکوردهای کاربرِ فعلی را می‌فرستد.
 *
 *    بدون این، روی صندوقی که چند نفر نوبتی کار می‌کنند، شمارشِ
 *    نیمه‌کارهٔ انبارداری که رفته با توکنِ نفرِ بعدی فرستاده می‌شد —
 *    یعنی کارِ یک نفر به نامِ دیگری ثبت می‌شد.
 *
 * ⚠️ فقط برای کاری که **تعارضش ساده** است.
 *
 *    انبارگردانی چنین است: هر انباردار خطِ خودش را می‌شمارد و آخرین
 *    عدد برنده است.  فروش چنین **نیست** — دو صندوقِ آفلاین می‌توانند
 *    آخرین موجودی را بفروشند.  این صف عمداً عمومی نشده.
 */

const DB_NAME = 'molido-offline';
const DB_VERSION = 1;
const STORE = 'writes';

export type QueuedWrite = {
  /** `<userId>:<uuid>` — پیشوند برای جداسازی کاربران. */
  id: string;
  userId: string;
  path: string;
  method: string;
  body: unknown;
  /** برای نمایش در رابط: کدام چیز منتظر است. */
  label: string;
  createdAt: number;
  /** تلاش‌های ناموفق — برای اینکه یک رکوردِ خراب صف را قفل نکند. */
  attempts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/** شناسهٔ کاربر از محتوای توکن — بدون کتابخانه، فقط base64url. */
export function currentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem('molido_token');
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** نوشتن را در صف می‌گذارد.  خطا نمی‌دهد — صف نباید کار را متوقف کند. */
export async function enqueue(
  item: Omit<QueuedWrite, 'id' | 'userId' | 'createdAt' | 'attempts'>,
): Promise<boolean> {
  const userId = currentUserId();
  if (!userId || typeof indexedDB === 'undefined') return false;

  const record: QueuedWrite = {
    ...item,
    id: `${userId}:${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now(),
    attempts: 0,
  };

  try {
    await tx('readwrite', (s) => s.add(record) as IDBRequest<IDBValidKey>);
    return true;
  } catch {
    return false;
  }
}

/** رکوردهای کاربرِ فعلی، قدیمی‌ترین اول. */
export async function pending(): Promise<QueuedWrite[]> {
  const userId = currentUserId();
  if (!userId || typeof indexedDB === 'undefined') return [];
  try {
    const all = await tx<QueuedWrite[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedWrite[]>);
    return all
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

async function remove(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* رکوردی که پاک نشد، دفعهٔ بعد دوباره تلاش می‌شود */
  }
}

async function bumpAttempts(record: QueuedWrite): Promise<void> {
  try {
    await tx('readwrite', (s) =>
      s.put({ ...record, attempts: record.attempts + 1 }) as IDBRequest<IDBValidKey>,
    );
  } catch {
    /* بی‌اهمیت */
  }
}

/**
 * سقفِ تلاش.
 *
 * ⚠️ رکوردی که سرور **رد** می‌کند (۴۰۰/۴۰۳/۴۰۴) بی‌درنگ حذف می‌شود،
 *    نه پس از پنج تلاش: پاسخِ سرور تغییر نخواهد کرد و نگه داشتنش فقط
 *    صف را قفل می‌کند.
 *
 *    این سقف برای خطای **شبکه** است — جایی که تلاشِ دوباره معنی دارد.
 */
const MAX_ATTEMPTS = 5;

export type SyncResult = { sent: number; failed: number; left: number };

/**
 * صف را می‌فرستد.
 *
 * ⚠️ ترتیب حفظ می‌شود و روی اولین خطای شبکه **می‌ایستد**.
 *
 *    اگر ادامه می‌داد، نوشتنِ دهم پیش از نهم می‌رسید — و برای شمارشی
 *    که دو بار اصلاح شده، عددِ قدیمی‌تر آخر می‌نشست.
 */
export async function flush(
  send: (item: QueuedWrite) => Promise<void>,
): Promise<SyncResult> {
  const items = await pending();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await send(item);
      await remove(item.id);
      sent += 1;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // پاسخِ قطعیِ سرور: دوباره تلاش کردن بی‌فایده است.
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        await remove(item.id);
        failed += 1;
        continue;
      }
      if (item.attempts + 1 >= MAX_ATTEMPTS) {
        await remove(item.id);
        failed += 1;
        continue;
      }
      await bumpAttempts(item);
      break; // ترتیب مهم است — بقیه بماند برای دفعهٔ بعد
    }
  }

  return { sent, failed, left: (await pending()).length };
}

/**
 * صفِ کاربرِ فعلی را پاک می‌کند — هنگام خروج.
 *
 * ⚠️ صفِ بقیهٔ کاربران دست نمی‌خورد: ممکن است انباردارِ دیگری روی همین
 *    دستگاه کارِ نیمه‌تمام داشته باشد و خروجِ این یکی نباید آن را
 *    بسوزاند.
 */
export async function clearMine(): Promise<void> {
  const mine = await pending();
  await Promise.all(mine.map((r) => remove(r.id)));
}
