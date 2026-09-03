#!/usr/bin/env bash
#
# سندِ تکرارشونده (ثبت گروهی اسناد اتومات).
#
# ⚠️ دو سنجهٔ اصلی، و هر دو دربارهٔ خطایی‌اند که ماه‌ها بعد پیدا می‌شود:
#
#    ۱) **صدورِ دوباره برای یک دوره باید رد شود.**  دو بار زدنِ دکمه
#       یعنی دو سندِ اجاره در یک ماه — و ترازِ کل هم صفر می‌ماند، چون هر
#       دو سند خودشان تراز هستند.  فقط هزینه دو برابر است.
#
#    ۲) **سررسید با ماهِ شمسی جلو می‌رود، نه سی روز.**  با سی روز،
#       اجارهٔ اولِ فروردین به ۳۱ فروردین می‌رسد، بعد ۳۰ اردیبهشت، و تا
#       پایانِ سال یک ماه دو سند می‌خورد و یکی هیچ.

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
       (SELECT id FROM \"JournalEntry\" WHERE \"sourceType\"='RecurringEntry');
     DELETE FROM \"JournalEntry\" WHERE \"sourceType\"='RecurringEntry';
     DELETE FROM \"JournalTemplate\" WHERE \"companyId\"='$CO';" >/dev/null
}
trap cleanup EXIT
cleanup

POST() { curl -s "${A[@]}" -X POST "$API$1" -d "$2"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X POST "$API$1" -d "$2"; }
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }

# اجاره: بدهکار ۵۲۰۲، بستانکار صندوق ۱۱۰۱
LINES='[{"accountCode":"5202","debit":8000000,"description":"اجاره"},
        {"accountCode":"1101","credit":8000000,"description":"پرداخت اجاره"}]'

# ---------------------------------------------------------------- ساخت
sec "۱) ساخت الگو"
R=$(POST /journal-templates "{\"title\":\"اجاره ماهانه\",\"description\":\"اجاره مغازه\",
     \"frequency\":\"MONTHLY\",\"nextRunOn\":\"2026-04-20\",\"lines\":$LINES}")
TPL=$(J "d.get('id','')")
chk "الگو ساخته شد" "$([ -n "$TPL" ] && echo yes || echo no)" "yes"
chk "سررسید شمسی دارد" "$(J "d.get('nextRunOnJalali')")" "1405/01/31"

# ---------------------------------------------------------------- اعتبار
sec "۲) اعتبارسنجیِ الگو"
# ⚠️ الگویی که تراز نیست هر ماه شکست می‌خورد — و همیشه در بدترین لحظه.
UNBAL='[{"accountCode":"5202","debit":8000000},{"accountCode":"1101","credit":7000000}]'
chk "الگوی نامتراز رد می‌شود" \
  "$(CODE /journal-templates "{\"title\":\"x\",\"description\":\"y\",\"frequency\":\"MANUAL\",\"lines\":$UNBAL}")" "400"
chk "الگوی تک‌قلمی رد می‌شود" \
  "$(CODE /journal-templates '{"title":"x","description":"y","frequency":"MANUAL","lines":[{"accountCode":"5202","debit":1}]}')" "400"
chk "قلمِ دوطرفه رد می‌شود" \
  "$(CODE /journal-templates '{"title":"x","description":"y","frequency":"MANUAL","lines":[{"accountCode":"5202","debit":1,"credit":1},{"accountCode":"1101","credit":1}]}')" "400"
chk "قلمِ صفر رد می‌شود" \
  "$(CODE /journal-templates '{"title":"x","description":"y","frequency":"MANUAL","lines":[{"accountCode":"5202","debit":0},{"accountCode":"1101","credit":0}]}')" "400"
chk "بدونِ کدِ حساب رد می‌شود" \
  "$(CODE /journal-templates '{"title":"x","description":"y","frequency":"MANUAL","lines":[{"debit":1},{"accountCode":"1101","credit":1}]}')" "400"
chk "تناوبِ ناشناخته رد می‌شود" \
  "$(CODE /journal-templates "{\"title\":\"x\",\"description\":\"y\",\"frequency\":\"DAILY\",\"lines\":$LINES}")" "400"
chk "زمان‌بندی‌شده بدونِ سررسید رد می‌شود" \
  "$(CODE /journal-templates "{\"title\":\"x\",\"description\":\"y\",\"frequency\":\"MONTHLY\",\"lines\":$LINES}")" "400"

# ---------------------------------------------------------------- صدور
sec "۳) صدورِ سند"
R=$(POST "/journal-templates/$TPL/generate" '{}')
chk "سند صادر شد"   "$(J "bool(d.get('entryNo'))")" "True"
chk "دورهٔ شمسی"     "$(J "d.get('period')")"        "1405-01"

chk "سند در دفتر هست" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='RecurringEntry'")" "1"
# ⚠️ تاریخ سند باید `nextRunOn` باشد نه امروز؛ وگرنه هزینهٔ فروردین در
#    ماهِ جاری می‌نشیند و هر دو ماه غلط می‌شوند.
chk "تاریخِ سند، سررسید است نه امروز" \
  "$(Q "SELECT to_char(\"entryDate\",'YYYY-MM-DD') FROM \"JournalEntry\" WHERE \"sourceType\"='RecurringEntry'")" "2026-04-20"
chk "اجاره (۵۲۰۲) بدهکار شد" \
  "$(Q "SELECT COALESCE(sum(l.debit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='5202' AND e.\"sourceType\"='RecurringEntry'")" "8000000"
chk "سند تراز است" \
  "$(Q "SELECT COALESCE(sum(l.debit)-sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE e.\"sourceType\"='RecurringEntry'")" "0"

# ---------------------------------------------------------------- تکرار
sec "۴) صدورِ دوباره برای یک دوره"
# ⚠️ دو سندِ اجاره در یک ماه؛ ترازِ کل هم صفر می‌ماند چون هر دو خودشان
#    تراز هستند.  فقط هزینه دو برابر است — و هیچ‌جا قرمز نمی‌شود.
# WARN تاریخ باید در همان **ماهِ شمسی** باشد تا واقعاً تکراری شمرده شود.
#      نسخهٔ اول ۲۰۲۶-۰۴-۲۵ نوشت که در شمسی ۱۴۰۵/۰۲/۰۵ است — یعنی
#      دورهٔ بعد، نه تکراری.  نگهبان درست پذیرفتش و آزمون قرمز شد؛
#      اشتباه از انتظارِ من بود.  ۲۰۲۶-۰۴-۱۵ = ۱۴۰۵/۰۱/۲۶ است.
chk "دورهٔ تکراری رد می‌شود" \
  "$(CODE "/journal-templates/$TPL/generate" '{"entryDate":"2026-04-15"}')" "400"
chk "و سندِ دومی ساخته نشد" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='RecurringEntry'")" "1"

# ---------------------------------------------------------------- سررسید
sec "۵) سررسیدِ بعدی با ماهِ شمسی"
R=$(curl -s "${A[@]}" "$API/journal-templates")
# ⚠️ ۳۱ فروردین + یک ماهِ شمسی = ۳۱ اردیبهشت.  با «سی روز» ۳۰ اردیبهشت
#    می‌شد و تفاوت هر ماه روی هم جمع می‌شد.
chk "سررسید یک ماهِ شمسی جلو رفت" \
  "$(J "[t for t in d if t['id']=='$TPL'][0]['nextRunOnJalali']")" "1405/02/31"
chk "آخرین اجرا ثبت شد" \
  "$(J "[t for t in d if t['id']=='$TPL'][0]['lastRunOnJalali']")" "1405/01/31"

# دورهٔ بعدی باید بپذیرد.
chk "دورهٔ بعدی پذیرفته می‌شود" \
  "$(CODE "/journal-templates/$TPL/generate" '{}')" "201"
chk "حالا دو سند هست" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='RecurringEntry'")" "2"

# ---------------------------------------------------------------- غیرفعال
sec "۶) غیرفعال‌سازی"
chk "غیرفعال شد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X PATCH "$API/journal-templates/$TPL/deactivate")" "200"
chk "الگوی غیرفعال سند نمی‌زند" \
  "$(CODE "/journal-templates/$TPL/generate" '{}')" "400"
R=$(curl -s "${A[@]}" "$API/journal-templates")
chk "در فهرستِ پیش‌فرض نیست" "$(J "'$TPL' in [t['id'] for t in d]")" "False"
R=$(curl -s "${A[@]}" "$API/journal-templates?all=true")
chk "با all=true دیده می‌شود"  "$(J "'$TPL' in [t['id'] for t in d]")" "True"

chk "الگوی ناموجود ۴۰۴" "$(CODE "/journal-templates/no-such/generate" '{}')" "404"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
