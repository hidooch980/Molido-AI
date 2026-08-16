#!/usr/bin/env bash
#
# ده حوزهٔ سادهٔ CRUD که تا امروز هیچ صفحه‌ای صدایشان نمی‌زد.
#
# همگی `BaseCrudService` خالص‌اند و صفحهٔ مشترکِ `/records/[domain]`
# نمایششان می‌دهد.  همین یکنواختی، خودش سنجیدنی است: اگر یکی از آن‌ها
# شکل متفاوتی برگرداند، صفحهٔ مشترک بی‌صدا خراب می‌شود.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST $A/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"admin@molido.ai","password":"'"$PW"'"}')
  case "$code" in
    000) echo "  ✗ ورود ناموفق — سرویس روی $A پاسخ نمی‌دهد" ;;
    401) echo "  ✗ ورود ناموفق — رمز نادرست است (MOLIDO_ADMIN_PASSWORD را بده)" ;;
    429) echo "  ✗ ورود ناموفق — سقف ورود خورده؛ چند دقیقه صبر کن" ;;
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از $A/auth/login" ;;
  esac
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    print('<<پاسخ-JSON-نبود:%r>>' % raw[:60]); sys.exit(0)
print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }

# ─────────────────────────────────────────────────────────────
# هر ردیف: مسیر | بدنهٔ ساخت | میدانی که باید در پاسخ باشد | مقدار
#
# بدنه‌ها از خودِ طرح جدول گرفته شده‌اند، نه حدس — همان چیزی که صفحهٔ
# `/records/[domain]` می‌فرستد.
# ─────────────────────────────────────────────────────────────
run_domain() {
  local name="$1" body="$2" field="$3" want="$4"

  local id
  id=$(curl -s -X POST "$A/$name" -H "$AU" -H "$JS" -d "$body" | P "d.get('id','')")
  chk "$name ساخته شد" "$([ -n "$id" ] && echo yes || echo no)" "yes"
  [ -z "$id" ] && return

  # فهرست باید آرایه باشد — صفحهٔ مشترک روی همین حساب می‌کند.
  chk "$name فهرست آرایه است" \
    "$(curl -s "$A/$name" -H "$AU" | P "isinstance(d, list)")" "True"
  chk "$name در فهرست دیده می‌شود" \
    "$(curl -s "$A/$name" -H "$AU" | P "sum(1 for x in d if x.get('id')=='$id')")" "1"
  chk "$name تک‌رکورد خوانده می‌شود" \
    "$(curl -s "$A/$name/$id" -H "$AU" | P "d.get('$field')")" "$want"

  # نگهبان عمومی `BaseCrudService`: میدان ناشناس باید رد شود، نه اینکه
  # بی‌صدا دور ریخته شود.
  chk "$name میدان ناشناس رد می‌شود" \
    "$(curl -s -X POST "$A/$name" -H "$AU" -H "$JS" -d '{"hackerField":"x"}' | P "d.get('statusCode')")" "400"

  chk "$name حذف می‌شود" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/$name/$id" -H "$AU")" "200"
  chk "$name حذف دوباره ۴۰۴" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/$name/$id" -H "$AU")" "404"
  chk "$name بدون توکن بسته است" \
    "$(curl -s "$A/$name" | P "d.get('statusCode')")" "401"
}

echo '--- تیکت مشتریان ---'
run_domain customer-tickets \
  '{"ticketNo":"RT-TK-1","subject":"RT-Subject","priority":"HIGH","status":"OPEN"}' \
  subject 'RT-Subject'

echo '--- بودجه ---'
run_domain budget \
  '{"title":"RT-Budget","year":1405,"totalAmount":1000000}' \
  title 'RT-Budget'

echo '--- وام ---'
run_domain loans \
  '{"loanNo":"RT-L-1","borrowerName":"RT-Borrower","amount":500000000,"months":36,"startDate":"2026-01-01"}' \
  borrowerName 'RT-Borrower'

echo '--- سرمایه‌گذاری ---'
run_domain investments \
  '{"title":"RT-Invest","principal":100000000,"startDate":"2026-01-01","status":"ACTIVE"}' \
  title 'RT-Invest'

echo '--- دوره آموزشی ---'
run_domain training \
  '{"title":"RT-Course","instructor":"RT-Teacher","hours":20}' \
  title 'RT-Course'

echo '--- مناقصه ---'
run_domain tenders \
  '{"tenderNo":"RT-T-1","title":"RT-Tender","baseAmount":900000000}' \
  title 'RT-Tender'

echo '--- نظرسنجی ---'
run_domain surveys \
  '{"title":"RT-Survey","isActive":true}' \
  title 'RT-Survey'

echo '--- اطلاعیه ---'
run_domain news \
  '{"title":"RT-News","body":"RT-Body","status":"DRAFT"}' \
  title 'RT-News'

echo '--- کمپین ایمیلی ---'
run_domain email-campaigns \
  '{"title":"RT-Campaign","subject":"RT-Mail","body":"RT-Body","status":"DRAFT"}' \
  title 'RT-Campaign'

echo '--- ارزیابی عملکرد ---'
# ⚠️ به کارمند واقعی نیاز دارد؛ اگر نبود این بخش رد می‌شود نه اینکه
#    با شکستی که ربطی به کد ندارد بیفتد.
EMP=$($C exec -T postgres psql -U postgres -d molido_ai -t \
  -c "SELECT id FROM \"Employee\" LIMIT 1;" 2>/dev/null | tr -d ' \r\n')
if [ -n "$EMP" ]; then
  run_domain performance \
    "{\"employeeId\":\"$EMP\",\"period\":\"RT-1405-05\",\"score\":88}" \
    period 'RT-1405-05'
else
  echo "  — کارمندی ثبت نشده؛ رد شد"
fi

echo '--- نگهبان عمومی روی این حوزه‌ها ---'
# همان کفِ ایمنی که زیر ۱۱۰ مسیر بی‌DTO است.
BIG=$(python3 -c 'print("x"*20000)')
chk "متن بیش از حد رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/news -H "$AU" -H "$JS" \
     -d "{\"title\":\"$BIG\",\"body\":\"x\"}")" "400"
# «   » در پایگاه داده از NULL بدتر است: شبیه داده به نظر می‌رسد.
NID=$(curl -s -X POST $A/news -H "$AU" -H "$JS"   -d '{"title":"RT-Blank","body":"RT-Body","category":"   "}' | P "d.get('id','')")
chk "فقط فاصله به null بدل می‌شود" \
  "$(curl -s "$A/news/$NID" -H "$AU" | P "d.get('category') is None")" "True"
curl -s -X DELETE "$A/news/$NID" -H "$AU" >/dev/null

# پاک‌سازی هر چیزی که از اجرای نیمه‌تمام مانده
for tbl in CustomerTicket Budget Loan Investment TrainingCourse Tender Survey NewsPost EmailCampaign; do
  psql "DELETE FROM \"$tbl\" WHERE COALESCE(title, '') LIKE 'RT-%'"
done
psql "DELETE FROM \"CustomerTicket\" WHERE \"ticketNo\" LIKE 'RT-%'"
psql "DELETE FROM \"Loan\" WHERE \"loanNo\" LIKE 'RT-%'"
psql "DELETE FROM \"Tender\" WHERE \"tenderNo\" LIKE 'RT-%'"
psql "DELETE FROM \"PerformanceReview\" WHERE period LIKE 'RT-%'"

echo
printf '   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
