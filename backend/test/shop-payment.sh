#!/usr/bin/env bash
#
# پرداختِ آنلاینِ فروشگاه — مسیری که **پول** در آن جابه‌جا می‌شود.
#
# ⚠️ این مسیر تا امروز **هیچ پوششی نداشت**.
#
#    `shop.sh` فقط تسویه با پرداخت‌در‌محل را می‌سنجید و
#    `online-orders.sh` هم همین‌طور.  درگاهِ ساختگی ساخته شده بود ولی
#    فقط برای مسیرِ «سایت» استفاده می‌شد — نه فروشگاه.
#
#    یعنی تنها مسیری که در آن پولِ واقعی حرکت می‌کند، تنها مسیری بود
#    که آزموده نشده بود.
#
# ⚠️ سنجهٔ اصلی «پرداخت کار می‌کند» نیست.
#
#    آنچه اهمیت دارد این است که **نشود کمتر پرداخت و بیشتر گرفت**، و
#    اینکه بارگذاریِ دوبارهٔ صفحهٔ بازگشت سفارش را دو بار پرداخت‌شده
#    نکند.  هر دو بی‌صدا خراب می‌شوند: پاسخ ۲۰۰ است و انبار خالی.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JS="Content-Type: application/json"
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi
AU="Authorization: Bearer $T"

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read().strip()
if not raw:
    d=None
else:
    try:
        d=json.loads(raw)
    except ValueError:
        print('<<no-json>>'); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d ' \r'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

PHONE=09129990011
PHONE2=09129990022

cleanup() {
  Q "DELETE FROM \"OnlineOrder\" WHERE \"customerId\" IN
       (SELECT id FROM \"Customer\" WHERE phone IN ('$PHONE','$PHONE2'));
     DELETE FROM \"Cart\" WHERE \"customerId\" IN
       (SELECT id FROM \"Customer\" WHERE phone IN ('$PHONE','$PHONE2'));
     DELETE FROM \"Customer\" WHERE phone IN ('$PHONE','$PHONE2');" >/dev/null
}
stop_fake() { [ -n "${FAKE_PID:-}" ] && kill "$FAKE_PID" 2>/dev/null; }
trap 'cleanup; stop_fake' EXIT
cleanup

# ─────────────────── درگاهِ ساختگی ───────────────────
#
# ⚠️ **پیش از** هر سنجه‌ای بالا می‌آید.  درگاهِ خاموش یعنی قرمزی‌هایی
#    که هیچ ربطی به کدِ محصول ندارند و وقت می‌گیرند تا فهمیده شوند.
ZBASE="${ZARINPAL_BASE_URL:-$(grep -E '^ZARINPAL_BASE_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')}"
FAKE=$(printf '%s' "$ZBASE" | grep -oE '[0-9]+$')
if [ -z "$FAKE" ]; then
  # ⚠️ رد شدنِ صریح، نه سبزِ خاموش.
  echo "  ZARINPAL_BASE_URL به درگاهِ ساختگی اشاره نمی‌کند — از این مجموعه گذشتیم"
  echo "  (ZARINPAL_BASE_URL=http://host.docker.internal:8899 در .env)"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

CTL="http://localhost:$FAKE/__control"
ctl() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 -X POST "$CTL" -H "$JS" -d "$1"; }

if [ "$(ctl '{"underpay":false}')" != "200" ]; then
  python3 backend/test/lib/fake-zarinpal.py "$FAKE" >/dev/null 2>&1 &
  FAKE_PID=$!
  for _ in 1 2 3 4 5; do
    sleep 1
    [ "$(ctl '{"underpay":false}')" = "200" ] && break
  done
fi

# ─────────────────── آماده‌سازی ───────────────────
curl -s -X POST $A/shop-admin/settings -H "$AU" -H "$JS" \
  -d '{"shopName":"Molido","isOpen":true,"shippingFee":0,"freeShippingOver":0,"warehouseId":"seed-warehouse"}' >/dev/null
Q "UPDATE \"Product\" SET \"isOnline\"=true WHERE id='seed-p1';" >/dev/null

R=$(curl -s -X POST $A/shop/register -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\",\"firstName\":\"Pay\"}")
TOK=$(printf '%s' "$R" | P "d.get('token','')")
if [ -z "$TOK" ]; then
  echo "  ✗ ثبت‌نامِ مشتری ناموفق"
  printf '%s\n' "$R" | head -c 200
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi
CA="Authorization: Bearer $TOK"

order() {
  curl -s -X POST $A/shop/cart/items -H "$CA" -H "$JS" \
    -d '{"productId":"seed-p1","qty":1}' >/dev/null
  curl -s -X POST $A/shop/checkout -H "$CA" -H "$JS" \
    -d "{\"receiverName\":\"Pay\",\"receiverPhone\":\"$PHONE\",\"shipAddress\":\"Tehran\",\"paymentMethod\":\"GATEWAY\"}"
}

echo '--- ۱) سفارشِ آنلاین پرداخت‌نشده ساخته می‌شود ---'
# ⚠️ سفارش نباید همان اول PAID شود؛ وگرنه هرکسی بدونِ پرداخت کالا
#    می‌گیرد.
O=$(order)
OID=$(printf '%s' "$O" | P "d.get('id','')")
chk "سفارش ساخته شد" "$([ -n "$OID" ] && echo yes || echo no)" "yes"
chk "وضعیتِ پرداخت PENDING است" \
  "$(Q "SELECT \"paymentStatus\" FROM \"OnlineOrder\" WHERE id='$OID';")" "PENDING"

echo '--- ۲) آغازِ پرداخت ---'
S=$(curl -s -X POST "$A/shop/orders/$OID/pay" -H "$CA" -H "$JS")
chk "نشانیِ درگاه برگشت" \
  "$(printf '%s' "$S" | P "'yes' if str(d.get('redirectUrl','')).startswith('http') else 'no'")" "yes"
chk "شناسهٔ پرداخت ذخیره شد" \
  "$(Q "SELECT CASE WHEN \"paymentRef\" IS NULL THEN 'no' ELSE 'yes' END FROM \"OnlineOrder\" WHERE id='$OID';")" "yes"

echo '--- ۳) تأییدِ پرداخت ---'
V=$(curl -s -X POST "$A/shop/orders/$OID/verify-payment" -H "$CA" -H "$JS")
chk "تأیید موفق بود" "$(printf '%s' "$V" | P "'yes' if d.get('ok') else 'no'")" "yes"
chk "سفارش PAID شد" \
  "$(Q "SELECT \"paymentStatus\" FROM \"OnlineOrder\" WHERE id='$OID';")" "PAID"

echo '--- ۴) تأییدِ دوباره سفارش را دوباره پرداخت‌شده نمی‌کند ---'
# ⚠️ بارگذاریِ دوبارهٔ صفحهٔ بازگشت اتفاقِ **عادی** است — مشتری F5
#    می‌زند، یا اینترنتش قطع می‌شود و دوباره باز می‌کند.  اگر هر بار
#    سند بخورد، دفتر برای همیشه منحرف می‌ماند.
V2=$(curl -s -X POST "$A/shop/orders/$OID/verify-payment" -H "$CA" -H "$JS")
chk "بارِ دوم «قبلاً پرداخت شده» می‌گوید" \
  "$(printf '%s' "$V2" | P "'yes' if d.get('alreadyPaid') else 'no'")" "yes"
chk "همچنان یک سفارشِ پرداخت‌شده است" \
  "$(Q "SELECT count(*) FROM \"OnlineOrder\" WHERE id='$OID' AND \"paymentStatus\"='PAID';")" "1"

echo '--- ۵) پرداختِ کمتر رد می‌شود ---'
#
# ⚠️ **مهم‌ترین سنجهٔ فایل.**
#
#    درگاه فقط می‌گوید «تراکنش موفق بود».  اگر مبلغ سنجیده نشود،
#    مهاجم سفارشِ ده‌میلیونی را با هزار تومان تأیید می‌کند — کدِ
#    پیگیری معتبر است و ما فرض می‌کنیم درست پرداخت شده.
O2=$(order)
OID2=$(printf '%s' "$O2" | P "d.get('id','')")
curl -s -X POST "$A/shop/orders/$OID2/pay" -H "$CA" -H "$JS" >/dev/null

ctl '{"underpay":true}' >/dev/null
V3=$(curl -s -X POST "$A/shop/orders/$OID2/verify-payment" -H "$CA" -H "$JS")
ctl '{"underpay":false}' >/dev/null

chk "پرداختِ کمتر پذیرفته نشد" "$(printf '%s' "$V3" | P "d.get('statusCode')")" "400"
chk "سفارش PAID نشد" \
  "$(Q "SELECT \"paymentStatus\" FROM \"OnlineOrder\" WHERE id='$OID2';")" "FAILED"

echo '--- ۶) تأیید بدونِ آغازِ پرداخت ---'
# ⚠️ سفارشی که هرگز به درگاه نرفته نباید با یک تأییدِ خالی PAID شود.
O3=$(order)
OID3=$(printf '%s' "$O3" | P "d.get('id','')")
chk "بدونِ آغاز، تأیید رد می‌شود" \
  "$(curl -s -X POST "$A/shop/orders/$OID3/verify-payment" -H "$CA" -H "$JS" | P "d.get('statusCode')")" "400"
chk "و سفارش دست‌نخورده ماند" \
  "$(Q "SELECT \"paymentStatus\" FROM \"OnlineOrder\" WHERE id='$OID3';")" "PENDING"

echo '--- ۷) سفارشِ مشتریِ دیگر ---'
#
# ⚠️ اگر مشتری بتواند سفارشِ دیگری را تأیید کند، می‌شود سفارشِ خودش را
#    با پرداختِ کسِ دیگری پرداخت‌شده کرد.
R2=$(curl -s -X POST $A/shop/register -H "$JS" \
  -d "{\"phone\":\"$PHONE2\",\"password\":\"secret123\",\"firstName\":\"Other\"}")
TOK2=$(printf '%s' "$R2" | P "d.get('token','')")
if [ -n "$TOK2" ]; then
  OA="Authorization: Bearer $TOK2"
  chk "مشتریِ دیگر نمی‌تواند تأیید کند" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shop/orders/$OID3/verify-payment" -H "$OA" -H "$JS")" "404"
  chk "و نمی‌تواند پرداخت را آغاز کند" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shop/orders/$OID3/pay" -H "$OA" -H "$JS")" "404"
fi

echo '--- ۸) بدونِ ورود ---'
chk "آغازِ پرداخت بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shop/orders/$OID3/pay" -H "$JS")" "401"
chk "تأیید بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shop/orders/$OID3/verify-payment" -H "$JS")" "401"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
