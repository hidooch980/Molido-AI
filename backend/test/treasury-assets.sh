#!/usr/bin/env bash
#
# خزانه و دارایی ثابت — دو شکافِ بی‌آزمونِ ERP.
#
# ⚠️ چیزی که اینجا سنجیده می‌شود «آیا API پاسخ می‌دهد» نیست.
#
#    هر دو ماژول ماه‌ها پاسخ می‌دادند.  چیزی که هیچ‌کس نمی‌سنجید،
#    **نگهداریِ عدد** بود: انتقال بین دو حساب نباید پول خلق کند یا
#    نابود کند، و استهلاک نباید دو بار برای یک ماه ثبت شود.
#
#    این‌ها اشکال‌هایی‌اند که سامانه سبز گزارش می‌دهد و حسابدار سه ماه
#    بعد کشفشان می‌کند.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }
TOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"; }
JID() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id','') if isinstance(d,dict) else '')"; }

# ⚠️ ۴۲۹ شکست نیست؛ «هنوز نه» است.  آزمونی که با سقفِ نرخ قرمز شود،
#    دربارهٔ خزانه هیچ نمی‌گوید و فقط وقت می‌گیرد.
_C=''; _R=''
req() {
  local raw
  for _ in $(seq 1 12); do
    raw=$(curl -s -w ' %{http_code}' "$@")
    _C=${raw##* }; _R=${raw% *}
    [ "$_C" = "429" ] || return 0
    sleep 8
  done
  return 0
}
code() { req "$@"; printf '%s' "$_C"; }
login() {
  req -X POST "$A/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
  printf '%s' "$_R" | TOK
}

JS="Content-Type: application/json"
T=${MOLIDO_TOKEN:-}
if [ -z "$T" ]; then T=$(login 'admin@molido.ai' "$PW"); fi
if [ -z "$T" ]; then echo "  ✗ ورود مدیر ناموفق"; exit 1; fi
AU="Authorization: Bearer $T"

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

cleanup() {
  Q "DELETE FROM \"TreasuryTransaction\" WHERE description LIKE 'TAPROBE%';" >/dev/null
  Q "DELETE FROM \"TreasuryAccount\" WHERE name LIKE 'TAProbe%';" >/dev/null
  Q "DELETE FROM \"AssetDepreciation\" WHERE \"assetId\" IN (SELECT id FROM \"Asset\" WHERE name LIKE 'TAProbe%');" >/dev/null
  Q "DELETE FROM \"Asset\" WHERE name LIKE 'TAProbe%';" >/dev/null
  # ⚠️ سندهای روزنامه هم باید بروند، وگرنه اجرای بعدی روی قیدِ یکتای
  #    (companyId, sourceType, sourceId) می‌خورد و ۴۰۹ می‌گیرد —
  #    شکستی که ربطی به کدِ امروز ندارد و فقط زبالهٔ اجرای قبلی است.
  Q "DELETE FROM \"JournalLine\" WHERE \"entryId\" IN (SELECT id FROM \"JournalEntry\" WHERE \"sourceType\"='AssetDepreciation' AND \"sourceId\" LIKE '2026-0%');" >/dev/null
  Q "DELETE FROM \"JournalEntry\" WHERE \"sourceType\"='AssetDepreciation' AND \"sourceId\" LIKE '2026-0%';" >/dev/null
}
cleanup
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════ خزانه

# ⚠️ میدانِ ساخت `openingBalance` است، نه `balance`.
#
#    نسخهٔ اول این آزمون `balance` می‌فرستاد و ۴۰۰ می‌گرفت:
#    «property balance should not exist».  و آن **درست** بود —
#    مانده از تراکنش‌ها مشتق می‌شود، نه مستقیم نوشته.  اگر
#    مستقیم نوشتنی بود، دفتر و مانده می‌توانستند از هم جدا بیفتند.
#
#    آزمونی که این را نمی‌دانست، رفتارِ درست را شکست گزارش کرد.
echo '--- ۱) ساخت دو حساب خزانه ---'
req -X POST "$A/treasury/accounts" -H "$AU" -H "$JS" \
  -d '{"name":"TAProbe Source","type":"BANK","openingBalance":1000000}'
SRC=$(printf '%s' "$_R" | JID)
req -X POST "$A/treasury/accounts" -H "$AU" -H "$JS" \
  -d '{"name":"TAProbe Dest","type":"CASH","openingBalance":0}'
DST=$(printf '%s' "$_R" | JID)
chk "حساب مبدأ ساخته شد" "$([ -n "$SRC" ] && echo yes || echo no)" "yes"
chk "حساب مقصد ساخته شد" "$([ -n "$DST" ] && echo yes || echo no)" "yes"

echo '--- ۲) انتقال، مجموع را دست‌نخورده نگه می‌دارد ---'
#
# ⚠️ مهم‌ترین سنجهٔ خزانه.
#
#    انتقال دو UPDATE جدا است — یکی کم می‌کند، یکی زیاد.  اگر بین این
#    دو چیزی بشکند و تراکنش برنگردد، پول **ناپدید می‌شود**.  و هیچ
#    صفحه‌ای این را نشان نمی‌دهد، چون هر حساب جداگانه درست به نظر
#    می‌رسد؛ فقط جمعِ کل غلط است.
BEFORE=$(Q "SELECT COALESCE(SUM(balance),0) FROM \"TreasuryAccount\" WHERE name LIKE 'TAProbe%';")
chk "انتقال پذیرفته شد" \
  "$(code -X POST "$A/treasury/transfer" -H "$AU" -H "$JS" \
     -d "{\"fromAccountId\":\"$SRC\",\"toAccountId\":\"$DST\",\"amount\":250000,\"description\":\"TAPROBE transfer\"}")" "201"
AFTER=$(Q "SELECT COALESCE(SUM(balance),0) FROM \"TreasuryAccount\" WHERE name LIKE 'TAProbe%';")
chk "مجموع پیش و پس یکی است" "$AFTER" "$BEFORE"
chk "مبدأ کم شد" "$(Q "SELECT balance FROM \"TreasuryAccount\" WHERE id='$SRC';")" "750000.00"
chk "مقصد زیاد شد" "$(Q "SELECT balance FROM \"TreasuryAccount\" WHERE id='$DST';")" "250000.00"

echo '--- ۳) دو سند قرینه ثبت شد ---'
chk "TRANSFER_OUT ثبت شد" \
  "$(Q "SELECT count(*) FROM \"TreasuryTransaction\" WHERE \"accountId\"='$SRC' AND type='TRANSFER_OUT';")" "1"
chk "TRANSFER_IN ثبت شد" \
  "$(Q "SELECT count(*) FROM \"TreasuryTransaction\" WHERE \"accountId\"='$DST' AND type='TRANSFER_IN';")" "1"
# ⚠️ سند ورودی باید به سند خروجی ارجاع دهد، وگرنه جفت‌کردنشان در
#    گزارش ممکن نیست و انتقال از یک واریزِ بی‌منشأ قابل تشخیص نیست.
chk "سند ورودی به خروجی ارجاع دارد" \
  "$(Q "SELECT CASE WHEN reference IS NOT NULL THEN 'yes' ELSE 'no' END FROM \"TreasuryTransaction\" WHERE \"accountId\"='$DST' AND type='TRANSFER_IN';")" "yes"

echo '--- ۴) انتقالِ بیش از موجودی رد می‌شود ---'
# بدون این، مانده منفی می‌شود و خزانه معنایش را از دست می‌دهد.
chk "بیش از موجودی ۴۰۰" \
  "$(code -X POST "$A/treasury/transfer" -H "$AU" -H "$JS" \
     -d "{\"fromAccountId\":\"$SRC\",\"toAccountId\":\"$DST\",\"amount\":99999999,\"description\":\"TAPROBE over\"}")" "400"
chk "مانده پس از رد دست‌نخورده" "$(Q "SELECT balance FROM \"TreasuryAccount\" WHERE id='$SRC';")" "750000.00"

echo '--- ۵) انتقال به خودِ حساب رد می‌شود ---'
chk "مبدأ=مقصد ۴۰۰" \
  "$(code -X POST "$A/treasury/transfer" -H "$AU" -H "$JS" \
     -d "{\"fromAccountId\":\"$SRC\",\"toAccountId\":\"$SRC\",\"amount\":1000,\"description\":\"TAPROBE self\"}")" "400"

# ═══════════════════════════════════════════════════ دارایی ثابت

echo '--- ۶) ساخت دارایی بدون عمرِ مفید ---'
#
# ⚠️ ستون `usefulLifeYears` در پایگاه داده `NOT NULL DEFAULT 10` است،
#    ولی مسیر ساخت `dto.usefulLifeYears ?? null` می‌فرستد — یعنی
#    صریحاً NULL، که پیش‌فرضِ ستون را **خنثی** می‌کند.
#
#    NULL صریح با DEFAULT پر نمی‌شود؛ فقط **نبودِ** ستون در INSERT
#    پیش‌فرض را فعال می‌کند.  یک تلهٔ کلاسیکِ SQL.
chk "بدون عمر مفید ۲۰۱" \
  "$(code -X POST "$A/assets" -H "$AU" -H "$JS" \
     -d '{"name":"TAProbe NoLife","purchasePrice":1200000}')" "201"

# ⚠️ دوره باید داخل یک **سال مالیِ باز** باشد.
#
#    نسخهٔ اول ۲۰۲۴ را می‌آزمود و ۴۰۰ می‌گرفت: «برای تاریخ ... سال
#    مالی تعریف نشده است».  باز هم رفتارِ درست: ثبتِ استهلاک در
#    سالی که بسته یا تعریف‌نشده است، دفتر را خراب می‌کند.
#
#    تنها سال مالیِ باز ۲۰۲۶ است.
echo '--- ۷) استهلاک خط مستقیم ---'
req -X POST "$A/assets" -H "$AU" -H "$JS" \
  -d '{"name":"TAProbe Machine","purchasePrice":1200000,"salvageValue":0,"usefulLifeYears":10,"depreciationMethod":"STRAIGHT_LINE","inServiceDate":"2026-01-01"}'
AID=$(printf '%s' "$_R" | JID)
chk "دارایی ساخته شد" "$([ -n "$AID" ] && echo yes || echo no)" "yes"
# ⚠️ وضعیت باید ACTIVE باشد، نه IN_USE.
#
#    پیش‌فرضِ ستون `'IN_USE'` است ولی استهلاک فقط `status='ACTIVE'` را
#    برمی‌دارد.  مسیرِ ساخت صریحاً ACTIVE می‌گذارد، ولی هر ردیفی که از
#    راه دیگری وارد شود (seed، مهاجرت، درج دستی) **هرگز مستهلک
#    نمی‌شود** و هیچ خطایی هم نمی‌دهد.
chk "وضعیت ACTIVE است" "$(Q "SELECT status FROM \"Asset\" WHERE id='$AID';")" "ACTIVE"

# ۱۲۰۰۰۰۰ ÷ ۱۰ سال ÷ ۱۲ ماه = ۱۰۰۰۰ در ماه
chk "اجرای استهلاک ۲۰۱" \
  "$(code -X POST "$A/assets/depreciation/run" -H "$AU" -H "$JS" -d '{"period":"2026-03-01"}')" "201"
chk "مبلغ ماهانه درست" \
  "$(Q "SELECT amount FROM \"AssetDepreciation\" WHERE \"assetId\"='$AID' AND period='2026-03-01';")" "10000.00"

echo '--- ۸) اجرای دوباره برای همان ماه، دو بار ثبت نمی‌کند ---'
#
# ⚠️ این از هر سنجهٔ دیگری در این فایل مهم‌تر است.
#
#    اجرای دوبارهٔ استهلاک اتفاقِ عادی است: کاربر دکمه را دو بار
#    می‌زند، یا کارِ زمان‌بندی‌شده دو بار اجرا می‌شود.  اگر دوبار ثبت
#    شود، ماندهٔ دفتری غلط می‌شود و کسی تا پایان سال متوجه نمی‌شود.
BEFORE_ACC=$(Q "SELECT \"accumulatedDepreciation\" FROM \"Asset\" WHERE id='$AID';")
code -X POST "$A/assets/depreciation/run" -H "$AU" -H "$JS" -d '{"period":"2026-03-01"}' >/dev/null
chk "فقط یک ردیف برای آن ماه" \
  "$(Q "SELECT count(*) FROM \"AssetDepreciation\" WHERE \"assetId\"='$AID' AND period='2026-03-01';")" "1"
chk "ماندهٔ انباشته دست‌نخورد" \
  "$(Q "SELECT \"accumulatedDepreciation\" FROM \"Asset\" WHERE id='$AID';")" "$BEFORE_ACC"

echo '--- ۹) داراییِ تازه پس از اجرای دوره، سندِ مکمل می‌گیرد ---'
#
# ⚠️ این سنجه یک اشکالِ واقعی را گرفت — و فقط در اجرای کامل دیده شد،
#    نه وقتی مجموعه به‌تنهایی اجرا می‌شد.
#
#    `JournalEntry_source_key` روی (companyId, sourceType, sourceId)
#    یکتاست و استهلاک `sourceId = periodDate` می‌گذاشت.  یعنی هر دوره
#    فقط **یک بار در کلِ عمر** قابل ثبت بود:
#
#      استهلاک ۲۰۲۶-۰۳ اجرا شد          → سند ثبت شد
#      داراییِ تازه‌ای وارد شد
#      استهلاک ۲۰۲۶-۰۳ دوباره اجرا شد   → ۴۰۹
#
#    و چون کل تراکنش برمی‌گشت، ردیفِ استهلاکِ داراییِ تازه هم پاک
#    می‌شد — یعنی آن دارایی **هرگز** مستهلک نمی‌شد، بی‌هیچ نشانه‌ای.
#
#    خریدِ دارایی وسطِ ماه اتفاقِ عادیِ هر کسب‌وکاری است.
req -X POST "$A/assets" -H "$AU" -H "$JS"   -d '{"name":"TAProbe Late","purchasePrice":600000,"salvageValue":0,"usefulLifeYears":5,"depreciationMethod":"STRAIGHT_LINE","inServiceDate":"2026-01-01"}'
LID=$(printf '%s' "$_R" | JID)
chk "داراییِ تازه ساخته شد" "$([ -n "$LID" ] && echo yes || echo no)" "yes"
chk "اجرای دوبارهٔ همان دوره ۲۰۱"   "$(code -X POST "$A/assets/depreciation/run" -H "$AU" -H "$JS" -d '{"period":"2026-03-01"}')" "201"
# ۶۰۰۰۰۰ ÷ ۵ سال ÷ ۱۲ ماه = ۱۰۰۰۰ در ماه
chk "داراییِ تازه مستهلک شد"   "$(Q "SELECT amount FROM \"AssetDepreciation\" WHERE \"assetId\"='$LID' AND period='2026-03-01';")" "10000.00"
# ⚠️ داراییِ قدیمی نباید **دوباره** مستهلک شود.
chk "داراییِ قدیمی هنوز یک ردیف دارد"   "$(Q "SELECT count(*) FROM \"AssetDepreciation\" WHERE \"assetId\"='$AID' AND period='2026-03-01';")" "1"

echo '--- ۱۰) دارایی پیش از بهره‌برداری مستهلک نمی‌شود ---'
req -X POST "$A/assets" -H "$AU" -H "$JS" \
  -d '{"name":"TAProbe Future","purchasePrice":600000,"usefulLifeYears":5,"depreciationMethod":"STRAIGHT_LINE","inServiceDate":"2030-01-01"}'
FID=$(printf '%s' "$_R" | JID)
code -X POST "$A/assets/depreciation/run" -H "$AU" -H "$JS" -d '{"period":"2026-04-01"}' >/dev/null
chk "دارایی آینده مستهلک نشد" \
  "$(Q "SELECT count(*) FROM \"AssetDepreciation\" WHERE \"assetId\"='$FID';")" "0"

echo '--- ۱۱) واگذاری ---'
chk "واگذاری با عایدی ۲۰۱" \
  "$(code -X POST "$A/assets/$AID/dispose" -H "$AU" -H "$JS" -d '{"proceeds":900000}')" "201"
chk "وضعیت SOLD شد" "$(Q "SELECT status FROM \"Asset\" WHERE id='$AID';")" "SOLD"
# ⚠️ واگذاریِ دوباره باید رد شود، وگرنه یک دارایی دو بار فروخته می‌شود.
chk "واگذاری دوباره ۴۰۰" \
  "$(code -X POST "$A/assets/$AID/dispose" -H "$AU" -H "$JS" -d '{"proceeds":100000}')" "400"

echo '--- ۱۲) داراییِ واگذارشده دیگر مستهلک نمی‌شود ---'
BEFORE_D=$(Q "SELECT count(*) FROM \"AssetDepreciation\" WHERE \"assetId\"='$AID';")
code -X POST "$A/assets/depreciation/run" -H "$AU" -H "$JS" -d '{"period":"2026-05-01"}' >/dev/null
chk "بدون ردیف تازه" \
  "$(Q "SELECT count(*) FROM \"AssetDepreciation\" WHERE \"assetId\"='$AID';")" "$BEFORE_D"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
