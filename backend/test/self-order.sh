#!/usr/bin/env bash
#
# منوی دیجیتال و سفارشِ از سرِ میز.
#
# ⚠️ سنجهٔ اصلیِ این فایل «منو نشان داده شود» **نیست**.
#
#    این تنها مسیرِ رستوران است که بدونِ توکن صدا زده می‌شود.  چیزی
#    که واقعاً می‌شکند این است:
#
#      • مشتری قیمتِ خودش را بفرستد و غذا رایگان شود.
#      • یا تخفیفِ کلِ سفارش را برابرِ جمع بفرستد — قیمتِ اقلام درست،
#        جمعِ نهایی صفر.
#      • یا با حدس زدنِ شمارهٔ میز برای رستورانی که هرگز ندیده سفارش
#        بفرستد.
#      • یا بهای تمام‌شده را از پاسخِ عمومی بخواند.
#
#    هر چهار مورد سنجیده می‌شود.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3200}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.resto.yml"}
JS="Content-Type: application/json"
PW=${MOLIDO_ADMIN_PASSWORD:-Admin@123456}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
AU="Authorization: Bearer $T"

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    print('<<no-json:%d>>' % len(raw)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ─────────────── نگهبانِ محصول ───────────────
PROBE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$A/restaurant/stats" -H "$AU")
case "$PROBE" in
  200) ;;
  000|404)
    echo "  ماژول رستوران در این نصب فعال نیست — این مجموعه روی resto اجرا می‌شود"
    echo "  MOLIDO_API=http://localhost:3200 MOLIDO_COMPOSE=\"docker compose -f docker-compose.yml -f docker-compose.resto.yml\""
    echo
    printf "   PASS: 0   FAIL: 0   SKIPPED\n"
    exit 0 ;;
  3??)
    # ⚠️ تغییرِ مسیر یعنی **برنامهٔ دیگری** پشتِ این درگاه است.
    #    دلیلِ کاملش در `e2e-resto.sh`.
    echo "  درگاهِ $A را برنامهٔ دیگری گرفته (پاسخ $PROBE) — این مجموعه اجرا نشد"
    echo "  MOLIDO_API را به درگاهِ درستِ بک‌اندِ resto بدهید."
    echo
    printf "   PASS: 0   FAIL: 0   SKIPPED\n"
    exit 0 ;;
  *)
    echo "  ✗ پاسخِ غیرمنتظرهٔ $PROBE از $A/restaurant/stats"
    echo
    printf "   PASS: 0   FAIL: 1\n"
    exit 1 ;;
esac

cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    DELETE FROM \"RestaurantOrderItem\" WHERE \"orderId\" IN
      (SELECT id FROM \"RestaurantOrder\" WHERE note LIKE 'SOTEST%' OR source = 'SELF');
    DELETE FROM \"RestaurantOrder\" WHERE note LIKE 'SOTEST%' OR source = 'SELF';
    DELETE FROM \"MenuItem\" WHERE name LIKE 'SOTEST%';
    DELETE FROM \"MenuCategory\" WHERE name LIKE 'SOTEST%';
    DELETE FROM \"RestaurantTable\" WHERE \"tableNo\" LIKE 'SO-%';
    DELETE FROM \"SelfOrderSetting\";" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

# ─────────────── چیدمان ───────────────
CID=$(Q "SELECT \"companyId\" FROM \"MenuItem\" LIMIT 1;")
[ -n "$CID" ] || CID=$(Q "SELECT id FROM \"Company\" LIMIT 1;")

CAT=$(curl -s -X POST $A/restaurant/menu-categories -H "$AU" -H "$JS" \
  -d '{"name":"SOTEST-cat"}' | P "d.get('id','')")
ITEM=$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS" \
  -d "{\"name\":\"SOTEST-kebab\",\"categoryId\":\"$CAT\",\"price\":250000,\"cost\":90000}" \
  | P "d.get('id','')")
TBL=$(curl -s -X POST $A/restaurant/tables -H "$AU" -H "$JS" \
  -d '{"tableNo":"SO-1","capacity":4}' | P "d.get('id','')")

chk "میز ساخته شد" "$([ -n "$TBL" ] && echo yes || echo no)" "yes"

TOKEN=$(Q "SELECT \"qrToken\" FROM \"RestaurantTable\" WHERE id='$TBL';")
chk "توکن QR خودکار ساخته شد" "$([ ${#TOKEN} -eq 32 ] && echo yes || echo no)" "yes"

# ⚠️ توکن نباید از شمارهٔ میز مشتق باشد.
chk "توکن شمارهٔ میز نیست" \
  "$(printf '%s' "$TOKEN" | grep -q 'SO-1' && echo derived || echo random)" "random"

echo '--- ۱) منو ---'
M=$(curl -s "$A/menu/$TOKEN")
chk "منو بدون توکن ورود ۲۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/menu/$TOKEN")" "200"
chk "شمارهٔ میز برمی‌گردد" "$(printf '%s' "$M" | P "d['table']['tableNo']")" "SO-1"
chk "قیمت در منو هست" \
  "$(printf '%s' "$M" | P "[i['price'] for c in d['categories'] for i in c['items'] if i['name']=='SOTEST-kebab'][0]")" "250000"

# ⚠️ بهای تمام‌شده یعنی حاشیهٔ سودِ رستوران روی اینترنت.
chk "بهای تمام‌شده بیرون نمی‌رود" \
  "$(printf '%s' "$M" | P "'yes' if 'cost' in str(d) else 'no'")" "no"
chk "شناسهٔ شرکت بیرون نمی‌رود" \
  "$(printf '%s' "$M" | P "'yes' if 'companyId' in str(d) else 'no'")" "no"
chk "ایستگاه آشپزخانه بیرون نمی‌رود" \
  "$(printf '%s' "$M" | P "'yes' if 'station' in str(d) else 'no'")" "no"

chk "توکن نامعتبر ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/menu/00000000000000000000000000000000")" "404"
chk "توکنِ بدریخت ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/menu/12")" "404"

echo '--- ۲) سفارش پیش‌فرض خاموش است ---'
# ⚠️ رستورانی که هنوز تنظیمش نکرده نباید ناخواسته سفارشِ آنلاین بپذیرد.
chk "canOrder پیش‌فرض false" "$(printf '%s' "$M" | P "str(d['canOrder']).lower()")" "false"
chk "ثبت سفارش رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/menu/$TOKEN/order" -H "$JS" \
     -d "{\"items\":[{\"menuItemId\":\"$ITEM\",\"qty\":1}]}")" "403"

# روشنش می‌کنیم.
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "INSERT INTO \"SelfOrderSetting\" (\"companyId\",\"orderEnabled\") VALUES ('$CID', true)
   ON CONFLICT (\"companyId\") DO UPDATE SET \"orderEnabled\" = true;" >/dev/null 2>&1

echo '--- ۳) قیمت از پایگاه‌داده، نه از درخواست ---'
# ⚠️ **مهم‌ترین سنجهٔ فایل.**
R=$(curl -s -X POST "$A/menu/$TOKEN/order" -H "$JS" \
    -d "{\"items\":[{\"menuItemId\":\"$ITEM\",\"qty\":2,\"unitPrice\":1,\"price\":1}],\"discount\":999999}")
chk "قیمتِ تحمیلی نادیده گرفته می‌شود" "$(printf '%s' "$R" | P "d.get('total','?')")" "500000"

GC=$(printf '%s' "$R" | P "d.get('guestCode','')")
chk "کد مهمان برمی‌گردد" "$([ -n "$GC" ] && echo yes || echo no)" "yes"
chk "کد مهمان فقط رقم نیست" \
  "$(printf '%s' "${GC#T-}" | grep -qE '^[0-9]+$' && echo digits || echo mixed)" "mixed"

chk "مبلغِ ذخیره‌شده درست است" \
  "$(Q "SELECT round(total)::bigint FROM \"RestaurantOrder\" WHERE \"guestCode\"='$GC';")" "500000"

# ⚠️ تخفیفِ کلِ سفارش هم نباید از مشتری پذیرفته شود.
chk "تخفیفِ تحمیلی اعمال نشد" \
  "$(Q "SELECT round(discount)::bigint FROM \"RestaurantOrder\" WHERE \"guestCode\"='$GC';")" "0"

chk "منشأ SELF ثبت شد" \
  "$(Q "SELECT source FROM \"RestaurantOrder\" WHERE \"guestCode\"='$GC';")" "SELF"

echo '--- ۴) اعتبارسنجی ---'
chk "سبد خالی ۴۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/menu/$TOKEN/order" -H "$JS" -d '{"items":[]}')" "400"
chk "تعداد منفی ۴۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/menu/$TOKEN/order" -H "$JS" \
     -d "{\"items\":[{\"menuItemId\":\"$ITEM\",\"qty\":-5}]}")" "400"
chk "قلمِ ناشناخته ۴۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/menu/$TOKEN/order" -H "$JS" \
     -d '{"items":[{"menuItemId":"no-such-item","qty":1}]}')" "400"

echo '--- ۵) پیگیریِ مهمان ---'
S=$(curl -s "$A/menu/order/$GC")
chk "وضعیت بدون توکن ۲۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/menu/order/$GC")" "200"
chk "مبلغ درست است" "$(printf '%s' "$S" | P "d['total']")" "500000"

# ⚠️ دانستنِ کد یعنی «من همان مشتری‌ام»، نه دسترسی به پرونده.
chk "شناسهٔ میز بیرون نمی‌رود" "$(printf '%s' "$S" | P "'yes' if 'tableId' in d else 'no'")" "no"
chk "شناسهٔ شرکت بیرون نمی‌رود" "$(printf '%s' "$S" | P "'yes' if 'companyId' in d else 'no'")" "no"
chk "گارسون بیرون نمی‌رود" "$(printf '%s' "$S" | P "'yes' if 'waiterId' in d else 'no'")" "no"
chk "کد ناشناخته ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/menu/order/T-does-not-exist")" "404"

echo '--- ۶) سقفِ مبلغ ---'
# ⚠️ سقف خسارتِ بیشینه را مهار می‌کند، اگر روزی توکنی لو برود.
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "UPDATE \"SelfOrderSetting\" SET \"maxOrderAmount\" = 300000 WHERE \"companyId\"='$CID';" >/dev/null 2>&1
chk "سفارشِ بالاتر از سقف رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/menu/$TOKEN/order" -H "$JS" \
     -d "{\"items\":[{\"menuItemId\":\"$ITEM\",\"qty\":5}]}")" "400"
# ⚠️ سنجه به **همان** سفارش نگاه می‌کند، نه به «هر سفارشِ بالای سقف».
#
#    نسخهٔ اول شرطِ `total > 300000` داشت و سفارشِ سالمِ بخشِ ۳
#    (۵۰۰٬۰۰۰) را هم می‌گرفت — چون سقف **بعد از** آن گذاشته شد.
#    قرمزی که علتش خودِ سنجه باشد، وقتِ عیب‌یابیِ چیزی را می‌گیرد که
#    اصلاً خراب نیست.
chk "سفارشِ ردشده باز نمی‌ماند" \
  "$(Q "SELECT count(*) FROM \"RestaurantOrder\" WHERE source='SELF' AND status='OPEN' AND round(total) = 1250000;")" "0"

echo '--- ۷) پرداختِ آنلاینِ سرِ میز ---'
#
# ⚠️ مسیرِ پول است و مسیرِ **عمومی** — یعنی همان دو خطری که در فروشِ
#    ماژولِ سایت دیدیم، اینجا کنارِ هم‌اند:
#
#      • مبلغ از درخواست پذیرفته شود ⇒ غذا رایگان.
#      • درگاه «موفق» بگوید و مبلغ سنجیده نشود ⇒ سفارشِ پانصدهزاری
#        با هزار ریال تأیید می‌شود.
#
#    هر دو سنجیده می‌شوند.

. "$(dirname "$0")/lib/fake-server.sh"
if fake_up zarinpal; then
  ZCTL="http://localhost:$FAKE_PORT/__control"
  curl -s -o /dev/null -X POST "$ZCTL" -H "$JS" -d '{"underpay":false}'

  PT=$(curl -s -X POST "$A/menu/$TOKEN/order" -H "$JS" \
       -d "{\"items\":[{\"menuItemId\":\"$ITEM\",\"qty\":1}]}" | P "d.get('guestCode','')")
  chk "سفارشِ پرداختی ساخته شد" "$([ -n "$PT" ] && echo yes || echo no)" "yes"

  PAY=$(curl -s -X POST "$A/menu/order/$PT/pay" -H "$JS" -d '{"amount":1}')
  chk "نشانی درگاه برمی‌گردد" \
    "$(printf '%s' "$PAY" | P "'yes' if d.get('paymentUrl') else 'no'")" "yes"

  # ⚠️ مبلغِ تحمیلی در بدنه باید نادیده برود.
  chk "مبلغ از پایگاه‌داده می‌آید" "$(printf '%s' "$PAY" | P "d.get('amount','?')")" "250000"

  curl -s -o /dev/null "$A/menu/pay/callback?code=$PT"
  chk "پس از تأیید، PAID ثبت شد" \
    "$(Q "SELECT round(\"paidAmount\")::bigint FROM \"RestaurantOrder\" WHERE \"guestCode\"='$PT';")" "250000"
  chk "شمارهٔ بانک ثبت شد" \
    "$(Q "SELECT count(*) FROM \"RestaurantOrder\" WHERE \"guestCode\"='$PT' AND \"bankRef\" IS NOT NULL;")" "1"
  chk "پرداختِ دوباره رد می‌شود" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/menu/order/$PT/pay" -H "$JS" -d '{}')" "400"

  # ─── کم‌پرداختی ───
  # ⚠️ مهم‌ترین سنجهٔ این بخش.
  curl -s -o /dev/null -X POST "$ZCTL" -H "$JS" -d '{"underpay":true}'
  UT=$(curl -s -X POST "$A/menu/$TOKEN/order" -H "$JS" \
       -d "{\"items\":[{\"menuItemId\":\"$ITEM\",\"qty\":1}]}" | P "d.get('guestCode','')")
  curl -s -o /dev/null -X POST "$A/menu/order/$UT/pay" -H "$JS" -d '{}'
  curl -s -o /dev/null "$A/menu/pay/callback?code=$UT"
  curl -s -o /dev/null -X POST "$ZCTL" -H "$JS" -d '{"underpay":false}'

  chk "کم‌پرداختی ثبت نمی‌شود" \
    "$(Q "SELECT round(COALESCE(\"paidAmount\",0))::bigint FROM \"RestaurantOrder\" WHERE \"guestCode\"='$UT';")" "0"
  chk "کم‌پرداختی شمارهٔ بانک نمی‌گیرد" \
    "$(Q "SELECT count(*) FROM \"RestaurantOrder\" WHERE \"guestCode\"='$UT' AND \"bankRef\" IS NOT NULL;")" "0"
else
  echo "  درگاهِ ساختگی پیکربندی نشده — از این بخش گذشتیم"
  echo "  (ZARINPAL_BASE_URL=http://host.docker.internal:8899 در .env)"
fi

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
