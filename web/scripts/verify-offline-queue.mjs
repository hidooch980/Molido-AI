/**
 * منطقِ صفِ آفلاین — بدون مرورگر.
 *
 * ⚠️ چرا بدون مرورگر؟
 *
 *    منطقِ سخت اینجاست: جداسازیِ کاربران، ترتیب، و اینکه چه خطایی
 *    دوباره تلاش می‌شود و چه خطایی نه.  اینها با یک IndexedDB ساختگی
 *    سنجیدنی‌اند و در چند صدم ثانیه اجرا می‌شوند.
 *
 *    آنچه اینجا سنجیده **نمی‌شود** رفتارِ خودِ مرورگر است — که
 *    IndexedDB واقعاً بنویسد و رویداد `online` واقعاً بیاید.  آن را
 *    باید دستی دید، و این آزمون جایش را نمی‌گیرد.
 *
 * اجرا:  node --experimental-strip-types web/scripts/verify-offline-queue.mjs
 */


// ---------------------------------------------------------------- ساختگی‌ها

/** IndexedDB ساختگی — فقط آنچه صف استفاده می‌کند. */
function fakeIndexedDb() {
  const rows = new Map();
  return {
    rows,
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => undefined,
          close: () => undefined,
          transaction() {
            const t = {};
            queueMicrotask(() => t.oncomplete?.());
            return {
              objectStore: () => ({
                add(rec) {
                  const r = {};
                  queueMicrotask(() => {
                    if (rows.has(rec.id)) r.onerror?.();
                    else {
                      rows.set(rec.id, rec);
                      r.onsuccess?.();
                    }
                  });
                  return r;
                },
                put(rec) {
                  const r = {};
                  queueMicrotask(() => {
                    rows.set(rec.id, rec);
                    r.onsuccess?.();
                  });
                  return r;
                },
                delete(id) {
                  const r = {};
                  queueMicrotask(() => {
                    rows.delete(id);
                    r.onsuccess?.();
                  });
                  return r;
                },
                getAll() {
                  const r = {};
                  queueMicrotask(() => {
                    r.result = [...rows.values()];
                    r.onsuccess?.();
                  });
                  return r;
                },
              }),
              ...t,
            };
          },
        };
        req.onsuccess?.();
      });
      return req;
    },
  };
}

/** توکنِ ساختگی با `sub` دلخواه. */
function tokenFor(sub) {
  const body = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `x.${body}.y`;
}

function install(userId) {
  const store = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => {
        store[k] = v;
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
  };
  globalThis.indexedDB = fakeIndexedDb();
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  // `crypto` در Node 22 از قبل سراسری است و فقط getter دارد.
  window.localStorage.setItem('molido_token', tokenFor(userId));
}

// ---------------------------------------------------------------- سنجه

let pass = 0;
let fail = 0;
function chk(label, got, want) {
  const a = JSON.stringify(got);
  const e = JSON.stringify(want);
  if (a === e) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}\n       got=${a}\n       want=${e}`);
  }
}

install('user-a');
const q = await import('../lib/offline-queue.ts');

console.log('--- ۱) نوشتن در صف می‌نشیند ---');
await q.enqueue({ path: '/a', method: 'PATCH', body: { n: 1 }, label: 'یک' });
await q.enqueue({ path: '/b', method: 'PATCH', body: { n: 2 }, label: 'دو' });
chk('دو رکورد', (await q.pending()).length, 2);

console.log('--- ۲) ترتیب حفظ می‌شود ---');
// شمارشی که دو بار اصلاح شده، باید عددِ آخر آخر بنشیند.
chk('قدیمی‌ترین اول', (await q.pending()).map((r) => r.path), ['/a', '/b']);

console.log('--- ۳) ارسال موفق، صف را خالی می‌کند ---');
const sentPaths = [];
let r = await q.flush(async (item) => {
  sentPaths.push(item.path);
});
chk('هر دو رفت', r.sent, 2);
chk('صف خالی', r.left, 0);
chk('به ترتیب', sentPaths, ['/a', '/b']);

console.log('--- ۴) خطای شبکه: می‌ماند و ترتیب نمی‌شکند ---');
await q.enqueue({ path: '/x', method: 'PATCH', body: {}, label: 'ایکس' });
await q.enqueue({ path: '/y', method: 'PATCH', body: {}, label: 'وای' });
r = await q.flush(async () => {
  throw new Error('network down');
});
chk('هیچ‌کدام نرفت', r.sent, 0);
chk('هر دو ماندند', r.left, 2);
// ⚠️ اگر روی خطا ادامه می‌داد، `/y` پیش از `/x` می‌رسید.
chk('ترتیب دست‌نخورده', (await q.pending()).map((x) => x.path), ['/x', '/y']);

console.log('--- ۵) ردِ سرور: حذف می‌شود، نه تکرار ---');
// پاسخِ ۴۰۰ با تکرار عوض نمی‌شود؛ نگه داشتنش فقط صف را قفل می‌کند.
r = await q.flush(async () => {
  const e = new Error('bad request');
  e.status = 400;
  throw e;
});
chk('هر دو حذف شدند', r.failed, 2);
chk('صف خالی شد', r.left, 0);

console.log('--- ۶) ۴۲۹ و ۴۰۸ دوباره تلاش می‌شوند ---');
// سقفِ نرخ و مهلت، موقتی‌اند — با تکرار جواب می‌دهند.
await q.enqueue({ path: '/z', method: 'PATCH', body: {}, label: 'زد' });
r = await q.flush(async () => {
  const e = new Error('too many');
  e.status = 429;
  throw e;
});
chk('۴۲۹ می‌ماند', r.left, 1);

console.log('--- ۷) صفِ کاربرِ دیگر دیده نمی‌شود ---');
// ⚠️ مهم‌ترین سنجه: روی صندوقی که چند نفر نوبتی کار می‌کنند، کارِ
//    نیمه‌کارهٔ یکی نباید با توکنِ دیگری برود.
const dbRows = globalThis.indexedDB.rows;
dbRows.set('user-b:zzz', {
  id: 'user-b:zzz',
  userId: 'user-b',
  path: '/other',
  method: 'PATCH',
  body: {},
  label: 'مالِ دیگری',
  createdAt: Date.now(),
  attempts: 0,
});
chk('فقط رکوردهای خودم', (await q.pending()).map((x) => x.userId), ['user-a']);

console.log('--- ۸) خروج فقط صفِ خودم را پاک می‌کند ---');
await q.clearMine();
chk('صفِ من خالی', (await q.pending()).length, 0);
chk('صفِ دیگری دست‌نخورده', dbRows.has('user-b:zzz'), true);

console.log();
console.log(`   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
