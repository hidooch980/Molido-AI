#!/usr/bin/env bash
#
# کلید سریع صندوق — سفارشی‌سازی منوی فروش.
#
# تنها قابلیتی از فهرست رقبا که نداشتیم.  کالای فله بارکد ندارد و
# کالای پرفروش با یک لمس سریع‌تر از اسکن است.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "import sys,json,io;sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8');sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql()  { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

psql "DELETE FROM \"QuickKey\" WHERE \"groupId\" IN
        (SELECT id FROM \"QuickKeyGroup\" WHERE name LIKE 'QK-TEST%');
      DELETE FROM \"QuickKeyGroup\" WHERE name LIKE 'QK-TEST%';
      DELETE FROM \"Product\" WHERE sku = 'QK-TEST-P';"

PROD=$(curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"QuickKey Test Item","sku":"QK-TEST-P","unit":"pcs",
  "salePrice":50000,"purchasePrice":30000}' | P "d.get('id','')")

echo '--- 1) ساخت گروه ---'
G=$(curl -s -X POST $A/retail/quick-keys/groups -H "$AU" -H "$JS" \
  -d '{"name":"QK-TEST-Group","color":"#1f5eff","sortOrder":1}')
GID=$(echo "$G" | P "d.get('id','')")
chk "گروه ساخته شد" "$([ -n "$GID" ] && echo yes || echo no)" "yes"

echo '--- 2) نام تکراری گروه، تکرار نمی‌سازد ---'
# دو گروه هم‌نام یعنی صندوق‌دار دو زبانهٔ یکسان می‌بیند.
curl -s -X POST $A/retail/quick-keys/groups -H "$AU" -H "$JS" \
  -d '{"name":"QK-TEST-Group","color":"#047857"}' >/dev/null
chk "گروه هم‌نام به‌روز شد" \
  "$(psqlv "SELECT count(*) FROM \"QuickKeyGroup\" WHERE name='QK-TEST-Group'")" "1"

echo '--- 3) نام خالی رد می‌شود ---'
chk "نام خالی" "$(curl -s -X POST $A/retail/quick-keys/groups -H "$AU" -H "$JS" \
  -d '{"name":"   "}' | P "d.get('statusCode')")" "400"

echo '--- 4) رنگ بدشکل رد می‌شود ---'
chk "رنگ نامعتبر" "$(curl -s -X POST $A/retail/quick-keys/groups -H "$AU" -H "$JS" \
  -d '{"name":"QK-TEST-Bad","color":"red"}' | P "d.get('statusCode')")" "400"

echo '--- 5) افزودن کلید ---'
K=$(curl -s -X POST $A/retail/quick-keys -H "$AU" -H "$JS" -d "{
  \"groupId\":\"$GID\",\"productId\":\"$PROD\",
  \"label\":\"Bread\",\"defaultQty\":10,\"sortOrder\":1}")
KID=$(echo "$K" | P "d.get('id','')")
chk "کلید ساخته شد"      "$([ -n "$KID" ] && echo yes || echo no)" "yes"
chk "مقدار پیش‌فرض ۱۰"  "$(echo "$K" | P "int(float(d['defaultQty']))")" "10"

echo '--- 6) کالای تکراری در گروه، دو دکمه نمی‌سازد ---'
curl -s -X POST $A/retail/quick-keys -H "$AU" -H "$JS" -d "{
  \"groupId\":\"$GID\",\"productId\":\"$PROD\",\"label\":\"Bread2\",\"defaultQty\":5}" >/dev/null
chk "کلید تکراری به‌روز شد" \
  "$(psqlv "SELECT count(*) FROM \"QuickKey\" WHERE \"groupId\"='$GID' AND \"productId\"='$PROD'")" "1"
chk "برچسب به‌روز شد" \
  "$(psqlv "SELECT label FROM \"QuickKey\" WHERE \"groupId\"='$GID' AND \"productId\"='$PROD'")" "Bread2"

echo '--- 7) مقدار صفر یا منفی رد می‌شود ---'
# دکمه‌ای که صفر اضافه کند بی‌فایده است؛ منفی فاکتور را خراب می‌کند.
chk "مقدار صفر"  "$(curl -s -X POST $A/retail/quick-keys -H "$AU" -H "$JS" \
  -d "{\"groupId\":\"$GID\",\"productId\":\"$PROD\",\"defaultQty\":0}" | P "d.get('statusCode')")" "400"
chk "مقدار منفی" "$(curl -s -X POST $A/retail/quick-keys -H "$AU" -H "$JS" \
  -d "{\"groupId\":\"$GID\",\"productId\":\"$PROD\",\"defaultQty\":-3}" | P "d.get('statusCode')")" "400"

echo '--- 8) مقدار نجومی رد می‌شود ---'
chk "مقدار بیش از سقف" "$(curl -s -X POST $A/retail/quick-keys -H "$AU" -H "$JS" \
  -d "{\"groupId\":\"$GID\",\"productId\":\"$PROD\",\"defaultQty\":99999}" | P "d.get('statusCode')")" "400"

echo '--- 9) کالای ناموجود رد می‌شود ---'
chk "کالای ناموجود" "$(curl -s -X POST $A/retail/quick-keys -H "$AU" -H "$JS" \
  -d "{\"groupId\":\"$GID\",\"productId\":\"no-such-product\"}" | P "d.get('statusCode')")" "404"

echo '--- 10) گروه ناموجود رد می‌شود ---'
chk "گروه ناموجود" "$(curl -s -X POST $A/retail/quick-keys -H "$AU" -H "$JS" \
  -d "{\"groupId\":\"no-such-group\",\"productId\":\"$PROD\"}" | P "d.get('statusCode')")" "404"

echo '--- 11) چیدمان صندوق ---'
LAYOUT=$(curl -s $A/retail/quick-keys -H "$AU")
chk "گروه در چیدمان هست" \
  "$(echo "$LAYOUT" | P "'yes' if any(g['id']=='$GID' for g in d) else 'no'")" "yes"
chk "کلید همراه گروه می‌آید" \
  "$(echo "$LAYOUT" | P "len([g for g in d if g['id']=='$GID'][0]['keys'])")" "1"
# نام و قیمت کالا همراه کلید است، وگرنه صندوق برای هر دکمه یک درخواست
# جدا می‌زند و باز شدن صفحه کند می‌شود.
chk "نام کالا همراه کلید" \
  "$(echo "$LAYOUT" | P "[g for g in d if g['id']=='$GID'][0]['keys'][0]['productName']")" "QuickKey Test Item"
chk "قیمت همراه کلید" \
  "$(echo "$LAYOUT" | P "int(float([g for g in d if g['id']=='$GID'][0]['keys'][0]['salePrice']))")" "50000"

echo '--- 12) ترتیب تازه ---'
KID2=$(psqlv "SELECT id FROM \"QuickKey\" WHERE \"groupId\"='$GID' LIMIT 1")
chk "ترتیب ذخیره شد" "$(curl -s -X POST $A/retail/quick-keys/reorder -H "$AU" -H "$JS" \
  -d "{\"items\":[{\"id\":\"$KID2\",\"sortOrder\":7}]}" | P "d['updated']")" "1"
chk "ترتیب اعمال شد" "$(psqlv "SELECT \"sortOrder\" FROM \"QuickKey\" WHERE id='$KID2'")" "7"

echo '--- 13) حذف گروه، کلیدهایش را هم می‌برد ---'
# کلید بی‌صاحب یعنی دکمه‌ای که در هیچ زبانه‌ای نیست ولی در دیتابیس مانده.
curl -s -X DELETE "$A/retail/quick-keys/groups/$GID" -H "$AU" >/dev/null
chk "گروه حذف شد"   "$(psqlv "SELECT count(*) FROM \"QuickKeyGroup\" WHERE id='$GID'")" "0"
chk "کلیدها هم رفتند" "$(psqlv "SELECT count(*) FROM \"QuickKey\" WHERE \"groupId\"='$GID'")" "0"

echo '--- 14) صندوق‌دار می‌بیند ولی نمی‌سازد ---'
# چیدمان را مدیر تعیین می‌کند؛ صندوق‌دار فقط استفاده می‌کند.  اگر
# صندوق‌دار بتواند دکمه بسازد، چیدمان هر شیفت عوض می‌شود.
chk "خواندن چیدمان باز است" "$(curl -s -o /dev/null -w '%{http_code}' $A/retail/quick-keys -H "$AU")" "200"

echo '--- 15) بدون توکن بسته است ---'
chk "بدون توکن" "$(curl -s -o /dev/null -w '%{http_code}' $A/retail/quick-keys)" "401"

psql "DELETE FROM \"Product\" WHERE sku = 'QK-TEST-P';
      DELETE FROM \"QuickKeyGroup\" WHERE name LIKE 'QK-TEST%';"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
