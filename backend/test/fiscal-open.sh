#!/usr/bin/env bash
#
# سند افتتاحیه — انتقال ماندهٔ حساب‌های دائم به سال نو.
#
# ⚠️ سنجهٔ اصلی این است: **ترازِ آزمایشیِ سال نو باید با ترازنامه بخواند.**
#
#    بدونِ افتتاحیه، `trialBalance` که بر اساس `entryDate` فیلتر می‌کند
#    نقد و موجودی را صفر نشان می‌دهد در حالی که ترازنامهٔ `asOf` درست
#    است.  هیچ خطایی داده نمی‌شود؛ فقط دو گزارش با هم نمی‌خوانند.

set -u
cd "$(dirname "$0")/.."

API=http://localhost:3000
CF="-f ../docker-compose.yml -f ../docker-compose.store.yml"
PASS=0; FAIL=0

chk() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}
sec() { printf -- '--- %s ---\n' "$*"; }
Q() { docker compose $CF exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>&1 | tr -d '\r'; }
P() { python -c "$1" 2>/dev/null; }

PW="${MOLIDO_ADMIN_PASSWORD:-}"
[ -n "$PW" ] || PW="$(grep '^ADMIN_PASSWORD=' ../.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | P 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
[ -n "$TOKEN" ] || { echo "  ✗ ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

CO=seed-company

cleanup() {
  Q "DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
       (SELECT id FROM \"JournalEntry\" WHERE \"fiscalYearId\" IN
          (SELECT id FROM \"FiscalYear\" WHERE code LIKE 'FO-%'));
     DELETE FROM \"JournalEntry\" WHERE \"fiscalYearId\" IN
       (SELECT id FROM \"FiscalYear\" WHERE code LIKE 'FO-%');
     DELETE FROM \"FiscalYear\" WHERE code LIKE 'FO-%';" >/dev/null
}
trap cleanup EXIT
cleanup

# ---------------------------------------------------------------- سال‌ها
#
# ⚠️ سال‌ها در گذشتهٔ دور گذاشته می‌شوند تا با سال مالیِ واقعیِ seed
#    هم‌پوشانی نکنند — قیدِ EXCLUDE روی بازه‌ها آن را رد می‌کند.
sec "۰) دو سال مالی"
Y1=$(curl -s "${A[@]}" -X POST "$API/ledger/fiscal-years" \
  -d '{"code":"FO-1","startsOn":"2001-01-01","endsOn":"2001-12-31"}' \
  | P 'import sys,json;print(json.load(sys.stdin).get("id",""))')
Y2=$(curl -s "${A[@]}" -X POST "$API/ledger/fiscal-years" \
  -d '{"code":"FO-2","startsOn":"2002-01-01","endsOn":"2002-12-31"}' \
  | P 'import sys,json;print(json.load(sys.stdin).get("id",""))')
chk "سال اول ساخته شد" "$([ -n "$Y1" ] && echo yes || echo no)" "yes"
chk "سال دوم ساخته شد" "$([ -n "$Y2" ] && echo yes || echo no)" "yes"

# ---------------------------------------------------------------- سند سال ۱
#
# نقد ۵٬۰۰۰٬۰۰۰ بدهکار / سرمایه ۵٬۰۰۰٬۰۰۰ بستانکار — هر دو حسابِ **دائم**.
sec "۱) گردش سال اول"
# WARN حسابِ **قابلِ ثبت** لازم است، نه هر حسابی.
#      نسخهٔ اول اولین ASSET را برداشت که «۱۰۰۰ — دارایی‌ها»ی کل بود.
#      چون فیکسچر مستقیم در پایگاه درج می‌کند، نگهبانِ postIn دور زده شد
#      و خطا تازه هنگام صدورِ افتتاحیه بیرون آمد:
#      «به حساب کل نمی‌توان سند زد: 1000، 3000».
AC=$(Q "SELECT code FROM \"Account\" WHERE \"companyId\"='$CO' AND type='ASSET'
          AND \"isPostable\" ORDER BY code LIMIT 1")
EQ=$(Q "SELECT code FROM \"Account\" WHERE \"companyId\"='$CO' AND type='EQUITY'
          AND \"isPostable\" ORDER BY code LIMIT 1")
chk "حساب دارایی پیدا شد" "$([ -n "$AC" ] && echo yes || echo no)" "yes"
chk "حساب سرمایه پیدا شد" "$([ -n "$EQ" ] && echo yes || echo no)" "yes"

EID=$(Q "SELECT id FROM \"JournalEntry\" WHERE \"companyId\"='$CO' LIMIT 0")
Q "INSERT INTO \"JournalEntry\" (id,\"companyId\",\"entryNo\",\"entryDate\",\"fiscalYearId\",
                                 description,status,\"sourceType\",\"sourceId\")
   VALUES ('fo-e1','$CO','FO-E1','2001-06-01','$Y1','آورده نقدی','POSTED','Manual','fo-e1');
   INSERT INTO \"JournalLine\" (id,\"entryId\",\"accountId\",debit,credit)
   SELECT 'fo-l1','fo-e1', id, 5000000, 0 FROM \"Account\" WHERE \"companyId\"='$CO' AND code='$AC';
   INSERT INTO \"JournalLine\" (id,\"entryId\",\"accountId\",debit,credit)
   SELECT 'fo-l2','fo-e1', id, 0, 5000000 FROM \"Account\" WHERE \"companyId\"='$CO' AND code='$EQ';" >/dev/null
chk "سند سال اول ثبت شد" "$(Q "SELECT count(*) FROM \"JournalLine\" WHERE \"entryId\"='fo-e1'")" "2"

# ---------------------------------------------------------------- بدونِ افتتاحیه
#
# ⚠️ این سنجه **باید** نشان دهد که مشکل واقعی است.  اگر ترازِ سال دوم
#    بدونِ افتتاحیه هم مانده داشته باشد، این قابلیت لازم نبوده.
sec "۲) پیش از افتتاحیه، سال دوم خالی است"
# WARN شکلِ پاسخ `{accounts, totals, balanced}` است.
#      نسخهٔ اول دنبالِ کلیدِ `rows` گشت، پیدا نکرد، روی خودِ dict حلقه
#      زد و استثنا داد — که `P()` می‌بلعدش.  نتیجه: هر دو سنجه صفر
#      گرفتند و به‌نظر می‌رسید افتتاحیه بی‌اثر است، در حالی که سند از
#      همان اول درست صادر شده بود.
TB() { curl -s "${A[@]}" "$API/ledger/trial-balance?from=$1&to=$2" \
  | P "import sys,json;t=json.load(sys.stdin)['totals'];print(float(t['debit'])+float(t['credit']))"; }
BEFORE=$(TB 2002-01-01 2002-12-31)
chk "ترازِ سال دوم صفر است" "$(P "print(float('${BEFORE:-0}') == 0)")" "True"

# ---------------------------------------------------------------- محافظ‌ها
sec "۳) محافظ‌ها"
chk "تا سال قبل بسته نشده، رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X PATCH "$API/ledger/fiscal-years/$Y2/open")" "400"

curl -s "${A[@]}" -X PATCH "$API/ledger/fiscal-years/$Y1/close" >/dev/null
chk "سال اول بسته شد" "$(Q "SELECT status FROM \"FiscalYear\" WHERE id='$Y1'")" "CLOSED"

chk "افتتاحیه روی سالِ بسته رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X PATCH "$API/ledger/fiscal-years/$Y1/open")" "400"

# ---------------------------------------------------------------- افتتاحیه
sec "۴) صدور افتتاحیه"
R=$(curl -s "${A[@]}" -X PATCH "$API/ledger/fiscal-years/$Y2/open")
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }
chk "سند صادر شد"       "$(J "bool(d.get('entryNo'))")" "True"
chk "از سال قبل آمده"   "$(J "d.get('carriedFrom')")"   "FO-1"
chk "دو حساب منتقل شد"  "$(J "d.get('accounts')")"      "2"

chk "تاریخ سند، اولِ سال نو است" \
  "$(Q "SELECT to_char(\"entryDate\",'YYYY-MM-DD') FROM \"JournalEntry\"
          WHERE \"sourceType\"='FiscalYearOpen' AND \"sourceId\"='$Y2'")" "2002-01-01"

# ⚠️ سندِ افتتاحیه باید **خودش** تراز باشد.
#
#    نسخهٔ اول فقط «بدهکار منهای بستانکار = ۰» را می‌سنجید — که با
#    **صفر سطر** هم صفر می‌شود.  وقتی صدور شکست خورد، این سنجه سبز ماند
#    و هیچ نگفت.  همان الگویی که این هفته شش بار دیدیم: ترازِ صفر وقتی
#    هیچ سطری نوشته نشده، خبرِ خوبی نیست.
chk "سند افتتاحیه سطر دارد" \
  "$(Q "SELECT count(*) FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE e.\"sourceType\"='FiscalYearOpen' AND e.\"sourceId\"='$Y2'")" "2"
chk "سند افتتاحیه تراز است" \
  "$(Q "SELECT COALESCE(sum(l.debit)-sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE e.\"sourceType\"='FiscalYearOpen' AND e.\"sourceId\"='$Y2'")" "0"

# ---------------------------------------------------------------- اثرش
sec "۵) حالا ترازِ سال دوم مانده دارد"
AFTER=$(TB 2002-01-01 2002-12-31)
chk "ترازِ سال دوم دیگر صفر نیست" "$(P "print(float('${AFTER:-0}') > 0)")" "True"
chk "مانده دقیقاً همان ۱۰ میلیون است (۵ بدهکار + ۵ بستانکار)" \
  "$(P "print(int(float('${AFTER:-0}')))")" "10000000"

# ---------------------------------------------------------------- تکرار
sec "۶) تکرارناپذیری"
# ⚠️ قیدِ یکتای JournalEntry_source_key این را تضمین می‌کند، نه یک if.
chk "افتتاحیهٔ دوباره رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X PATCH "$API/ledger/fiscal-years/$Y2/open" | grep -qE '^(400|409|500)$' && echo rejected || echo accepted)" "rejected"
chk "فقط یک سند افتتاحیه هست" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='FiscalYearOpen' AND \"sourceId\"='$Y2'")" "1"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
