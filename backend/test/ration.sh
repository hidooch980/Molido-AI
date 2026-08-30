#!/usr/bin/env bash
#
# فروش کالابرگی — اعتبار دولتی خانوار.
#
# چرا این آزمون لازم است: کالابرگ **پول دولت** است، نه تخفیف فروشگاه.
# اشتباه اینجا دو شکل دارد و هر دو گران‌اند:
#
#   • بیش از موجودی برداشت شود → فروشگاه پولی را ادعا می‌کند که
#     دریافت نمی‌کند.
#   • کالای نامشمول از اعتبار کم شود → در تسویه با دولت رد می‌شود و
#     مبلغش گردن فروشگاه می‌ماند.
#
# هیچ‌کدام در لحظه دیده نمی‌شوند؛ هر دو در تسویهٔ ماه بعد معلوم می‌شوند.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
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

# پاک‌سازیِ مشترک — پیش از این، هر اجرا دو فاکتور و چهار سند جا می‌گذاشت.
. "$(dirname "$0")/lib/reset.sh"
reset_begin
trap reset_finish EXIT

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ⚠️ ماژول کالابرگ الکترونیکی در این محصول هست؟
#
#    `RationModule` فقط در قابلیتِ `ration` است و نمایهٔ رستوران آن را ندارد،
#    پس این مسیرها عمداً ۴۰۴ می‌دهند.  بدونِ این بررسی، اجرای رستوران
#    ۱۹ شکست می‌داد که هیچ‌کدام عیب نبودند.
#
#    `restaurant.sh` قرینهٔ همین بررسی را برای نمایهٔ فروشگاه دارد.
if [ "$(curl -s -o /dev/null -w '%{http_code}' "$A/ration/accounts" -H "$AU")" = "404" ]; then
  echo "  ماژول کالابرگ الکترونیکی در این محصول فعال نیست"
  echo "  برای آزمون: MOLIDO_PRODUCT=store یا suite"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

psql()  { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# ⚠️ کد ملیِ **معتبر** لازم است، نه هر ده رقمی.
#
#    از وقتی ساختِ حسابِ کالابرگ رقمِ کنترلی را می‌سنجد (شاهکار)،
#    `1234567890` رد می‌شود.  همان فیکسچرِ قدیمی یازده سنجه را قرمز
#    کرد — و هیچ‌کدام دربارهٔ کالابرگ نبودند.
#
#    عددِ زیر ساختگی است ولی رقمِ کنترلی‌اش درست است.
NC="0499370899"

# ⚠️ ساختِ حسابِ کالابرگ حالا شاهکار را صدا می‌زند (وقتی تلفن داده شود).
#
#    سیاستِ پیش‌فرض `block` است: سرویسِ در دسترس نبودن ⇒ ثبت‌نام رد
#    می‌شود.  این عمدی و درست است، ولی یعنی این آزمون بدونِ سامانهٔ
#    ساختگی یازده سنجهٔ قرمز می‌دهد که هیچ‌کدام دربارهٔ کالابرگ نیستند.
#
#    نکتهٔ ظریف: ساختِ **دوم** (سنجهٔ کد تکراری) تلفن ندارد، پس رد
#    نمی‌شد و ردیفی می‌ساخت که اجرای بعدی را هم خراب می‌کرد.
. "$(dirname "$0")/lib/fake-server.sh"
fake_up shahkar || true

# ⚠️ هر دو در **یک** تله.
#
#    bash فقط یک تلهٔ EXIT دارد؛ `trap fake_down EXIT` جداگانه،
#    `reset_finish` را بی‌صدا پاک می‌کرد و پاک‌سازیِ مشترک دیگر اجرا
#    نمی‌شد — یعنی رفعِ یک اشکال، اشکالِ بزرگ‌تری می‌ساخت.
trap 'reset_finish; fake_down' EXIT
WH=$(curl -s $A/warehouses -H "$AU" | P "d[0]['id'] if isinstance(d,list) else d['data'][0]['id']")

# پاک‌سازی اجرای قبلی — از فرزند به والد، وگرنه کلید خارجی کل دسته را
# لغو می‌کند و آزمون با دادهٔ کهنه می‌دود.
psql "DELETE FROM \"RationTransaction\" WHERE \"accountId\" IN
        (SELECT id FROM \"RationAccount\" WHERE \"nationalCode\" = '$NC');
      DELETE FROM \"RationAccount\" WHERE \"nationalCode\" = '$NC';
      DELETE FROM \"Product\" WHERE sku IN ('RATION-YES', 'RATION-NO');"

# کالای مشمول با قیمت مصوب پایین‌تر از قیمت فروش
ELIG=$(curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"Ration Rice","sku":"RATION-YES","unit":"kg",
  "salePrice":1000000,"purchasePrice":700000,
  "isRationEligible":true,"rationPrice":600000}' | P "d.get('id','')")

# کالای نامشمول
PLAIN=$(curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"Ration Soda","sku":"RATION-NO","unit":"pcs",
  "salePrice":200000,"purchasePrice":120000}' | P "d.get('id','')")

psql "UPDATE \"Product\" SET \"trackInventory\" = false WHERE id IN ('$ELIG','$PLAIN');"

echo '--- 1) ساخت حساب کالابرگ ---'
ACC=$(curl -s -X POST $A/ration/accounts -H "$AU" -H "$JS" -d "{
  \"nationalCode\":\"$NC\",\"holderName\":\"Test Holder\",
  \"phone\":\"09121234567\",\"householdSize\":4}")
AID=$(echo "$ACC" | P "d.get('id','')")
chk "حساب ساخته شد" "$([ -n "$AID" ] && echo yes || echo no)" "yes"
chk "موجودی اولیه صفر" "$(echo "$ACC" | P "int(float(d.get('balance',0)))")" "0"

echo '--- 2) کد ملی تکراری رد می‌شود ---'
# یک خانوار یک حساب.  دو حساب یعنی دو برابر اعتبار برای همان خانوار.
# ۴۰۹ Conflict، نه ۴۰۰: درخواست بدشکل نیست، با وضعیت موجود تضاد دارد.
chk "کد ملی تکراری" "$(curl -s -X POST $A/ration/accounts -H "$AU" -H "$JS" -d "{
  \"nationalCode\":\"$NC\",\"holderName\":\"Duplicate\",\"householdSize\":2}" \
  | P "d.get('statusCode')")" "409"

echo '--- 3) شارژ اعتبار دوره ---'
curl -s -X POST "$A/ration/accounts/$AID/allocate" -H "$AU" -H "$JS" \
  -d '{"amount":5000000,"periodCode":"1404-05"}' >/dev/null
chk "موجودی پس از شارژ" \
  "$(psqlv "SELECT balance::bigint FROM \"RationAccount\" WHERE id='$AID'")" "5000000"

echo '--- 4) جست‌وجو با کد ملی ---'
# صندوق‌دار کد ملی را می‌پرسد، نه شناسهٔ داخلی.
chk "یافتن با کد ملی" "$(curl -s "$A/ration/accounts/by-national-code/$NC" -H "$AU" \
  | P "d.get('id')")" "$AID"

echo '--- 5) محاسبهٔ سهم کالابرگ ---'
# قیمت مصوب (۶۰۰هزار) ملاک است، نه قیمت فروش (۱میلیون).  اگر قیمت
# فروش حساب شود، فروشگاه بیش از سهم واقعی از دولت طلب می‌کند.
EL=$(curl -s -X POST $A/ration/eligibility -H "$AU" -H "$JS" -d "{
  \"items\":[{\"productId\":\"$ELIG\",\"quantity\":2},
              {\"productId\":\"$PLAIN\",\"quantity\":3}]}")
chk "سهم از قیمت مصوب"  "$(echo "$EL" | P "int(float(d['eligibleTotal']))")" "1200000"
chk "کالای نامشمول جدا"  "$(echo "$EL" | P "'$PLAIN' in d['excludedProductIds']")" "True"
chk "فقط یک ردیف مشمول" "$(echo "$EL" | P "len(d['lines'])")" "1"

echo '--- 6) فروش با کالابرگ ---'
SALE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",\"rationAccountId\":\"$AID\",
  \"items\":[{\"productId\":\"$ELIG\",\"quantity\":2},
             {\"productId\":\"$PLAIN\",\"quantity\":3}]}")
SID=$(echo "$SALE" | P "d.get('id','')")
chk "فاکتور ثبت شد" "$([ -n "$SID" ] && echo yes || echo no)" "yes"
# ۲×۱٬۰۰۰٬۰۰۰ + ۳×۲۰۰٬۰۰۰ = ۲٬۶۰۰٬۰۰۰
chk "مبلغ کل فاکتور" "$(echo "$SALE" | P "int(float(d['total']))")" "2600000"
chk "سهم کالابرگ ثبت شد" "$(echo "$SALE" | P "int(float(d.get('rationAmount',0)))")" "1200000"

echo '--- 7) اعتبار کم شد ---'
chk "موجودی پس از فروش" \
  "$(psqlv "SELECT balance::bigint FROM \"RationAccount\" WHERE id='$AID'")" "3800000"

echo '--- 8) تراکنش کالابرگ ثبت شد ---'
# بدون رد تراکنش، تسویه با دولت هیچ مستندی ندارد.
chk "تراکنش برداشت" \
  "$(psqlv "SELECT count(*) FROM \"RationTransaction\" WHERE \"saleId\"='$SID'")" "1"
chk "مبلغ تراکنش" \
  "$(psqlv "SELECT amount::bigint FROM \"RationTransaction\" WHERE \"saleId\"='$SID'")" "1200000"

echo '--- 9) برداشت بیش از موجودی ---'
# مهم‌ترین بند.  اگر رد نشود، فروشگاه پولی را از دولت طلب می‌کند که
# اعتبارش وجود ندارد — و در تسویه گردن خودش می‌ماند.
psql "UPDATE \"RationAccount\" SET balance = 100000 WHERE id='$AID';"
OVER=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",\"rationAccountId\":\"$AID\",
  \"items\":[{\"productId\":\"$ELIG\",\"quantity\":5}]}")
# یا رد می‌شود، یا فقط تا سقف موجودی برداشت می‌کند — هر دو درست‌اند،
# ولی نباید بیش از موجودی برداشته شود.
SPENT=$(echo "$OVER" | P "int(float(d.get('rationAmount', 0)))" 2>/dev/null || echo 0)
chk "برداشت از سقف موجودی بیشتر نشد" "$([ "${SPENT:-0}" -le 100000 ] && echo yes || echo no)" "yes"
chk "موجودی منفی نشد" \
  "$(psqlv "SELECT CASE WHEN balance >= 0 THEN 'yes' ELSE 'no' END FROM \"RationAccount\" WHERE id='$AID'")" "yes"

echo '--- 10) حساب غیرفعال ---'
psql "UPDATE \"RationAccount\" SET balance = 5000000, \"isActive\" = false WHERE id='$AID';"
INACT=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",\"rationAccountId\":\"$AID\",
  \"items\":[{\"productId\":\"$ELIG\",\"quantity\":1}]}")
SPENT2=$(echo "$INACT" | P "int(float(d.get('rationAmount', 0)))" 2>/dev/null || echo 0)
chk "از حساب غیرفعال برداشت نشد" "${SPENT2:-0}" "0"
psql "UPDATE \"RationAccount\" SET \"isActive\" = true WHERE id='$AID';"

echo '--- 11) فروش بدون کالابرگ دست‌نخورده می‌ماند ---'
BEFORE=$(psqlv "SELECT balance::bigint FROM \"RationAccount\" WHERE id='$AID'")
curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$ELIG\",\"quantity\":1}]}" >/dev/null
chk "اعتبار بدون ذکر حساب کم نشد" \
  "$(psqlv "SELECT balance::bigint FROM \"RationAccount\" WHERE id='$AID'")" "$BEFORE"

echo '--- 12) سبد فقط نامشمول ---'
chk "سهم صفر است" "$(curl -s -X POST $A/ration/eligibility -H "$AU" -H "$JS" -d "{
  \"items\":[{\"productId\":\"$PLAIN\",\"quantity\":10}]}" \
  | P "int(float(d['eligibleTotal']))")" "0"

echo '--- 13) سبد خالی ---'
chk "سبد خالی خطا نمی‌دهد" "$(curl -s -X POST $A/ration/eligibility -H "$AU" -H "$JS" \
  -d '{"items":[]}' | P "int(float(d['eligibleTotal']))")" "0"

echo '--- 14) گزارش تسویه با دولت ---'
chk "گزارش تسویه باز است" "$(curl -s -o /dev/null -w '%{http_code}' \
  "$A/ration/settlement" -H "$AU")" "200"

echo '--- 15) کد ملی نامعتبر ---'
chk "کد ملی کوتاه رد می‌شود" "$(curl -s -X POST $A/ration/accounts -H "$AU" -H "$JS" \
  -d '{"nationalCode":"123","holderName":"Short","householdSize":1}' \
  | P "d.get('statusCode')")" "400"

echo '--- 16) بدون توکن بسته است ---'
chk "فهرست حساب‌ها بدون توکن" "$(curl -s -o /dev/null -w '%{http_code}' $A/ration/accounts)" "401"

# پاک‌سازی
psql "DELETE FROM \"RationTransaction\" WHERE \"accountId\" = '$AID';
      DELETE FROM \"RationAccount\" WHERE id = '$AID';"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
