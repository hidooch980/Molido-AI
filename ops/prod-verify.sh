#!/usr/bin/env bash
#
# راستی‌آزمایی سرور تولید پس از استقرار — **فقط خواندن**.
#
# ⚠️ عمداً هیچ ردیفی نمی‌سازد و حذف نمی‌کند.  مجموعه‌های آزمون معمولی
#    (`untested.sh` و مانندش) روی دیتابیس ردیف می‌سازند و پاک می‌کنند؛
#    اجرایشان روی دادهٔ زندهٔ مشتری کار درستی نیست.  اینجا فقط وضعیت
#    سنجیده می‌شود.

cd /opt/molido || exit 1
C='docker compose -f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml'
BASE=https://194.5.176.140

pass=0; fail=0
chk() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}
q() { $C exec -T postgres psql -U postgres -d molido_ai -t -A -c "$1" 2>/dev/null | tr -d '\r'; }
code() { curl -sk --max-time 40 -o /dev/null -w '%{http_code}' "$BASE$1"; }

echo '--- ۱) مهاجرت‌ها ثبت شده‌اند ---'
chk "۰۳۵ اجرا شد" "$(q "SELECT count(*) FROM schema_migrations WHERE name LIKE '035%'")" "1"
chk "۰۳۶ اجرا شد" "$(q "SELECT count(*) FROM schema_migrations WHERE name LIKE '036%'")" "1"

echo '--- ۲) قیدها درست‌اند ---'
# ⚠️ چهار استثنا، و هر کدام دلیلِ خودش را دارد:
#
#    `User.email` و `User.phone` — ورود با ایمیل بدونِ شرطِ شرکت
#    انجام می‌شود؛ اگر یکتایی درون‌شرکتی بود، دو شرکت می‌توانستند
#    کاربری با یک ایمیل داشته باشند و ورود مبهم می‌شد.
#
#    `ApiKey.keyHash` — کلید پیش از دانستنِ شرکت راستی‌آزمایی می‌شود.
#
#    `SitePurchase.trackingCode` — خریدارِ سایت توکن ندارد و با همین
#    کد وضعیتش را می‌بیند.  اگر یکتایی درون‌شرکتی بود، دو شرکت
#    می‌توانستند کدِ یکسان بدهند و پیگیری سطرِ اشتباه را برمی‌گرداند.
#
#    این سنجه **درست کار کرد**: `SitePurchase` را همان روزِ اول گرفت.
chk "قید سراسری ناخواسته نمانده" \
  "$(q "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        WHERE c.contype='u'
          AND pg_get_constraintdef(c.oid) NOT LIKE '%companyId%'
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_name=t.relname AND col.column_name='companyId')
          AND NOT (t.relname='User' AND pg_get_constraintdef(c.oid) IN ('UNIQUE (email)','UNIQUE (phone)'))
          AND NOT (t.relname='ApiKey' AND pg_get_constraintdef(c.oid)='UNIQUE (\"keyHash\")')
          AND NOT (t.relname='SitePurchase' AND pg_get_constraintdef(c.oid)='UNIQUE (\"trackingCode\")')")" "0"
# و هویت سراسری مانده — ورود با ایمیل بدون شرط شرکت انجام می‌شود.
chk "ورود با ایمیل سراسری" \
  "$(q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='User_email_key'")" "UNIQUE (email)"
chk "کلید API سراسری" \
  "$(q "SELECT count(*) FROM pg_constraint WHERE conname='ApiKey_keyHash_key'")" "1"
chk "قرارداد محدود به شرکت" \
  "$(q "SELECT count(*) FROM pg_constraint WHERE conname='Contract_companyId_contractNo_key'")" "1"

echo '--- ۳) داده دست‌نخورده مانده ---'
# ⚠️ این عدد با هر مهاجرتی که جدول می‌سازد باید دستی بالا برود.
#
#    ۱۷۹ -> ۱۸۰ با مهاجرت ۰۳۹ (`RolePermission`).
#    ۱۸۰ -> ۱۸۷ با هفت مهاجرت که هر کدام یک جدول ساختند:
#
#        ۰۴۱  PhoneVerification
#        ۰۴۳  LoginAttempt
#        ۰۴۴  MfaRecoveryCode
#        ۰۴۵  IdempotencyKey
#        ۰۵۰  ProductReview
#        ۰۵۱  BudgetCommitment
#        ۰۵۴  GovSsoState
#
#    وسوسه‌اش هست که این سنجه برداشته شود چون «هر بار باید دست بخورد».
#    ولی کارش دقیقاً همین است: جدولی که بی‌خبر پیدا یا گم شود، باید
#    کسی را متوقف کند.  عددِ ثابت یعنی تغییرِ ساختار عمدی باشد، نه
#    اتفاقی.
#
#    و همین حالا کارش را کرد: پس از استقرار ۱۸۷ دید و متوقف شد.  پیش
#    از بالا بردنِ عدد، هر هفت جدول به مهاجرتِ سازنده‌اش برگردانده شد —
#    وگرنه بالا بردنِ کورِ عدد یعنی سنجه را خاموش کردن، نه رفع کردن.
#
#    ۱۸۷ -> ۱۳۴ با مهاجرت ۰۵۶: حذفِ کاملِ سه گروهِ قابلیت به درخواستِ
#    صاحبِ محصول.  ۵۳ جدول رفت — فهرستشان با بستارِ وابستگی ساخته شد
#    نه با شمردنِ دستی، و پیش از حذف تأیید شد که همه صفر سطر دارند.
#
#    ۱۳۴ -> ۱۳۶ با مهاجرت ۰۵۷: `SiteModule` و `SitePurchase` برای
#    فروشِ ماژول از سایتِ معرفی.
#
#    ۱۳۶ -> ۱۳۸ با مهاجرت‌های ۰۶۰ و ۰۶۱: `ShahkarVerification`
#    (حافظهٔ استعلامِ تطبیقِ موبایل و کد ملی) و `SelfOrderSetting`
#    (تنظیماتِ منوی دیجیتالِ هر رستوران).
#
#    ۱۳۸ -> ۱۴۰ با مهاجرت‌های ۰۶۸ و ۰۶۹: `BarcodeCatalog` (فهرستِ
#    مشترکِ بارکد بین شرکت‌ها) و `CashBoxTransaction` (ردِ حسابرسیِ
#    واریز و برداشتِ صندوق).
#
#    ⚠️ فهرست پیش از بالا بردنِ عدد **سنجیده شد**، هر بار.
#
#       مهاجرت‌های ۰۵۸ تا ۰۶۵ گرفته شدند و فقط دو `CREATE TABLE`
#       داشتند؛ ۰۶۷ تا ۰۷۰ هم گرفته شدند و همین دو.  ۰۶۷ فقط نمایه
#       می‌سازد و ۰۷۰ فقط یک ستون به جدولِ موجود اضافه می‌کند.
#
#       بالا بردنِ کورِ عدد یعنی خاموش کردنِ سنجه، نه رفعِ آن.  هر بار
#       باید دید کدام مهاجرت جدول ساخته و چرا.
# ۱۴۰ ← ۱۴۲ ← ۱۴۶ ← ۱۵۲.  هر بار شمرده شده، نه حدس زده:
#   ۰۷۱/۰۷۲ → "Subscription" و "PlanDefault"
#   ۰۷۵      → "PettyCash" و "PettyCashTransaction"
#   ۰۷۶      → "BankReconciliation" و "BankStatementLine"
#   ۰۷۹      → "Reminder"
#   ۰۸۰      → "JournalTemplate"
#   ۰۸۱      → "Consignment" و "ConsignmentItem"
#   ۰۸۲      → "ChequePrintTemplate"
#   ۰۸۳      → "ReportDefinition"
# ۰۷۳، ۰۷۴، ۰۷۷ و ۰۷۸ هیچ CREATE TABLE ندارند (ستون، نمایه، حساب).
chk "جدول‌ها" "$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")" "152"
printf '  —    کالا: %s   مشتری: %s   فاکتور: %s   کاربر: %s\n' \
  "$(q 'SELECT count(*) FROM "Product"')" \
  "$(q 'SELECT count(*) FROM "Customer"')" \
  "$(q 'SELECT count(*) FROM "Invoice"')" \
  "$(q 'SELECT count(*) FROM "User"')"

echo '--- ۴) صفحه‌ها بالا هستند ---'
for p in / /dashboard /pos /products /staff /contracts /pos-terminals \
         /records/budget /records/loans /records/customer-tickets /records/news; do
  chk "صفحهٔ $p" "$(code "$p")" "200"
done

echo '--- ۵) API سالم است ---'
chk "auth بدون توکن ۴۰۱" "$(code /api/products)" "401"

echo '--- ۶) سلامتِ دفتر کل ---'
#
# ⚠️ «تراز صفر است» با «دفتر درست است» یکی نیست.
#
#    امروز دو ایرادِ واقعی پیدا شد که هر دو تراز را **صفر** نگه
#    می‌داشتند: خریدِ دارایی سند نمی‌زد (حسابِ داراییِ بستانکار)، و
#    ۲۶۴۰ قلمِ فروش بهای تمام‌شده نداشتند (سودِ گذشته با بهای امروز).
#
#    هیچ‌کدام خطا نمی‌دادند.  تنها راهِ دیدنشان، سنجشِ **علامتِ ماندهٔ**
#    حساب‌ها بود.  استقرار باید همین را روی تولید هم ببیند، وگرنه
#    خرابیِ داده ماه‌ها بی‌صدا می‌ماند.

chk "تراز آزمایشی صفر"   "$(q "SELECT CASE WHEN round(COALESCE(sum(l.debit),0) - COALESCE(sum(l.credit),0)) = 0
                    THEN 'ok' ELSE 'off' END
        FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
        WHERE e.status <> 'REVERSED'")" "ok"

# ⚠️ حساب‌های کاهنده عمداً وارونه‌اند — دلیلشان در `ledger-health.sh`.
#
# ⚠️ اینجا برخلافِ `ledger-health.sh` هیچ استثنای «دادهٔ آزمون» نیست.
#
#    آنجا `1102` بانک استثنا شد چون آزمون‌ها پرداختِ حقوق می‌زنند
#    بی‌آنکه واریزی ثبت کنند.  روی **تولید** چنین چیزی عذر نیست:
#    اگر ماندهٔ بانک وارونه باشد، یعنی واقعاً پولی خرج شده که ثبت
#    نشده — و آن باید استقرار را متوقف کند.
chk "حسابِ وارونه نیست"   "$(q "SELECT COALESCE(string_agg(code, ','), 'none') FROM (
          SELECT a.code FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
          JOIN \"Account\" a ON a.id = l.\"accountId\"
          WHERE e.status <> 'REVERSED'
            AND e.\"sourceType\" NOT IN ('REVERSAL','FiscalYearClose')
            AND a.code NOT IN ('4102','1202','4105')
          GROUP BY a.code, a.type
          HAVING (a.type IN ('ASSET','EXPENSE') AND sum(l.credit) > sum(l.debit))
              OR (a.type IN ('LIABILITY','EQUITY','REVENUE') AND sum(l.debit) > sum(l.credit))
        ) x")" "none"

chk "سندِ نامتراز نیست"   "$(q "SELECT count(*) FROM (
          SELECT l.\"entryId\" FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
          WHERE e.status <> 'REVERSED'
          GROUP BY l.\"entryId\"
          HAVING round(sum(l.debit) - sum(l.credit)) <> 0
        ) x")" "0"

chk "موجودیِ منفی نیست"   "$(q "SELECT count(*) FROM \"Inventory\" WHERE quantity < 0")" "0"

echo '--- ۷) نشانی‌های عمومی ---'
#
# ⚠️ خالی بودنشان **هیچ خطایی نمی‌دهد** — به `localhost` عقب می‌نشینند.
#
#    `self-order.service.ts` بدونِ `API_PUBLIC_URL` نشانی‌ها را روی
#    `http://localhost:3000` می‌سازد.  یعنی QRِ روی میزِ رستوران، در
#    گوشیِ مشتری به لپ‌تاپِ **خودش** اشاره می‌کند.  صفحه باز نمی‌شود و
#    هیچ‌جا خطایی ثبت نمی‌شود.
#
#    سنجیده شد: روی همین سرور خالی بود.
for v in SITE_URL API_PUBLIC_URL; do
  val=$(grep -E "^$v=" .env 2>/dev/null | cut -d= -f2- | tr -d '"')
  chk "$v تنظیم است" "$([ -n "$val" ] && echo yes || echo no)" "yes"

  # ⚠️ و `localhost` در نشانیِ **عمومی** یعنی همان اشکال، فقط صریح‌تر.
  case "$val" in
    *localhost*|*127.0.0.1*)
      chk "$v به localhost اشاره نمی‌کند" "localhost" "نشانیِ عمومی" ;;
  esac
done

echo
printf '   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
