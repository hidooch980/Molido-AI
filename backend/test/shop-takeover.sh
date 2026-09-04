#!/usr/bin/env bash
#
# تصاحبِ حسابِ مشتریِ حضوری — که تا امروز فقط با دانستنِ شماره ممکن بود.
#
# ⚠️ این مجموعه از یک آسیب‌پذیریِ **تأییدشده** آمد، نه از احتیاط.
#
#    ثبت‌نام در فروشگاه، رکوردِ مشتریِ حضوری را که صندوق‌دار ساخته بود
#    «تصاحب» می‌کرد تا تاریخچهٔ خرید یکی بماند.  نیت درست بود، ولی
#    هیچ اثباتی نمی‌خواست که ثبت‌نام‌کننده صاحبِ آن شماره است.
#
#    آزمونِ زنده: مهاجم فقط شمارهٔ «۰۹۱۲۵۵۵۷۷۷۷» را می‌دانست، ثبت‌نام
#    کرد، و توکنِ حسابِ «مریم کریمی» را گرفت — با ۲۰۰ روی
#    `/shop/my-orders` او.
#
#    شمارهٔ موبایل راز نیست: روی رسید نوشته می‌شود، در دفترچه هست، و
#    الگویش (۰۹XXXXXXXXX) شمردنی است.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند و خطای کاذب می‌سازد.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    print('<<غیر-JSON>>'); sys.exit(0)
print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ⚠️ `request-code` سقفِ **۳ در دقیقه** دارد و این آزمون دقیقاً سه بار
#    صدایش می‌زند — یعنی هیچ حاشیه‌ای ندارد.
#
#    اجرای دوباره در همان دقیقه، یا هر فراخوانیِ دستی پیش از آزمون،
#    یکی از سهمیه‌ها را می‌خورد و سنجه‌ها با ۴۲۹ می‌افتند — با پیامی
#    که شبیه اشکالِ کد به نظر می‌رسد.
#
#    راهِ درست پایین آوردنِ سقف نیست (آن سقف عمدی است: هر درخواست یک
#    پیامک می‌فرستد).  راهش این است که آزمون با پنجرهٔ **تازه** شروع
#    کند.
wait_for_quota() {
  local waited=0
  while [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shop/register/request-code" \
             -H 'Content-Type: application/json' -d '{"phone":"09120000009"}')" = "429" ]; do
    [ "$waited" -ge 90 ] && { echo "  ! سقف باز نشد؛ آزمون ادامه می‌دهد"; return; }
    sleep 5
    waited=$((waited + 5))
  done
  # آخرین فراخوانیِ موفقِ بالا خودش یک سهمیه خورد؛ پس تا پنجرهٔ بعدی
  # صبر می‌کنیم تا آزمون با هر سه سهمیه شروع شود.
  sleep 61
}
wait_for_quota

VICTIM=09125557777
FRESH=09126668888
GHOST=09999999999
CO=$(Q "SELECT id FROM \"Company\" LIMIT 1;")

cleanup() {
  Q "DELETE FROM \"PhoneVerification\" WHERE phone IN ('$VICTIM','$FRESH','$GHOST');" >/dev/null
  Q "DELETE FROM \"Customer\" WHERE phone IN ('$VICTIM','$FRESH','$GHOST');" >/dev/null
}
cleanup
trap cleanup EXIT

# صندوق‌دار مشتریِ حضوری ثبت می‌کند — بدون رمز، چون آنلاین نیامده.
Q "INSERT INTO \"Customer\" (id,\"companyId\",\"firstName\",\"lastName\",phone,\"createdAt\",\"updatedAt\")
   VALUES ('takeover-victim','$CO','Walkin','Victim','$VICTIM',now(),now());" >/dev/null
chk "مشتری حضوری بی‌رمز ساخته شد" \
  "$(Q "SELECT count(*) FROM \"Customer\" WHERE id='takeover-victim' AND \"passwordHash\" IS NULL;")" "1"

# ⚠️ درخواستِ کد **بی‌صدا** شکست می‌خورد و شکستش را به گردنِ سنجه‌های
#    بعدی می‌اندازد.
#
#    نسخهٔ اول با `-o /dev/null` می‌فرستاد.  در انتهای یک اجرای کامل
#    ۴۲۹ می‌گرفت، کدی ساخته نمی‌شد، و پنج سنجهٔ بعدی می‌افتادند —
#    سنجه‌هایی دربارهٔ شمارندهٔ تلاش و نشتِ اطلاعات که هیچ‌کدام خراب
#    نبودند.  ساعت‌ها می‌شد دنبالِ اشکالی گشت که وجود نداشت.
#
#    حالا صبر می‌کند، و اگر باز هم نشد **خودش** را شکست اعلام می‌کند.
ask_code() {
  _hdr=$(mktemp); _i=0
  while [ $_i -lt 6 ]; do
    _i=$((_i + 1))
    _body=$(curl -s -D "$_hdr" -X POST "$A/shop/register/request-code"       -H 'Content-Type: application/json' -d "{\"phone\":\"$1\"}")
    _code=$(head -1 "$_hdr" | tr -dc '0-9' | tail -c 3)
    [ "$_code" != "429" ] && break
    # `Retry-After` را خودِ سرور می‌گوید؛ حدس زدنش یا کند است یا بی‌فایده.
    _w=$(grep -i '^retry-after' "$_hdr" 2>/dev/null | tr -dc '0-9' | head -c 3)
    sleep "${_w:-6}"
  done
  rm -f "$_hdr"
  if [ "$_code" = "429" ]; then
    chk "درخواستِ کد برای $1 پذیرفته شد" "سقفِ نرخ (۴۲۹)" "پذیرفته"
  fi
  printf '%s' "$_body"
}

echo '--- ۱) حملهٔ اصلی: تصاحب بدون کد ---'
R=$(curl -s -X POST "$A/shop/register" -H 'Content-Type: application/json' \
   -d "{\"phone\":\"$VICTIM\",\"password\":\"Attacker#999\",\"firstName\":\"Attacker\"}")
chk "توکن نمی‌دهد" "$(echo "$R" | P "'yes' if d.get('token') else 'no'")" "no"
# مهم‌تر از پاسخ: رکورد نباید دست بخورد.  اگر رمز بنشیند، مشتریِ واقعی
# هم دیگر نمی‌تواند ثبت‌نام کند — یعنی حمله نیمه‌موفق شده.
chk "رکورد قربانی بی‌رمز ماند" \
  "$(Q "SELECT count(*) FROM \"Customer\" WHERE id='takeover-victim' AND \"passwordHash\" IS NULL;")" "1"

echo '--- ۲) کدِ غلط رد می‌شود و شمرده می‌شود ---'
ask_code "$VICTIM" >/dev/null
R=$(curl -s -X POST "$A/shop/register" -H 'Content-Type: application/json' \
   -d "{\"phone\":\"$VICTIM\",\"password\":\"Attacker#999\",\"firstName\":\"Attacker\",\"code\":\"000000\"}")
chk "کد غلط توکن نمی‌دهد" "$(echo "$R" | P "'yes' if d.get('token') else 'no'")" "no"
# بدون شمارنده، کدِ شش‌رقمی با چند هزار درخواست حدس زدنی است.
chk "شمارندهٔ تلاش بالا رفت" \
  "$(Q "SELECT COALESCE(max(attempts),0) FROM \"PhoneVerification\" WHERE phone='$VICTIM';")" "1"

echo '--- ۳) کدِ درست می‌پذیرد و نامِ اصلی را نگه می‌دارد ---'
# ⚠️ لنگرِ استخراج **شمارهٔ تلفن** است، نه متنِ پیام.
#
#    نسخهٔ اول `grep -oE '[0-9]{6}'` روی کلِ لاگ بود.  در اجرای تنها
#    کار می‌کرد، ولی در اجرای کاملِ مجموعه لاگ پر از عددِ شش‌رقمی است
#    — شناسه، مبلغ، زمان — و آخرینشان کدِ ما نبود.
#
#    تلاش دوم متنِ فارسیِ پیام را لنگر کرد و **بدتر شد**: `grep` با
#    الگوی فارسی روی خروجیِ `docker logs` در این پوسته نمی‌خواند، و
#    سه سنجهٔ دیگر هم افتاد.
#
#    شمارهٔ تلفن ASCII است، در همان خط می‌آید، و مختصِ همین آزمون است.
# ⚠️ نامِ کانتینر سیم‌کشی نمی‌شود.
#
#    پیش‌تر molido-store-backend-1 نوشته شده بود.  در نمایهٔ suite
#    کانتینر molido-suite-backend-1 نام دارد، پس docker logs خالی
#    برمی‌گشت، CODE تهی می‌ماند و دو سنجه می‌افتاد — با پیامی
#    («کد درست توکن می‌دهد got=no») که شبیه رخنهٔ امنیتی به نظر
#    می‌رسید و هیچ ربطی به آن نداشت.
#
#    $C همان چیزی است که بقیهٔ فایل با آن به پایگاه‌داده می‌زند، پس
#    همیشه به همان پشتهٔ در حال آزمون اشاره می‌کند.
BE=$($C ps -q backend 2>/dev/null | tr -d '\r' | head -1)
[ -z "$BE" ] && echo "  ⚠️ کانتینر backend پیدا نشد؛ کدِ تأیید خوانده نشد"
CODE=$([ -n "$BE" ] && docker logs "$BE" --tail 200 2>&1 \
       | grep "$VICTIM" | grep -oE '[0-9]{6}[^0-9]*$' | grep -oE '[0-9]{6}' | tail -1)
if [ -n "$CODE" ]; then
  R=$(curl -s -X POST "$A/shop/register" -H 'Content-Type: application/json' \
     -d "{\"phone\":\"$VICTIM\",\"password\":\"Real#12345\",\"firstName\":\"Impostor\",\"code\":\"$CODE\"}")
  chk "کد درست توکن می‌دهد" "$(echo "$R" | P "'yes' if d.get('token') else 'no'")" "yes"
  # ⚠️ نامِ رکوردِ موجود عوض نمی‌شود.
  #    وگرنه هر کسی که کد را می‌گیرد می‌تواند نامِ مشتری را در دفترِ
  #    فروشگاه بازنویسی کند — و فاکتورهای قبلی به نامِ غریبه می‌افتند.
  chk "نامِ اصلی حفظ شد" \
    "$(Q "SELECT \"firstName\" FROM \"Customer\" WHERE id='takeover-victim';")" "Walkin"
  chk "کد مصرف شد" \
    "$(Q "SELECT count(*) FROM \"PhoneVerification\" WHERE phone='$VICTIM' AND \"consumedAt\" IS NOT NULL;")" "1"
else
  echo "  —    کد از لاگ خوانده نشد؛ سه سنجه رد شد"
fi

echo '--- ۴) شمارهٔ تازه کد نمی‌خواهد ---'
# اصطکاکِ بی‌دلیل ثبت‌نام را می‌شکند، و آنجا چیزی برای تصاحب نیست.
R=$(curl -s -X POST "$A/shop/register" -H 'Content-Type: application/json' \
   -d "{\"phone\":\"$FRESH\",\"password\":\"Newbie#999\",\"firstName\":\"Newbie\"}")
chk "شمارهٔ تازه توکن می‌گیرد" "$(echo "$R" | P "'yes' if d.get('token') else 'no'")" "yes"

echo '--- ۵) درخواستِ کد، وجودِ شماره را لو نمی‌دهد ---'
# وگرنه همین مسیر می‌شود ابزارِ شمردنِ مشتری‌ها.
K=$(ask_code "$VICTIM")
G=$(ask_code "$GHOST")
chk "پاسخ برای هر دو یکسان" "$([ "$K" = "$G" ] && echo same || echo different)" "same"
# و برای شمارهٔ بی‌سابقه اصلاً کدی ساخته نمی‌شود — نه پیامکی می‌رود،
# نه ردی در جدول می‌ماند که بعداً بشود از آن شمرد.
chk "کدِ بیهوده ذخیره نشد" "$(Q "SELECT count(*) FROM \"PhoneVerification\" WHERE phone='$GHOST';")" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
