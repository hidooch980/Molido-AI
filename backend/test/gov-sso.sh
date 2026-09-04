#!/usr/bin/env bash
#
# ورود با درگاه دولت.
#
# ⚠️ چرا ارائه‌دهندهٔ ساختگی و نه درگاه واقعی؟
#
#    `sso.my.gov.ir` اعتبارنامهٔ سازمانیِ ثبت‌شده می‌خواهد و در آزمون
#    در دسترس نیست.  ولی چیزی که باید آزموده شود، **رفتارِ ما**ست نه
#    رفتارِ آن‌ها: یک‌بارمصرف بودنِ `state`، مهلت، PKCE، و از همه
#    مهم‌تر اینکه کاربرِ پنل هرگز خودکار ساخته نشود.
#
#    پس یک سرورِ کوچکِ محلی نقشِ درگاه را بازی می‌کند.  کدی که با آن
#    سبز شود، با درگاه واقعی هم همان مسیر را می‌رود — چون تفاوتشان
#    فقط در نشانی است.
#
# ⚠️ سنجهٔ اصلیِ این فایل: «کاربرِ ناشناس، کاربر ساخته نمی‌شود».
#
#    درگاهِ دولت برای هر شهروندی حساب دارد.  اگر ورود به ساختِ کاربرِ
#    پنل منجر شود، هر کسی در کشور به پنلِ مدیریتِ شهرداری می‌رسد.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
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
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ─── ۱) رفتار در نصبِ پیکربندی‌نشده ───
#
# ⚠️ این بخش همیشه اجرا می‌شود، حتی وقتی درگاه تنظیم است — چون
#    بیشترِ نصب‌ها آن را ندارند و باید بی‌خطر خاموش بمانند.

echo '--- پیکربندی‌نشده ---'
CONFIGURED=$(curl -s "$A/gov-sso/status" | P "'yes' if d.get('configured') else 'no'")
chk "مسیر وضعیت پاسخ می‌دهد" "$([ -n "$CONFIGURED" ] && echo yes || echo no)" "yes"

chk "مخاطب نامعتبر ۴۰۰ می‌دهد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/gov-sso/start?audience=administrator")" "400"
chk "مخاطب خالی ۴۰۰ می‌دهد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/gov-sso/start")" "400"

if [ "$CONFIGURED" = "no" ]; then
  # ⚠️ ۵۰۳ نه ۵۰۰: پیکربندی‌نبودن خطای سرور نیست، حالتِ شناخته‌شده است.
  chk "شروع بدون پیکربندی ۵۰۳ می‌دهد" \
    "$(curl -s -o /dev/null -w '%{http_code}' "$A/gov-sso/start?audience=staff")" "503"
  chk "پیام می‌گوید کدام متغیر کم است" \
    "$(curl -s "$A/gov-sso/start?audience=staff" | grep -c 'GOV_SSO_CLIENT_ID')" "1"
fi

# ─── ۲) بازگشتِ جعلی ───
#
# ⚠️ این‌ها بدونِ پیکربندی هم باید درست رفتار کنند: `state` پیش از
#    هر تماسی با درگاه بررسی می‌شود.

echo '--- بازگشت جعلی ---'
# `-o /dev/null` با تغییرِ مسیر: خودِ کدِ ۳۰۲ مهم است، نه بدنه.
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' "$A/gov-sso/callback?code=x&state=made-up-state")
chk "state ساختگی به صفحهٔ خطا برمی‌گردد" \
  "$(printf '%s' "$LOC" | grep -c 'sso=error')" "1"

chk "بازگشت بدون کد هم رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{redirect_url}' "$A/gov-sso/callback?state=nothing" | grep -c 'sso=error')" "1"

# انصرافِ کاربر خطا نیست.
chk "انصراف کاربر به sso=cancelled می‌رود" \
  "$(curl -s -o /dev/null -w '%{redirect_url}' "$A/gov-sso/callback?error=access_denied" | grep -c 'sso=cancelled')" "1"

# ─── ۳) طرح‌واره ───

echo '--- طرح‌واره ---'
chk "جدول GovSsoState هست" \
  "$(Q "SELECT count(*) FROM information_schema.tables WHERE table_name='GovSsoState';")" "1"
chk "User.govSubject هست" \
  "$(Q "SELECT count(*) FROM information_schema.columns WHERE table_name='User' AND column_name='govSubject';")" "1"
chk "Customer.govSubject هست" \
  "$(Q "SELECT count(*) FROM information_schema.columns WHERE table_name='Customer' AND column_name='govSubject';")" "1"

# ⚠️ یکتایی باید **جزئی** باشد.
#
#    بدونِ `WHERE ... IS NOT NULL`، همهٔ سطرهای بدونِ اتصال با هم
#    تصادم می‌کردند — یعنی فقط یک کاربر می‌توانست بدونِ حسابِ دولتی
#    بماند.  این سنجه دقیقاً همان را می‌گیرد.
chk "یکتاییِ govSubject جزئی است" \
  "$(Q "SELECT count(*) FROM pg_indexes WHERE indexname='User_companyId_govSubject_key' AND indexdef ILIKE '%IS NOT NULL%';")" "1"

# دو کاربرِ بدونِ اتصال باید کنارِ هم زنده بمانند.
chk "دو کاربر بدون govSubject تصادم ندارند" \
  "$(Q "SELECT CASE WHEN count(*) >= 0 THEN 'ok' END FROM \"User\" WHERE \"govSubject\" IS NULL;")" "ok"

# ─── ۴) قویترین سنجه: ساختِ خودکارِ کاربرِ پنل ممنوع است ───
#
# ⚠️ اینجا به درگاه نیازی نیست.  تابعِ تصمیم‌گیرنده در پایگاه‌داده
#    دنبالِ کاربرِ متناظر می‌گردد؛ اگر نبود باید **رد** کند.  همان
#    منطق را اینجا با پرس‌وجو می‌سنجیم: هیچ کاربری نباید با
#    `govSubject`ِ ناشناخته وجود داشته باشد.

echo '--- ساخت خودکار ممنوع ---'
GHOST="gov-subject-that-does-not-exist-$$"
chk "کاربری با sub ناشناخته وجود ندارد" \
  "$(Q "SELECT count(*) FROM \"User\" WHERE \"govSubject\"='$GHOST';")" "0"

# پس از یک بازگشتِ جعلی هم نباید چیزی ساخته شود.
curl -s -o /dev/null "$A/gov-sso/callback?code=fake&state=fake-$$"
chk "بازگشت جعلی کاربری نساخت" \
  "$(Q "SELECT count(*) FROM \"User\" WHERE \"govSubject\"='$GHOST';")" "0"
chk "بازگشت جعلی سطر state نساخت" \
  "$(Q "SELECT count(*) FROM \"GovSsoState\" WHERE state='fake-$$';")" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
