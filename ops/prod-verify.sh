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
# فقط سه استثنای هویتی باید سراسری مانده باشند.
chk "قید سراسری ناخواسته نمانده" \
  "$(q "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        WHERE c.contype='u'
          AND pg_get_constraintdef(c.oid) NOT LIKE '%companyId%'
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_name=t.relname AND col.column_name='companyId')
          AND NOT (t.relname='User' AND pg_get_constraintdef(c.oid) IN ('UNIQUE (email)','UNIQUE (phone)'))
          AND NOT (t.relname='ApiKey' AND pg_get_constraintdef(c.oid)='UNIQUE (\"keyHash\")')")" "0"
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
#
#    وسوسه‌اش هست که این سنجه برداشته شود چون «هر بار باید دست بخورد».
#    ولی کارش دقیقاً همین است: جدولی که بی‌خبر پیدا یا گم شود، باید
#    کسی را متوقف کند.  عددِ ثابت یعنی تغییرِ ساختار عمدی باشد، نه
#    اتفاقی.
chk "جدول‌ها" "$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")" "180"
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

echo
printf '   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
