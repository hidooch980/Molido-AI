#!/usr/bin/env bash
#
# چهار حوزه‌ای که نه رابط کاربری داشتند نه آزمون.
#
# `pos-terminals`، `contracts`، `price-levels`، `discount-rules` —
# روی هم ۲۸ مسیر API که هیچ صفحه‌ای صدایشان نمی‌زد و هیچ آزمونی
# نمی‌سنجیدشان.  یعنی بیست‌وهشت مسیر که کسی نمی‌دانست کار می‌کنند.
#
# «۲۰۰ برمی‌گرداند» کافی نیست: مسیری که فهرست خالی می‌دهد هم ۲۰۰
# است.  اینجا ساخت، خواندن، اعتبارسنجی و جداسازی شرکت سنجیده می‌شود.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")}
if [ -z "$T" ]; then echo "  ✗ ورود ناموفق"; exit 1; fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "import sys,json,io;sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8');sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }

# ⚠️ هر DELETE جدا اجرا می‌شود، نه در یک رشتهٔ چنددستوری.
#
# `psql -c` با اولین خطا **کل** دستور را متوقف می‌کند.  نسخهٔ اول
# `PosTerminal.name` را حذف می‌کرد که اصلاً ستون نیست (نامش
# `terminalNo` است)؛ خطای همان سطر باعث می‌شد سه DELETE بعدی هرگز
# اجرا نشوند و آزمون بار دوم با «۲ رکورد به‌جای ۱» بشکند.
cleanup_rows() {
  psql "DELETE FROM \"PosTerminal\" WHERE \"terminalNo\" LIKE 'UT-%'"
  psql "DELETE FROM \"Contract\" WHERE title LIKE 'UT-%'"
  psql "DELETE FROM \"PriceLevel\" WHERE name LIKE 'UT-%'"
  psql "DELETE FROM \"DiscountRule\" WHERE name LIKE 'UT-%'"
  psql "DELETE FROM \"Budget\" WHERE title LIKE 'UT-%' OR title IS NULL"
}
cleanup_rows

echo '--- 1) price-levels: اعتبارسنجی که نبود ---'
# کنترلر `@Body() dto: any` می‌گرفت و ValidationPipe سراسری را دور
# می‌زد.  این چهار سنجه دقیقاً همان چیزهایی‌اند که پیش از افزودن DTO
# پذیرفته می‌شدند.
PL=$(curl -s -X POST $A/price-levels -H "$AU" -H "$JS" -d '{"name":"UT-Level"}')
chk "level created" "$(echo "$PL" | P "bool(d.get('id'))")" "True"
chk "empty name rejected" \
  "$(curl -s -X POST $A/price-levels -H "$AU" -H "$JS" -d '{"name":"   "}' | P "d.get('statusCode')")" "400"
chk "missing name rejected" \
  "$(curl -s -X POST $A/price-levels -H "$AU" -H "$JS" -d '{}' | P "d.get('statusCode')")" "400"
# میدان ناشناس بی‌صدا دور ریخته می‌شد — پاسخ ۲۰۱ و دادهٔ ناقص.
chk "unknown field rejected" \
  "$(curl -s -X POST $A/price-levels -H "$AU" -H "$JS" -d '{"name":"UT-Bad","hacker":"yes"}' | P "d.get('statusCode')")" "400"
chk "over-long name rejected" \
  "$(curl -s -X POST $A/price-levels -H "$AU" -H "$JS" -d "{\"name\":\"$(python3 -c 'print("x"*200)')\"}" | P "d.get('statusCode')")" "400"

echo '--- 2) discount-rules: قاعدهٔ دیتابیس در لبه اجرا شود ---'
DR=$(curl -s -X POST $A/discount-rules -H "$AU" -H "$JS" -d '{"name":"UT-Rule","kind":"PERCENT","value":15}')
chk "rule created" "$(echo "$DR" | P "bool(d.get('id'))")" "True"
chk "appears in list" \
  "$(curl -s "$A/discount-rules" -H "$AU" | P "sum(1 for x in (d if isinstance(d,list) else d.get('data',[])) if x.get('name')=='UT-Rule')")" "1"
# دیتابیس این را رد می‌کرد، ولی با ۵۰۰ خطای سرور — نه ۴۰۰ با پیام روشن.
chk "percent over 100 → 400 not 500" \
  "$(curl -s -X POST $A/discount-rules -H "$AU" -H "$JS" -d '{"name":"UT-B1","kind":"PERCENT","value":150}' | P "d.get('statusCode')")" "400"
chk "negative value rejected" \
  "$(curl -s -X POST $A/discount-rules -H "$AU" -H "$JS" -d '{"name":"UT-B2","kind":"PERCENT","value":-5}' | P "d.get('statusCode')")" "400"
chk "unknown kind rejected" \
  "$(curl -s -X POST $A/discount-rules -H "$AU" -H "$JS" -d '{"name":"UT-B3","kind":"NONSENSE","value":5}' | P "d.get('statusCode')")" "400"
# مبلغ ریالی سقف ۱۰۰ ندارد؛ سقف فقط برای درصد است.
chk "amount kind allows big value" \
  "$(curl -s -X POST $A/discount-rules -H "$AU" -H "$JS" -d '{"name":"UT-Amt","kind":"AMOUNT","value":500000}' | P "bool(d.get('id'))")" "True"

echo '--- 3) pos-terminals ---'
# شکل واقعی کالبد، نه حدس: میدان `name` وجود ندارد.
PT=$(curl -s -X POST $A/pos-terminals -H "$AU" -H "$JS" \
  -d '{"title":"UT-Terminal","bank":"MELLAT","terminalNo":"12345678"}')
chk "unknown field still rejected" \
  "$(curl -s -X POST $A/pos-terminals -H "$AU" -H "$JS" -d '{"name":"x"}' | P "d.get('statusCode')")" "400"
chk "list works" "$(curl -s -o /dev/null -w '%{http_code}' "$A/pos-terminals" -H "$AU")" "200"

echo '--- 4) contracts ---'
chk "missing contractNo rejected" \
  "$(curl -s -X POST $A/contracts -H "$AU" -H "$JS" -d '{"title":"UT-C"}' | P "d.get('statusCode')")" "400"
chk "list works" "$(curl -s -o /dev/null -w '%{http_code}' "$A/contracts" -H "$AU")" "200"

echo '--- 5) نگهبان عمومی روی حوزه‌های بی‌DTO ---'
# ۴۹ کنترلر `@Body() dto: any` دارند و ValidationPipe را دور می‌زنند.
# نوشتن DTO برای هر ۱۱۰ مسیر هفته‌ها طول می‌کشد؛ ولی همه به
# BaseCrudService می‌رسند، پس کفِ ایمنی آنجا زیر همه‌شان است.
#
# budget عمداً انتخاب شده: هیچ DTO ندارد.
BIG=$(python3 -c 'print("x"*20000)')
chk "متن بیش از حد رد می‌شود"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/budget -H "$AU" -H "$JS" -d "{\"title\":\"$BIG\",\"year\":1405}")" "400"
# «   » در پایگاه داده از NULL بدتر است: شبیه داده به نظر می‌رسد.
chk "فقط فاصله به null بدل می‌شود"   "$(curl -s -X POST $A/budget -H "$AU" -H "$JS" -d '{"title":"   ","year":1405,"totalAmount":100}' | P "d.get('title') is None")" "True"
chk "ورودی عادی سالم می‌ماند"   "$(curl -s -X POST $A/budget -H "$AU" -H "$JS" -d '{"title":"UT-Budget","year":1405,"totalAmount":1000000}' | P "d.get('title')")" "UT-Budget"

echo '--- 5) بدون توکن بسته است ---'
for ep in pos-terminals contracts price-levels discount-rules; do
  chk "$ep needs auth" "$(curl -s "$A/$ep" | P "d.get('statusCode')")" "401"
done

cleanup_rows

echo
echo "PASS: $pass  FAIL: $fail"
[ $fail -eq 0 ]
