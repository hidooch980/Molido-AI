#!/usr/bin/env bash
#
# رستوران: میز، منو، سفارش‌گیری، آشپزخانه و تسویه.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.
#
# ⚠️ این آزمون به محصولی نیاز دارد که قابلیت `restaurant` داشته باشد.
#    در نصب `store` ماژول رستوران بالا نمی‌آید و همهٔ مسیرها ۴۰۴ می‌دهند.

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
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ماژول رستوران در این محصول هست؟
if [ "$(curl -s -o /dev/null -w '%{http_code}' "$A/restaurant/stats" -H "$AU")" = "404" ]; then
  echo "  ماژول رستوران در این محصول فعال نیست (MOLIDO_PRODUCT=store)"
  echo "  برای آزمون: MOLIDO_PRODUCT=resto یا suite"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

echo '--- 1) area + table ---'
AR=$(curl -s -X POST $A/restaurant/areas -H "$AU" -H "$JS" -d '{"name":"Main Hall"}')
ARID=$(echo "$AR" | P "d.get('id','')")
chk "area created" "$(echo "$AR" | P "'yes' if d.get('id') else 'no'")" "yes"

TB=$(curl -s -X POST $A/restaurant/tables -H "$AU" -H "$JS" \
  -d "{\"tableNo\":\"T-99\",\"capacity\":4,\"areaId\":\"$ARID\"}")
TBID=$(echo "$TB" | P "d.get('id','')")
chk "table created" "$(echo "$TB" | P "d.get('status')")" "FREE"

echo '--- 2) menu category + item ---'
MC=$(curl -s -X POST $A/restaurant/menu-categories -H "$AU" -H "$JS" -d '{"name":"Drinks"}')
MCID=$(echo "$MC" | P "d.get('id','')")

MI=$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS" \
  -d "{\"name\":\"Tea\",\"price\":80000,\"categoryId\":\"$MCID\",\"station\":\"BAR\"}")
MIID=$(echo "$MI" | P "d.get('id','')")
chk "menu item created" "$(echo "$MI" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 3) create order on table ---'
O=$(curl -s -X POST $A/restaurant/orders -H "$AU" -H "$JS" -d "{
  \"type\":\"DINE_IN\",\"tableId\":\"$TBID\",\"guestCount\":2,
  \"items\":[{\"menuItemId\":\"$MIID\",\"qty\":2}]}")
OID=$(echo "$O" | P "d.get('id','')")
chk "order created" "$(echo "$O" | P "'yes' if d.get('orderNo') else 'no'")" "yes"
chk "order total" "$(echo "$O" | P "int(float(d.get('total',0)))")" "160000"

echo '--- 4) table becomes occupied ---'
chk "table occupied" "$(Q "SELECT status FROM \"RestaurantTable\" WHERE id='$TBID';")" "OCCUPIED"

echo '--- 5) add item to open order ---'
curl -s -X POST "$A/restaurant/orders/$OID/items" -H "$AU" -H "$JS" \
  -d "{\"items\":[{\"menuItemId\":\"$MIID\",\"qty\":1}]}" >/dev/null
chk "total after add" "$(Q "SELECT total::bigint FROM \"RestaurantOrder\" WHERE id='$OID';")" "240000"

echo '--- 6) send to kitchen ---'
curl -s -X POST "$A/restaurant/orders/$OID/send-to-kitchen" -H "$AU" -H "$JS" -d '{}' >/dev/null
chk "order in kitchen" "$(Q "SELECT status FROM \"RestaurantOrder\" WHERE id='$OID';")" "IN_KITCHEN"
# هر بار افزودن، ردیف جدا می‌سازد — درست است: آشپز باید بداند کدام قلم
# چه زمانی سفارش داده شده، نه اینکه عددی که وسط پخت زیاد شده را ببیند.
chk "kitchen shows items" "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "len([i for i in d if i.get('orderId')=='$OID'])")" "2"

echo '--- 6b) چرخهٔ آشپزخانه: فیلتر ایستگاه و وضعیت ---'
# تا امروز فقط «قلم روی تخته دیده می‌شود» سنجیده می‌شد.  ولی آشپزخانه
# وقتی کار می‌کند که قلم بتواند از تخته **برود** — وگرنه تخته تا آخر شب
# پر می‌شود و آشپز چیزی در آن پیدا نمی‌کند.
KID=$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "[i['id'] for i in d if i.get('orderId')=='$OID'][0]")
KST=$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "[i.get('station') for i in d if i['id']=='$KID'][0]")

# میدان `qty` است نه `quantity` — صفحهٔ KDS اول اشتباه می‌خواند و
# تعداد اصلاً نمایش داده نمی‌شد.  این سنجه شکل پاسخ را قفل می‌کند.
chk "kitchen item has qty"   "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "'qty' in [i for i in d if i['id']=='$KID'][0]")" "True"
chk "kitchen item has waitingMinutes"   "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "isinstance([i for i in d if i['id']=='$KID'][0].get('waitingMinutes'), int)")" "True"

# ایستگاه ناشناس قبلاً فهرست خالی می‌داد — آشپز فکر می‌کرد سفارشی نیست.
chk "unknown station → 400 not empty list"   "$(curl -s "$A/restaurant/kitchen?station=NOPE" -H "$AU" | P "d.get('statusCode') if isinstance(d,dict) else 'empty-list'")" "400"
if [ -n "$KST" ] && [ "$KST" != "None" ]; then
  chk "station filter keeps own station"     "$(curl -s "$A/restaurant/kitchen?station=$KST" -H "$AU" | P "sum(1 for i in d if i['id']=='$KID')")" "1"
  OTHER=$([ "$KST" = "BAR" ] && echo GRILL || echo BAR)
  chk "station filter excludes others"     "$(curl -s "$A/restaurant/kitchen?station=$OTHER" -H "$AU" | P "sum(1 for i in d if i['id']=='$KID')")" "0"
fi

chk "PREPARING → READY"   "$(curl -s -X PATCH "$A/restaurant/kitchen/items/$KID" -H "$AU" -H "$JS" -d '{"status":"READY"}' | P "d.get('status')")" "READY"
chk "READY هنوز روی تخته می‌ماند"   "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "sum(1 for i in d if i['id']=='$KID')")" "1"
chk "READY → SERVED"   "$(curl -s -X PATCH "$A/restaurant/kitchen/items/$KID" -H "$AU" -H "$JS" -d '{"status":"SERVED"}' | P "d.get('status')")" "SERVED"
# تحویل‌شده باید از تخته برود؛ اگر نرود تخته تا آخر شب پر می‌شود.
chk "SERVED از تخته می‌رود"   "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "sum(1 for i in d if i['id']=='$KID')")" "0"
chk "وضعیت نامعتبر رد می‌شود"   "$(curl -s -X PATCH "$A/restaurant/kitchen/items/$KID" -H "$AU" -H "$JS" -d '{"status":"BURNT"}' | P "d.get('statusCode')")" "400"
chk "قلم ناموجود ۴۰۴ می‌دهد"   "$(curl -s -X PATCH "$A/restaurant/kitchen/items/00000000-0000-0000-0000-000000000000" -H "$AU" -H "$JS" -d '{"status":"READY"}' | P "d.get('statusCode')")" "404"

echo '--- 6c) مدیریت منو: خاموش/روشن و حذف ---'
# صفحهٔ مدیریت منو تازه ساخته شد؛ تا پیش از آن این مسیرها هیچ آزمونی
# نداشتند و هیچ صفحه‌ای هم صدایشان نمی‌زد.
TMP=$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS"   -d '{"name":"UT-Temp-Dish","price":50000,"station":"COLD"}' | P "d.get('id','')")
chk "menu item created" "$([ -n "$TMP" ] && echo yes || echo no)" "yes"
chk "starts available"   "$(curl -s "$A/restaurant/menu-items" -H "$AU" | P "[i['isAvailable'] for i in d if i['id']=='$TMP'][0]")" "True"
chk "toggle → تمام شد"   "$(curl -s -X PATCH "$A/restaurant/menu-items/$TMP/toggle" -H "$AU" | P "d.get('isAvailable')")" "False"
chk "toggle دوباره → موجود"   "$(curl -s -X PATCH "$A/restaurant/menu-items/$TMP/toggle" -H "$AU" | P "d.get('isAvailable')")" "True"
# ایستگاه غلط باید ۴۰۰ بدهد، نه اینکه بی‌صدا ذخیره شود.
chk "ایستگاه ناشناس رد می‌شود"   "$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS"      -d '{"name":"UT-Bad","price":1000,"station":"NOWHERE"}' | P "d.get('statusCode')")" "400"
chk "قیمت منفی رد می‌شود"   "$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS"      -d '{"name":"UT-Neg","price":-5}' | P "d.get('statusCode')")" "400"

# حذفِ غذایی که در سفارشی به کار رفته نباید تاریخچه را بشکند:
# `RestaurantOrderItem.menuItemId` روی SET NULL است و نام غذا در خود
# قلم ذخیره شده، پس رسیدِ گذشته سالم می‌ماند.
UO=$(curl -s -X POST $A/restaurant/orders -H "$AU" -H "$JS"   -d "{\"type\":\"TAKEAWAY\",\"items\":[{\"menuItemId\":\"$TMP\",\"qty\":1}]}" | P "d.get('id','')")
chk "حذف غذای به‌کاررفته ۵۰۰ نمی‌دهد"   "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/restaurant/menu-items/$TMP" -H "$AU")" "200"
chk "قلم سفارش پس از حذف نامش را نگه می‌دارد"   "$(Q "SELECT name FROM \"RestaurantOrderItem\" WHERE \"orderId\"='$UO';")" "UT-Temp-Dish"
chk "حذف دوباره ۴۰۴ می‌دهد"   "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/restaurant/menu-items/$TMP" -H "$AU")" "404"
curl -s -X POST "$A/restaurant/orders/$UO/cancel" -H "$AU" >/dev/null

echo '--- 6d) رسپی: کسر خودکار مواد اولیه ---'
# سه مسیر رسپی وجود داشت و هیچ صفحه‌ای صدایشان نمی‌زد — یعنی کسر
# خودکار انبار عملاً خاموش بود.  حالا که ویرایشگر رسپی ساخته شده،
# این آزمون زنجیرهٔ کامل را قفل می‌کند: رسپی → تسویه → کسر از انبار.
WH=$(Q "SELECT id FROM \"Warehouse\" LIMIT 1;")
PID=$(Q "SELECT id FROM \"Product\" WHERE \"trackInventory\"=true ORDER BY \"createdAt\" LIMIT 1;")
if [ -n "$WH" ] && [ -n "$PID" ]; then
  RDISH=$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS"     -d '{"name":"UT-Recipe-Dish","price":300000,"station":"KITCHEN"}' | P "d.get('id','')")
  # ۲ واحد با ۱۰٪ ضایعات ⇒ هر پرس ۲٫۲ واحد از انبار می‌برد.
  chk "رسپی ذخیره شد"     "$(curl -s -X POST "$A/restaurant/menu-items/$RDISH/recipe" -H "$AU" -H "$JS"        -d "{\"lines\":[{\"productId\":\"$PID\",\"qty\":2,\"wastePct\":10}]}" | P "len(d)")" "1"
  chk "رسپی بازخوانی می‌شود"     "$(curl -s "$A/restaurant/menu-items/$RDISH/recipe" -H "$AU" | P "float(d[0]['qty'])")" "2.0"
  # ماده‌ای که وجود ندارد نباید بی‌صدا ثبت شود.
  chk "ماده ناموجود رد می‌شود"     "$(curl -s -X POST "$A/restaurant/menu-items/$RDISH/recipe" -H "$AU" -H "$JS"        -d '{"lines":[{"productId":"00000000-0000-0000-0000-000000000000","qty":1}]}' | P "d.get('statusCode')")" "400"

  BEFORE=$(Q "SELECT quantity FROM \"Inventory\" WHERE \"productId\"='$PID' AND \"warehouseId\"='$WH';")
  RORD=$(curl -s -X POST $A/restaurant/orders -H "$AU" -H "$JS"     -d "{\"type\":\"TAKEAWAY\",\"items\":[{\"menuItemId\":\"$RDISH\",\"qty\":3}]}" | P "d.get('id','')")
  curl -s -X POST "$A/restaurant/orders/$RORD/settle" -H "$AU" -H "$JS"     -d "{\"paidAmount\":900000,\"paymentMethod\":\"CASH\",\"warehouseId\":\"$WH\"}" >/dev/null
  AFTER=$(Q "SELECT quantity FROM \"Inventory\" WHERE \"productId\"='$PID' AND \"warehouseId\"='$WH';")
  # ۳ پرس × ۲ واحد × ۱٫۱ = ۶٫۶
  chk "انبار به اندازهٔ رسپی کم شد"     "$(python3 -c "print(round(float('${BEFORE:-0}') - float('${AFTER:-0}'), 2))")" "6.6"

  # تسویه بدون ذکر انبار نباید چیزی کم کند — وگرنه رستورانی که انبار
  # ندارد با هر فروش موجودی منفی می‌سازد.
  RORD2=$(curl -s -X POST $A/restaurant/orders -H "$AU" -H "$JS"     -d "{\"type\":\"TAKEAWAY\",\"items\":[{\"menuItemId\":\"$RDISH\",\"qty\":1}]}" | P "d.get('id','')")
  curl -s -X POST "$A/restaurant/orders/$RORD2/settle" -H "$AU" -H "$JS"     -d '{"paidAmount":300000,"paymentMethod":"CASH"}' >/dev/null
  chk "بدون انبار چیزی کم نمی‌شود"     "$(Q "SELECT quantity FROM \"Inventory\" WHERE \"productId\"='$PID' AND \"warehouseId\"='$WH';")" "$AFTER"

  curl -s -X DELETE "$A/restaurant/menu-items/$RDISH" -H "$AU" >/dev/null
else
  echo "  — انبار یا کالای ردیابی‌شونده نبود؛ رد شد"
fi

echo '--- 7) settle order ---'
S=$(curl -s -X POST "$A/restaurant/orders/$OID/settle" -H "$AU" -H "$JS" \
  -d '{"paidAmount":240000,"paymentMethod":"CASH"}')
chk "settled" "$(Q "SELECT status FROM \"RestaurantOrder\" WHERE id='$OID';")" "PAID"

echo '--- 8) table freed or cleaning ---'
chk "table released" "$(Q "SELECT CASE WHEN status IN ('FREE','CLEANING') THEN 'yes' ELSE status END FROM \"RestaurantTable\" WHERE id='$TBID';")" "yes"

echo '--- 9) settling twice rejected ---'
chk "double settle rejected" "$(curl -s -X POST "$A/restaurant/orders/$OID/settle" -H "$AU" -H "$JS" \
  -d '{"paidAmount":240000,"paymentMethod":"CASH"}' | P "d.get('statusCode')")" "400"

echo '--- 9b) رزرو ---'
# سه مسیر رزرو بی‌آزمون و بی‌صفحه بودند؛ تلفن که زنگ می‌زد، رزرو روی
# کاغذ نوشته می‌شد.
RT=$(Q "SELECT id FROM \"RestaurantTable\" WHERE \"tableNo\"='T-99';")
WHEN=$(python3 -c "
import datetime
print((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3)).replace(microsecond=0).isoformat())")
RES=$(curl -s -X POST $A/restaurant/reservations -H "$AU" -H "$JS"   -d "{\"customerName\":\"UT-Guest\",\"guests\":4,\"reservedAt\":\"$WHEN\",\"tableId\":\"$RT\",\"durationMin\":90}" | P "d.get('id','')")
chk "رزرو ثبت شد" "$([ -n "$RES" ] && echo yes || echo no)" "yes"
chk "وضعیت اولیه PENDING"   "$(Q "SELECT status FROM \"TableReservation\" WHERE id='$RES';")" "PENDING"
chk "زمان رزرو الزامی است"   "$(curl -s -X POST $A/restaurant/reservations -H "$AU" -H "$JS" -d '{"customerName":"UT-NoTime"}' | P "d.get('statusCode')")" "400"
chk "میز ناموجود رد می‌شود"   "$(curl -s -X POST $A/restaurant/reservations -H "$AU" -H "$JS"      -d "{\"customerName\":\"UT-BadTable\",\"reservedAt\":\"$WHEN\",\"tableId\":\"00000000-0000-0000-0000-000000000000\"}" | P "d.get('statusCode')")" "404"
# تداخل: همان میز، همان لحظه.  بدون این، دو مشتری سرِ یک میز می‌آیند.
chk "تداخل رزرو رد می‌شود"   "$(curl -s -X POST $A/restaurant/reservations -H "$AU" -H "$JS"      -d "{\"customerName\":\"UT-Clash\",\"reservedAt\":\"$WHEN\",\"tableId\":\"$RT\"}" | P "d.get('statusCode')")" "400"
# میز خالی گذاشتن باید مجاز باشد: خیلی رزروها سرِ شب تخصیص می‌یابند.
chk "رزرو بدون میز مجاز است"   "$(curl -s -X POST $A/restaurant/reservations -H "$AU" -H "$JS"      -d "{\"customerName\":\"UT-NoTable\",\"reservedAt\":\"$WHEN\"}" | P "bool(d.get('id'))")" "True"
chk "چرخه وضعیت CONFIRMED"   "$(curl -s -X PATCH "$A/restaurant/reservations/$RES" -H "$AU" -H "$JS" -d '{"status":"CONFIRMED"}' | P "d.get('status')")" "CONFIRMED"
chk "فیلتر تاریخ کار می‌کند"   "$(curl -s "$A/restaurant/reservations?date=$(echo "$WHEN" | cut -dT -f1)" -H "$AU" | P "sum(1 for x in d if x['id']=='$RES')")" "1"
chk "روز دیگر خالی است"   "$(curl -s "$A/restaurant/reservations?date=1999-01-01" -H "$AU" | P "len(d)")" "0"

echo '--- 9c) شیفت ---'
SH=$(curl -s -X POST $A/restaurant/shifts/open -H "$AU" -H "$JS" -d '{"openingCash":5000000}' | P "d.get('id','')")
chk "شیفت باز شد" "$([ -n "$SH" ] && echo yes || echo no)" "yes"
chk "در فهرست باز است"   "$(curl -s "$A/restaurant/shifts" -H "$AU" | P "[x['endedAt'] for x in d if x['id']=='$SH'][0] is None")" "True"
CL=$(curl -s -X POST "$A/restaurant/shifts/$SH/close" -H "$AU" -H "$JS" -d '{"closingCash":6000000}')
chk "شیفت بسته شد" "$(echo "$CL" | P "d.get('endedAt') is not None")" "True"
# فروش شیفت باید از سفارش‌های تسویه‌شدهٔ همان بازه محاسبه شود، نه صفرِ
# ثابت — وگرنه اختلاف صندوق همیشه غلط درمی‌آید.
chk "فروش شیفت محاسبه شد" "$(echo "$CL" | P "'totalSales' in d")" "True"
chk "بستن دوباره رد می‌شود"   "$(curl -s -X POST "$A/restaurant/shifts/$SH/close" -H "$AU" -H "$JS" -d '{}' | P "d.get('statusCode')")" "400"
chk "شیفت ناموجود ۴۰۴"   "$(curl -s -X POST "$A/restaurant/shifts/00000000-0000-0000-0000-000000000000/close" -H "$AU" -H "$JS" -d '{}' | P "d.get('statusCode')")" "404"

echo '--- 9d) گزارش پرفروش‌ها ---'
chk "گزارش فهرست می‌دهد"   "$(curl -s "$A/restaurant/reports/top-items" -H "$AU" | P "isinstance(d, list)")" "True"
# غذایی که همین آزمون فروخت باید در گزارش باشد.
chk "قلم فروخته‌شده در گزارش هست"   "$(curl -s "$A/restaurant/reports/top-items?limit=200" -H "$AU" | P "sum(1 for x in d if x['name']=='Tea') >= 1")" "True"
chk "بازه آینده خالی است"   "$(curl -s "$A/restaurant/reports/top-items?from=2099-01-01" -H "$AU" | P "len(d)")" "0"

# پاک‌سازی رزروهای این آزمون
Q "DELETE FROM \"TableReservation\" WHERE \"customerName\" LIKE 'UT-%';" >/dev/null
Q "DELETE FROM \"RestaurantShift\" WHERE id='$SH';" >/dev/null

echo '--- 9e) چیدمان سالن: نگهبان‌های حذف ---'
# `areas` تنها حوزه‌ای بود که هیچ صفحه‌ای نداشت — یعنی رستوران تازه
# اصلاً نمی‌توانست چیدمانش را وارد کند.
#
# هر دو کلید خارجی روی SET NULL هستند، پس حذفِ سالنِ پر یا میزِ مشغول
# **خطا نمی‌داد**: میزها بی‌صدا بی‌سالن می‌شدند و سفارشِ باز بی‌میز.
# نبودِ خطای دیتابیس یعنی نگهبان باید در سرویس باشد.
UA=$(curl -s -X POST $A/restaurant/areas -H "$AU" -H "$JS" -d '{"name":"UT-Area","floor":"۱"}' | P "d.get('id','')")
chk "سالن ساخته شد" "$([ -n "$UA" ] && echo yes || echo no)" "yes"
UT=$(curl -s -X POST $A/restaurant/tables -H "$AU" -H "$JS"   -d "{\"areaId\":\"$UA\",\"tableNo\":\"UT-T1\",\"capacity\":4}" | P "d.get('id','')")
chk "میز ساخته شد" "$([ -n "$UT" ] && echo yes || echo no)" "yes"
# قیدهای دیتابیس حالا ۴۰۹/۴۰۰ با پیام فارسی می‌دهند، نه «خطای داخلی
# سرور» با ۵۰۰.  کاربری که شمارهٔ تکراری می‌زند باید بداند چرا.
chk "شماره میز تکراری رد می‌شود"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/restaurant/tables -H "$AU" -H "$JS"      -d "{\"areaId\":\"$UA\",\"tableNo\":\"UT-T1\",\"capacity\":2}")" "409"
# سالنی که میز دارد نباید حذف شود، وگرنه میزهایش از نقشه ناپدید می‌شوند.
chk "سالن پر حذف نمی‌شود"   "$(curl -s -X DELETE "$A/restaurant/areas/$UA" -H "$AU" | P "d.get('statusCode')")" "400"

UMI=$(curl -s "$A/restaurant/menu-items?limit=5" -H "$AU" | P "d[0]['id']")
UOR=$(curl -s -X POST $A/restaurant/orders -H "$AU" -H "$JS"   -d "{\"type\":\"DINE_IN\",\"tableId\":\"$UT\",\"items\":[{\"menuItemId\":\"$UMI\",\"qty\":1}]}" | P "d.get('id','')")
# میزی که سفارش باز دارد نباید حذف شود، وگرنه گارسون نمی‌داند غذا کجا برود.
chk "میز با سفارش باز حذف نمی‌شود"   "$(curl -s -X DELETE "$A/restaurant/tables/$UT" -H "$AU" | P "d.get('statusCode')")" "400"
chk "سفارش هنوز میزش را دارد"   "$(Q "SELECT CASE WHEN \"tableId\"='$UT' THEN 'yes' ELSE 'no' END FROM \"RestaurantOrder\" WHERE id='$UOR';")" "yes"

curl -s -X POST "$A/restaurant/orders/$UOR/cancel" -H "$AU" >/dev/null
chk "پس از لغو، میز حذف می‌شود"   "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/restaurant/tables/$UT" -H "$AU")" "200"
chk "سالن خالی حذف می‌شود"   "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/restaurant/areas/$UA" -H "$AU")" "200"
chk "حذف دوبارهٔ سالن ۴۰۴"   "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/restaurant/areas/$UA" -H "$AU")" "404"

echo '--- 10) trial balance still zero ---'
chk "trial balance" "$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" WHERE e.status<>'DRAFT';")" "0"

# پاک‌سازی تا اجرای بعدی روی «شماره میز تکراری» نشکند
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"RestaurantTable\" WHERE \"tableNo\"='T-99';
  DELETE FROM \"MenuItem\" WHERE name='Tea';
  DELETE FROM \"MenuCategory\" WHERE name='Drinks';
  DELETE FROM \"RestaurantArea\" WHERE name='Main Hall';
" >/dev/null 2>&1

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
