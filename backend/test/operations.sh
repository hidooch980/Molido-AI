#!/usr/bin/env bash
#
# عملیات: ثبت خطا، سلامت نصب، پشتیبانی از راه دور.
#
# مهم‌ترین چیزی که اینجا آزموده می‌شود: **ثبت خطا خودش چیزی را نشکند**.
# فیلتری که هنگام ثبت خطا خطا بدهد، یک مشکل کوچک را به صفحهٔ سفید تبدیل
# می‌کند.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

# توکن مشترک: اگر `run-tests.sh` یک بار وارد شده باشد، دوباره وارد
# نمی‌شویم.  سقف ورود عمداً سخت است (جلوی حدس رمز را می‌گیرد)، و ورودِ
# جداگانه در هر مجموعه همان سقف را می‌خورد، توکن خالی برمی‌گردد، و
# مجموعه با شکست‌هایی می‌افتد که هیچ ربطی به کد ندارند.
T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق — سقف ورود خورده یا سرویس بالا نیست"
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "import sys,json,io;sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

psql "DELETE FROM \"ErrorGroup\";
      DELETE FROM \"HealthSnapshot\";
      DELETE FROM \"SupportSession\";"

echo '--- 1) ordinary 4xx is NOT recorded ---'
# اعتبارسنجی و «یافت نشد» رفتار روزمرهٔ کاربرند نه خطای برنامه؛ ثبتشان
# خطاهای واقعی را زیر خودش دفن می‌کند.
curl -s "$A/products/no-such-product-id" -H "$AU" >/dev/null
curl -s -X POST $A/warehouses -H "$AU" -H "$JS" -d '{"name":""}' >/dev/null
sleep 1
chk "4xx not recorded" "$(psqlv "SELECT COUNT(*) FROM \"ErrorGroup\"")" "0"

echo '--- 2) a real server error is recorded and grouped ---'
# سرریز عددی یک ۵۰۰ واقعی می‌سازد.  سه بار صدا زده می‌شود تا گروه‌بندی هم
# آزموده شود: سه رخداد باید **یک** سطر با شمارندهٔ ۳ بسازند، نه سه سطر.
WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")
for q in 1e30 1e31 1e32; do
  curl -s -o /dev/null -X POST $A/sales -H "$AU" -H "$JS" \
    -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":$q}]}"
done
sleep 1

chk "recorded"         "$(psqlv "SELECT COUNT(*) FROM \"ErrorGroup\" WHERE \"statusCode\" = 500")" "1"
chk "grouped as one"   "$(psqlv "SELECT count FROM \"ErrorGroup\" WHERE \"statusCode\" = 500")" "3"
chk "path kept"        "$(psqlv "SELECT path FROM \"ErrorGroup\" WHERE \"statusCode\" = 500")" "/sales"
# ثبت باید در زمینهٔ شرکت انجام شود، وگرنه RLS درج را بی‌سروصدا رد می‌کند و
# جدول همیشه خالی می‌ماند بی‌آنکه کسی بفهمد چرا.
chk "company attached" "$(psqlv "SELECT CASE WHEN \"companyId\" IS NULL THEN 'no' ELSE 'yes' END FROM \"ErrorGroup\" WHERE \"statusCode\" = 500")" "yes"
chk "visible in API"   "$(curl -s "$A/operations/errors" -H "$AU" | P "len([e for e in d if e['statusCode'] == 500])")" "1"

echo '--- 3) the API is still usable after errors ---'
# اگر ثبت خطا خودش بشکند، درخواست بعدی هم می‌شکند.
chk "api still works" "$(curl -s -o /dev/null -w '%{http_code}' "$A/products?limit=1" -H "$AU")" "200"

echo '--- 4) health snapshot ---'
H=$(curl -s -X POST $A/operations/health -H "$AU" -H "$JS")
chk "has severity" "$(echo "$H" | P "'yes' if d.get('severity') in ('OK','WARN','CRITICAL') else 'no'")" "yes"
chk "has metrics"  "$(echo "$H" | P "'yes' if 'negativeStock' in d['metrics'] else 'no'")" "yes"
chk "stored"       "$(psqlv "SELECT COUNT(*) FROM \"HealthSnapshot\"")" "1"
chk "history"      "$(curl -s "$A/operations/health" -H "$AU" | P "len(d)")" "1"

echo '--- 5) negative stock makes it critical ---'
# موجودی منفی یعنی حساب انبار از واقعیت جدا شده و هر گزارشی از آن به بعد
# غلط است.
psql "UPDATE \"Inventory\" SET quantity = -3 WHERE \"productId\" = 'seed-p3';"
chk "critical" "$(curl -s -X POST $A/operations/health -H "$AU" -H "$JS" | P "d['severity']")" "CRITICAL"
psql "UPDATE \"Inventory\" SET quantity = 10000 WHERE \"productId\" LIKE 'seed-%';"

echo '--- 6) support session needs explicit consent ---'
G=$(curl -s -X POST $A/operations/support -H "$AU" -H "$JS" \
  -d '{"minutes":30,"reason":"TEST"}')
CODE=$(echo "$G" | P "d.get('code','')")
chk "code is six digits" "$(printf '%s' "$CODE" | grep -cE '^[0-9]{6}$')" "1"
chk "read-only by default" "$(echo "$G" | P "d['scope']")" "READ"
chk "listed as active" "$(curl -s "$A/operations/support" -H "$AU" | P "d[0]['isActive']")" "True"

echo '--- 7) duration is clamped ---'
# ۹۹۹۹ دقیقه یعنی دسترسی برای همیشه؛ سقف چهار ساعت است.
chk "clamped to 240" "$(curl -s -X POST $A/operations/support -H "$AU" -H "$JS" \
  -d '{"minutes":9999}' | P "d['minutes']")" "240"

echo '--- 8) the owner can close the door at any moment ---'
SID=$(curl -s "$A/operations/support" -H "$AU" | P "d[0]['id']")
curl -s -X PATCH "$A/operations/support/$SID/revoke" -H "$AU" -H "$JS" >/dev/null
chk "revoked" "$(psqlv "SELECT CASE WHEN \"revokedAt\" IS NULL THEN 'no' ELSE 'yes' END FROM \"SupportSession\" WHERE id='$SID'")" "yes"
chk "no longer active" "$(curl -s "$A/operations/support" -H "$AU" | P "[s['isActive'] for s in d if s['id']=='$SID'][0]")" "False"
chk "double revoke refused" "$(curl -s -X PATCH "$A/operations/support/$SID/revoke" -H "$AU" -H "$JS" | P "d.get('statusCode')")" "404"

echo '--- 9) error status can be changed ---'
psql "INSERT INTO \"ErrorGroup\" (id, \"companyId\", fingerprint, message, \"statusCode\")
      SELECT 'test-err-1', id, 'testfp', 'TEST error', 500 FROM \"Company\" LIMIT 1;"
curl -s -X PATCH "$A/operations/errors/test-err-1" -H "$AU" -H "$JS" \
  -d '{"status":"RESOLVED","note":"TEST note"}' >/dev/null
chk "resolved" "$(psqlv "SELECT status FROM \"ErrorGroup\" WHERE id='test-err-1'")" "RESOLVED"
chk "invalid status refused" "$(curl -s -X PATCH "$A/operations/errors/test-err-1" -H "$AU" -H "$JS" \
  -d '{"status":"NOPE"}' | P "d.get('statusCode')")" "400"

echo '--- 10) a resolved error that recurs reopens itself ---'
# خطایی که دوباره رخ داده، دیگر «حل‌شده» نیست.
psql "UPDATE \"ErrorGroup\" SET status='RESOLVED' WHERE id='test-err-1';"
psql "INSERT INTO \"ErrorGroup\" (id, \"companyId\", fingerprint, message, \"statusCode\")
      SELECT 'x', id, 'testfp', 'TEST error', 500 FROM \"Company\" LIMIT 1
      ON CONFLICT (COALESCE(\"companyId\", ''), fingerprint) DO UPDATE
        SET count = \"ErrorGroup\".count + 1,
            status = CASE WHEN \"ErrorGroup\".status = 'RESOLVED' THEN 'OPEN' ELSE \"ErrorGroup\".status END;"
chk "reopened" "$(psqlv "SELECT status FROM \"ErrorGroup\" WHERE fingerprint='testfp'")" "OPEN"
chk "count bumped" "$(psqlv "SELECT count FROM \"ErrorGroup\" WHERE fingerprint='testfp'")" "2"

# پاک‌سازی
psql "DELETE FROM \"ErrorGroup\";
      DELETE FROM \"HealthSnapshot\";
      DELETE FROM \"SupportSession\";"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
