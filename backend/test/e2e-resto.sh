#!/usr/bin/env bash
#
# چرخهٔ کامل رستوران — از چیدمان سالن تا تسویه و کسر انبار.
#
# `restaurant.sh` هر مسیر را جدا می‌سنجد.  این یکی زنجیره را می‌سنجد:
#
#   سالن → میز → دستهٔ منو → غذا → رسپی → سفارش → آشپزخانه →
#   تحویل → تسویه → کسر مواد اولیه از انبار → تراز حسابداری
#
# اگر جایی از این زنجیره بشکند، هر ماژول به‌تنهایی سبز است و فقط
# رستوران‌دار آخر ماه می‌فهمد که انبارش با فروشش نمی‌خواند.
#
# ⚠️ روی نصب `resto` اجرا می‌شود:
#     MOLIDO_API=http://localhost:3200 \
#     MOLIDO_COMPOSE="docker compose -f docker-compose.yml -f docker-compose.resto.yml" \
#     bash backend/test/e2e-resto.sh

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3200}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.resto.yml"}

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
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از /auth/login" ;;
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
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# ⚠️ این نگهبان **درونِ بدنهٔ `chk()`** افتاده بود.
#
#    یعنی هرگز پیش از سنجه‌ها اجرا نمی‌شد، و شرطش هم فقط ۴۰۴ را
#    می‌دید.  در اجرای فروشگاه، `$A` به درگاهی اشاره می‌کند که کسی
#    پشتش نیست ⇒ پاسخ `000`، نه ۴۰۴ ⇒ نگهبان ساکت و ۱۵ شکستِ بی‌معنی
#    با بدنهٔ خالی.
#
# ⚠️ چرا خودِ ورود جلویش را نگرفت؟
#
#    `run-tests.sh` متغیرِ `MOLIDO_TOKEN` را صادر می‌کند.  این فایل
#    وقتی توکن از محیط بیاید اصلاً وارد نمی‌شود، پس بررسیِ «سرویس
#    پاسخ می‌دهد؟» که در بلوکِ ورود بود، دور زده می‌شد.  توکنِ به‌ارث
#    رسیده باعث می‌شد فایل فکر کند وصل است.
PROBE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$A/restaurant/stats" -H "$AU")
case "$PROBE" in
  200) ;;
  000)
    echo "  سرویس روی $A پاسخ نمی‌دهد — این مجموعه روی نصبِ resto اجرا می‌شود"
    echo "  MOLIDO_API=http://localhost:3201 MOLIDO_COMPOSE=\"docker compose -f docker-compose.yml -f docker-compose.resto.yml\""
    echo
    printf "   PASS: 0   FAIL: 0   SKIPPED\n"
    exit 0 ;;
  404)
    echo "  ماژول رستوران در این محصول فعال نیست (MOLIDO_PRODUCT=store)"
    echo "  برای آزمون: MOLIDO_PRODUCT=resto یا suite"
    echo
    printf "   PASS: 0   FAIL: 0   SKIPPED\n"
    exit 0 ;;
  *)
    # ⚠️ هر چیزِ دیگری (۴۰۱، ۴۲۹، ۵۰۰) **شکست** است، نه رد شدن.
    #    «رد شدنِ بی‌صدا» همان چیزی است که این فایل را ماه‌ها پنهان کرد.
    echo "  ✗ پاسخِ غیرمنتظرهٔ $PROBE از $A/restaurant/stats"
    echo
    printf "   PASS: 0   FAIL: 1\n"
    exit 1 ;;
esac

pass=0; fail=0
chk() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}

TRIAL_BEFORE=$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint
                    FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
                   WHERE e.status<>'DRAFT'")

cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q >/dev/null 2>&1 <<'SQL'
DELETE FROM "RestaurantOrderItem" WHERE "orderId" IN
  (SELECT id FROM "RestaurantOrder" WHERE note LIKE 'RE2E-%');
DELETE FROM "RestaurantOrder" WHERE note LIKE 'RE2E-%';
DELETE FROM "MenuRecipe" WHERE "menuItemId" IN (SELECT id FROM "MenuItem" WHERE name LIKE 'RE2E-%');
DELETE FROM "MenuItem" WHERE name LIKE 'RE2E-%';
DELETE FROM "MenuCategory" WHERE name LIKE 'RE2E-%';
DELETE FROM "RestaurantTable" WHERE "tableNo" LIKE 'RE2E-%';
DELETE FROM "RestaurantArea" WHERE name LIKE 'RE2E-%';
SQL
}
cleanup

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۱: چیدمان سالن ━━━'
# ═══════════════════════════════════════════════════════════════

AREA=$(curl -s -X POST $A/restaurant/areas -H "$AU" -H "$JS" \
  -d '{"name":"RE2E-Hall"}' | P "d.get('id','')")
chk "سالن ساخته شد" "$([ -n "$AREA" ] && echo yes || echo no)" "yes"

TBL=$(curl -s -X POST $A/restaurant/tables -H "$AU" -H "$JS" \
  -d "{\"areaId\":\"$AREA\",\"tableNo\":\"RE2E-1\",\"capacity\":4}" | P "d.get('id','')")
chk "میز ساخته شد" "$([ -n "$TBL" ] && echo yes || echo no)" "yes"
chk "میز آزاد است" "$(Q "SELECT status FROM \"RestaurantTable\" WHERE id='$TBL'")" "FREE"

# سالنی که میز دارد نباید حذف شود — وگرنه میزهایش از نقشه ناپدید
# می‌شوند بی‌آنکه کسی بفهمد.
chk "سالن پر حذف نمی‌شود" \
  "$(curl -s -X DELETE "$A/restaurant/areas/$AREA" -H "$AU" | P "d.get('statusCode')")" "400"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۲: منو و رسپی ━━━'
# ═══════════════════════════════════════════════════════════════

CAT=$(curl -s -X POST $A/restaurant/menu-categories -H "$AU" -H "$JS" \
  -d '{"name":"RE2E-Main"}' | P "d.get('id','')")
DISH=$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS" \
  -d "{\"categoryId\":\"$CAT\",\"name\":\"RE2E-Kebab\",\"price\":800000,\"station\":\"GRILL\"}" \
  | P "d.get('id','')")
chk "غذا ساخته شد" "$([ -n "$DISH" ] && echo yes || echo no)" "yes"

WH=$(Q "SELECT id FROM \"Warehouse\" LIMIT 1")
RAW=$(Q "SELECT id FROM \"Product\" ORDER BY \"createdAt\" LIMIT 1")
chk "ماده اولیه هست" "$([ -n "$RAW" ] && echo yes || echo no)" "yes"

# ۲ واحد با ۱۰٪ ضایعات ⇒ هر پرس ۲٫۲ واحد می‌برد.
R=$(curl -s -X POST "$A/restaurant/menu-items/$DISH/recipe" -H "$AU" -H "$JS" \
  -d "{\"lines\":[{\"productId\":\"$RAW\",\"qty\":2,\"wastePct\":10}]}")
chk "رسپی ثبت شد" "$(echo "$R" | P "len(d)")" "1"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۳: سفارش و آشپزخانه ━━━'
# ═══════════════════════════════════════════════════════════════

ORD=$(curl -s -X POST $A/restaurant/orders -H "$AU" -H "$JS" -d "{
  \"type\":\"DINE_IN\",\"tableId\":\"$TBL\",\"note\":\"RE2E-order\",
  \"items\":[{\"menuItemId\":\"$DISH\",\"qty\":3}]}")
OID=$(echo "$ORD" | P "d.get('id','')")
chk "سفارش ثبت شد" "$([ -n "$OID" ] && echo yes || echo no)" "yes"
chk "مبلغ سفارش" "$(echo "$ORD" | P "int(float(d.get('total',0)))")" "2400000"
# میز باید مشغول شود؛ وگرنه دو گروه سرِ یک میز می‌نشینند.
chk "میز مشغول شد" "$(Q "SELECT status FROM \"RestaurantTable\" WHERE id='$TBL'")" "OCCUPIED"

# پیش از ارسال، آشپزخانه نباید چیزی ببیند.
chk "پیش از ارسال، تخته خالی" \
  "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "sum(1 for i in d if i.get('orderId')=='$OID')")" "0"

curl -s -X POST "$A/restaurant/orders/$OID/send-to-kitchen" -H "$AU" >/dev/null
chk "روی تخته آمد" \
  "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "sum(1 for i in d if i.get('orderId')=='$OID')")" "1"
chk "ایستگاه درست است" \
  "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "[i['station'] for i in d if i.get('orderId')=='$OID'][0]")" "GRILL"

KID=$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "[i['id'] for i in d if i.get('orderId')=='$OID'][0]")
chk "آماده شد" \
  "$(curl -s -X PATCH "$A/restaurant/kitchen/items/$KID" -H "$AU" -H "$JS" -d '{"status":"READY"}' | P "d.get('status')")" "READY"
chk "آمادهٔ تحویل هنوز روی تخته" \
  "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "sum(1 for i in d if i['id']=='$KID')")" "1"
chk "تحویل شد" \
  "$(curl -s -X PATCH "$A/restaurant/kitchen/items/$KID" -H "$AU" -H "$JS" -d '{"status":"SERVED"}' | P "d.get('status')")" "SERVED"
# تحویل‌شده باید از تخته برود، وگرنه تخته تا آخر شب پر می‌شود.
chk "از تخته رفت" \
  "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "sum(1 for i in d if i['id']=='$KID')")" "0"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۴: تسویه و کسر انبار ━━━'
# ═══════════════════════════════════════════════════════════════

BEFORE=$(Q "SELECT COALESCE(quantity,0)::numeric FROM \"Inventory\"
             WHERE \"productId\"='$RAW' AND \"warehouseId\"='$WH'")

curl -s -X POST "$A/restaurant/orders/$OID/settle" -H "$AU" -H "$JS" \
  -d "{\"paidAmount\":2400000,\"paymentMethod\":\"CASH\",\"warehouseId\":\"$WH\"}" >/dev/null

chk "سفارش تسویه شد" "$(Q "SELECT status FROM \"RestaurantOrder\" WHERE id='$OID'")" "PAID"
# میز باید آزاد یا در حال نظافت شود.
chk "میز آزاد شد" \
  "$(Q "SELECT CASE WHEN status IN ('FREE','CLEANING') THEN 'yes' ELSE status END
          FROM \"RestaurantTable\" WHERE id='$TBL'")" "yes"

AFTER=$(Q "SELECT COALESCE(quantity,0)::numeric FROM \"Inventory\"
            WHERE \"productId\"='$RAW' AND \"warehouseId\"='$WH'")
# ۳ پرس × ۲ واحد × ۱٫۱ ضایعات = ۶٫۶
chk "انبار به اندازهٔ رسپی کم شد" \
  "$(python3 -c "print(round(float('${BEFORE:-0}') - float('${AFTER:-0}'), 2))")" "6.6"

# تسویهٔ دوباره نباید انبار را دو بار کم کند.
curl -s -X POST "$A/restaurant/orders/$OID/settle" -H "$AU" -H "$JS" \
  -d "{\"paidAmount\":2400000,\"paymentMethod\":\"CASH\",\"warehouseId\":\"$WH\"}" >/dev/null
chk "تسویهٔ دوباره انبار را کم نکرد" \
  "$(Q "SELECT COALESCE(quantity,0)::numeric FROM \"Inventory\"
          WHERE \"productId\"='$RAW' AND \"warehouseId\"='$WH'")" "$AFTER"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۵: تراز ━━━'
# ═══════════════════════════════════════════════════════════════

TRIAL_AFTER=$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint
                   FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
                  WHERE e.status<>'DRAFT'")
chk "تراز صفر ماند" "$TRIAL_AFTER" "$TRIAL_BEFORE"

cleanup

echo
printf '   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
