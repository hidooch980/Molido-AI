#!/usr/bin/env bash
#
# باطل شدنِ نشست — تغییر رمز و غیرفعال کردنِ کاربر.
#
# ⚠️ هر دو حفره با آزمونِ زنده تأیید شدند، نه از روی احتیاط.
#
#    نگهبانِ JWT فقط محتوای توکن را برمی‌گرداند و به پایگاه داده
#    نمی‌زد.  یعنی توکنِ امضاشده تا لحظهٔ انقضا معتبر بود، **هرچه هم
#    که بعدش اتفاق می‌افتاد**:
#
#      تغییر رمز      -> ورود با رمز قدیمی ۴۰۱، ولی توکنِ قدیمی ۲۰۰
#      غیرفعال کردن   -> ورود تازه ۴۰۱، ولی توکنِ موجود ۲۰۰
#
#    عمر توکن **۷ روز** است.  کارمندی که اخراج شده یا حسابی که لو
#    رفته، تا یک هفته دسترسی داشت — و مدیر فکر می‌کرد بسته است.
#
# ⚠️ چند بار اجرا می‌شود، نه یک بار.
#
#    اولین رفعِ من در اجرای اول «سبز» به نظر رسید و در دومی افتاد:
#    ارفاقِ یک‌ثانیه‌ای بین `iat` و `passwordChangedAt` گاهی پنجره باز
#    می‌گذاشت و گاهی نه — بسته به اینکه ورود و تغییر رمز در یک ثانیه
#    افتاده باشند یا دو.
#
#    اشکالِ زمان‌وابسته با یک اجرا دیده نمی‌شود.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
ROUNDS=${ROUNDS:-3}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }
TOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"; }

JS="Content-Type: application/json"

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

EMAIL=revoke.probe1@molido.ai

# ⚠️ پاک‌سازی با الگو، نه با یک ایمیل.
#
#    هر دور ایمیلِ خودش را دارد (پایین)، پس پاک‌سازیِ تک‌ایمیلی
#    حساب‌های دورهای قبلی را جا می‌گذاشت — و اجرای بعدی با
#    «ایمیل تکراری» می‌افتاد.
cleanup() { Q "DELETE FROM \"User\" WHERE email LIKE 'revoke.probe%@molido.ai';" >/dev/null; }
cleanup
trap cleanup EXIT

# ⚠️ ۴۲۹ **شکست نیست، «هنوز نه» است**.
#
#    سقفِ `/auth/login` ده در دقیقه است و این آزمون در هر دور سه بار
#    وارد می‌شود.  با ROUNDS=3 یعنی نُه ورود، به‌علاوهٔ ورودِ مدیر —
#    یعنی دقیقاً روی لبهٔ سقف.  هر آزمونی که پیش از این اجرا شده باشد
#    سهمیه را خورده و این یکی از سنجهٔ **اول** می‌افتد.
#
#    و بدترین بخشش این است که پیامِ شکست دروغ می‌گوید: «توکن کار
#    می‌کند (got=401)» می‌نویسد، در حالی که هیچ ربطی به توکن ندارد —
#    ورود اصلاً انجام نشده.  یک بار همین آبشار مرا واداشت دنبال
#    رگرسیونی بگردم که وجود نداشت.
#
#    درمانش تقسیمِ ایمیل نیست (سقف بر پایهٔ IP هم هست)؛ درمانش این
#    است که آزمون **منتظرِ باز شدنِ پنجره بماند**.  کندترش می‌کند،
#    ولی سنجه‌ای که به‌خاطر شلوغیِ همسایه می‌افتد بدتر از کند است.
_C=''; _R=''
req() {
  # ⚠️ جداکنندهٔ فاصله، نه خطِ تازه.
  #
  #    بدنهٔ JSON خودش فاصله دارد، ولی ${raw##* } از **آخرین** فاصله
  #    می‌برد — و آخرین فاصله همانی است که curl پیش از کد گذاشته.
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
  req -X POST "$A/auth/login" -H 'Content-Type: application/json'       -d "{\"email\":\"$1\",\"password\":\"$2\"}"
  printf '%s' "$_R" | TOK
}

# ⚠️ ورودِ مدیر **پس از** تعریفِ `login` می‌آید، عمداً.
#
#    جایش بالای فایل بود و با curl خام وارد می‌شد — یعنی خودِ ورودِ
#    مدیر اولین قربانیِ سقف می‌شد و آزمون با «ورود مدیر ناموفق»
#    می‌مرد، پیش از آنکه حتی یک سنجه اجرا شود.
T=${MOLIDO_TOKEN:-}
if [ -z "$T" ]; then T=$(login 'admin@molido.ai' "$PW"); fi
if [ -z "$T" ]; then echo "  ✗ ورود مدیر ناموفق"; exit 1; fi
AU="Authorization: Bearer $T"

for round in $(seq 1 "$ROUNDS"); do
  echo "═══ دور $round از $ROUNDS ═══"
  cleanup

  # ⚠️ ایمیلِ هر دور جدا — سقفِ ورود را تقسیم می‌کند.
  #
  #    سقفِ `/auth/login` ده در دقیقه است و هر دور سه بار وارد می‌شود.
  #    با ایمیلِ ثابت، دورِ چهارم به سقف می‌خورد و سنجه‌ها با پیامی
  #    می‌افتند که هیچ ربطی به باطل شدنِ نشست ندارد.
  #
  #    سقف بر پایهٔ IP هم هست، پس این کامل حلش نمی‌کند — ولی
  #    ROUNDS تا حدود سه را بی‌دردسر می‌کند.
  EMAIL="revoke.probe${round}@molido.ai"

  curl -s -X POST $A/users -H "$AU" -H "$JS" \
    -d "{\"firstName\":\"Revoke\",\"lastName\":\"Probe\",\"email\":\"$EMAIL\",\"password\":\"First#12345\",\"role\":\"MANAGER\"}" \
    >/dev/null

  V=$(login "$EMAIL" 'First#12345')
  chk "توکن گرفت" "$([ -n "$V" ] && echo yes || echo no)" "yes"
  chk "توکن کار می‌کند" "$(code $A/auth/me -H "Authorization: Bearer $V")" "200"

  echo '--- ۱) تغییر رمز، نشستِ قبلی را می‌کشد ---'
  # ⚠️ صبور: `/auth/change-password` سقفِ ده در دقیقه دارد و این حلقه
  #    تا سه بار (ROUNDS) صدایش می‌زند — به‌علاوهٔ هر چه `password.sh`
  #    بلافاصله پیش از آن مصرف کرده.
  #
  #    با curlِ خام، ۴۲۹ یعنی رمز اصلاً عوض نمی‌شد و بعد سنجهٔ «توکنِ
  #    پیش از تغییر باطل شد» ۲۰۰ می‌گرفت — یعنی گزارش می‌گفت حفرهٔ
  #    امنیتی باز است، در حالی که فقط سقف خورده بود.
  #
  #    آزمونی که سقفِ نرخ را با حفرهٔ امنیتی اشتباه بگیرد، بدترین
  #    نوعِ هشدارِ کاذب است: آدم را می‌فرستد دنبال چیزی که خراب نیست.
  req -X POST $A/auth/change-password -H "Authorization: Bearer $V" -H "$JS" \
    -d '{"currentPassword":"First#12345","newPassword":"Second#6789"}' >/dev/null
  # ⚠️ مهم‌ترین سنجهٔ این فایل.  اگر ۲۰۰ بدهد، یعنی کسی که رمزش را
  #    عوض کرده هنوز مهاجم را داخل دارد — و باور دارد که ندارد.
  chk "توکنِ پیش از تغییر باطل شد" "$(code $A/auth/me -H "Authorization: Bearer $V")" "401"
  chk "ورود با رمز قدیمی ۴۰۱" \
    "$(code -X POST $A/auth/login -H "$JS" -d "{\"email\":\"$EMAIL\",\"password\":\"First#12345\"}")" "401"

  echo '--- ۲) توکنِ تازه پس از تغییر کار می‌کند ---'
  # نگهبانی که همه را ببندد هم خراب است.
  V2=$(login "$EMAIL" 'Second#6789')
  chk "توکنِ تازه معتبر" "$(code $A/auth/me -H "Authorization: Bearer $V2")" "200"

  echo '--- ۳) غیرفعال کردن، نشست را می‌کشد ---'
  Q "UPDATE \"User\" SET status='INACTIVE' WHERE email='$EMAIL';" >/dev/null
  chk "کاربرِ غیرفعال ۴۰۱" "$(code $A/auth/me -H "Authorization: Bearer $V2")" "401"

  echo '--- ۴) فعال شدن دوباره، دسترسی را برمی‌گرداند ---'
  # وضعیت باید **زنده** خوانده شود، نه یک بار در ورود.
  Q "UPDATE \"User\" SET status='ACTIVE' WHERE email='$EMAIL';" >/dev/null
  chk "کاربرِ فعال دوباره ۲۰۰" "$(code $A/auth/me -H "Authorization: Bearer $V2")" "200"

  echo '--- ۵) کاربرِ حذف‌شده ---'
  # توکنش امضای معتبر دارد ولی پشتش کسی نیست.
  Q "DELETE FROM \"User\" WHERE email='$EMAIL';" >/dev/null
  chk "کاربرِ حذف‌شده ۴۰۱" "$(code $A/auth/me -H "Authorization: Bearer $V2")" "401"
done

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
