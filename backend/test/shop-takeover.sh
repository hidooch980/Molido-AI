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

echo '--- ۱) حملهٔ اصلی: تصاحب بدون کد ---'
R=$(curl -s -X POST "$A/shop/register" -H 'Content-Type: application/json' \
   -d "{\"phone\":\"$VICTIM\",\"password\":\"Attacker#999\",\"firstName\":\"Attacker\"}")
chk "توکن نمی‌دهد" "$(echo "$R" | P "'yes' if d.get('token') else 'no'")" "no"
# مهم‌تر از پاسخ: رکورد نباید دست بخورد.  اگر رمز بنشیند، مشتریِ واقعی
# هم دیگر نمی‌تواند ثبت‌نام کند — یعنی حمله نیمه‌موفق شده.
chk "رکورد قربانی بی‌رمز ماند" \
  "$(Q "SELECT count(*) FROM \"Customer\" WHERE id='takeover-victim' AND \"passwordHash\" IS NULL;")" "1"

echo '--- ۲) کدِ غلط رد می‌شود و شمرده می‌شود ---'
curl -s -o /dev/null -X POST "$A/shop/register/request-code" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$VICTIM\"}"
R=$(curl -s -X POST "$A/shop/register" -H 'Content-Type: application/json' \
   -d "{\"phone\":\"$VICTIM\",\"password\":\"Attacker#999\",\"firstName\":\"Attacker\",\"code\":\"000000\"}")
chk "کد غلط توکن نمی‌دهد" "$(echo "$R" | P "'yes' if d.get('token') else 'no'")" "no"
# بدون شمارنده، کدِ شش‌رقمی با چند هزار درخواست حدس زدنی است.
chk "شمارندهٔ تلاش بالا رفت" \
  "$(Q "SELECT COALESCE(max(attempts),0) FROM \"PhoneVerification\" WHERE phone='$VICTIM';")" "1"

echo '--- ۳) کدِ درست می‌پذیرد و نامِ اصلی را نگه می‌دارد ---'
CODE=$(Q "SELECT 'x';" >/dev/null; docker logs molido-store-backend-1 --tail 60 2>&1 \
       | grep -oE '[0-9]{6}' | tail -1)
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
K=$(curl -s -X POST "$A/shop/register/request-code" -H 'Content-Type: application/json' -d "{\"phone\":\"$VICTIM\"}")
G=$(curl -s -X POST "$A/shop/register/request-code" -H 'Content-Type: application/json' -d "{\"phone\":\"$GHOST\"}")
chk "پاسخ برای هر دو یکسان" "$([ "$K" = "$G" ] && echo same || echo different)" "same"
# و برای شمارهٔ بی‌سابقه اصلاً کدی ساخته نمی‌شود — نه پیامکی می‌رود،
# نه ردی در جدول می‌ماند که بعداً بشود از آن شمرد.
chk "کدِ بیهوده ذخیره نشد" "$(Q "SELECT count(*) FROM \"PhoneVerification\" WHERE phone='$GHOST';")" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
