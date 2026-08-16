#!/usr/bin/env bash
#
# صندوق و قیمت‌گذاری سمت سرور.
#
# اینجا فقط یک چیز آزموده می‌شود و آن مهم‌ترین است: **قیمتی که کلاینت
# می‌فرستد نباید مبلغ فاکتور را تعیین کند.**
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
T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  # پیام قبلی همیشه «سقف ورود» را متهم می‌کرد — ولی رمزِ غلط، سرویسِ
  # خاموش و سقفِ ورود سه چیز متفاوت‌اند و سه راه‌حل متفاوت دارند.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST $A/auth/login     -H 'Content-Type: application/json' -d '{"email":"admin@molido.ai","password":"'"$PW"'"}')
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
    # پاسخ JSON نبود: خالی، ۴۲۹ بی‌بدنه، یا اتصال قطع‌شده.  بدون این
    # برچسب، خروجیِ خالی در گزارش شبیه اشکال منطقی به نظر می‌رسید.
    # برچسب باید بی‌گیومه و بی‌بک‌اسلش باشد: این مقدار در عبارتِ
    # پایتونِ سنجهٔ بعدی جاگذاری می‌شود و اگر گیومه داشته باشد نحو
    # را می‌شکند — یعنی برچسبِ تشخیصی، خودش شکست تازه می‌سازد.
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }

# وضعیت شناخته: قیمت پایه و بدون قاعدهٔ تخفیف
psql "DELETE FROM \"DiscountRule\" WHERE name LIKE 'TEST-%';
      UPDATE \"Product\" SET \"salePrice\"=100000 WHERE id='seed-p3';"

WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")

sale() {
  curl -s -X POST $A/sales -H "$AU" -H "$JS" \
    -d "{\"warehouseId\":\"$WH\",\"items\":[$1]}"
}

echo '--- 1) client-supplied price is ignored ---'
# کلاینت ادعا می‌کند کالای ۱۰۰٬۰۰۰ تومانی، ۱ تومان است.
S=$(sale "{\"productId\":\"seed-p3\",\"quantity\":2,\"price\":1}")
chk "total from server price" "$(echo "$S" | P "int(float(d['total']))")" "200000"
chk "not client price"        "$(echo "$S" | P "'yes' if float(d['total']) != 2 else 'no'")" "yes"

echo '--- 2) client-supplied line discount is ignored ---'
S=$(sale "{\"productId\":\"seed-p3\",\"quantity\":1,\"discount\":99999}")
chk "discount ignored" "$(echo "$S" | P "int(float(d['total']))")" "100000"

echo '--- 3) tiered price applies without the client asking ---'
L=$(curl -s -X POST $A/pricing/levels -H "$AU" -H "$JS" \
  -d '{"name":"TEST-PosLevel","isDefault":true}' | P "d['id']")
curl -s -X POST $A/pricing/prices -H "$AU" -H "$JS" \
  -d "{\"productId\":\"seed-p3\",\"priceLevelId\":\"$L\",\"price\":80000,\"minQty\":10}" >/dev/null

chk "below tier = base"  "$(sale "{\"productId\":\"seed-p3\",\"quantity\":1}"  | P "int(float(d['total']))")" "100000"
chk "at tier = cheaper"  "$(sale "{\"productId\":\"seed-p3\",\"quantity\":10}" | P "int(float(d['total']))")" "800000"

echo '--- 4) automatic discount applies at checkout ---'
curl -s -X POST $A/pricing/rules -H "$AU" -H "$JS" \
  -d '{"name":"TEST-PosOff","kind":"PERCENT","value":25,"productId":"seed-p3"}' >/dev/null
# ۱ عدد به قیمت پایه ۱۰۰٬۰۰۰ منهای ۲۵٪ ⇒ ۷۵٬۰۰۰
chk "25% applied" "$(sale "{\"productId\":\"seed-p3\",\"quantity\":1}" | P "int(float(d['total']))")" "75000"
chk "discount recorded on sale" "$(sale "{\"productId\":\"seed-p3\",\"quantity\":1}" | P "'yes' if float(d['subtotal']) == 75000 else 'no'")" "yes"

echo '--- 5) quote and sale agree ---'
# اگر این دو از هم جدا شوند، صندوق‌دار عددی را می‌بیند که مشتری نمی‌پردازد.
Q=$(curl -s -X POST $A/pricing/quote -H "$AU" -H "$JS" \
  -d '{"lines":[{"productId":"seed-p3","qty":10}]}' | P "int(float(d['total']))")
V=$(sale "{\"productId\":\"seed-p3\",\"quantity\":10}" | P "int(float(d['total']))")
chk "quote == sale" "$Q" "$V"

# پاک‌سازی
psql "DELETE FROM \"DiscountRule\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"ProductPrice\" WHERE \"priceLevelId\"='$L';
      UPDATE \"PriceLevel\" SET \"isDefault\"=false WHERE id='$L';
      DELETE FROM \"PriceLevel\" WHERE id='$L';
      UPDATE \"PriceLevel\" SET \"isDefault\"=true
        WHERE id = (SELECT id FROM \"PriceLevel\" ORDER BY \"createdAt\" LIMIT 1);
      UPDATE \"Product\" SET \"salePrice\"=310000 WHERE id='seed-p3';"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
