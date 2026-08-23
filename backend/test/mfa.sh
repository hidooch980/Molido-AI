#!/usr/bin/env bash
#
# رمز دومرحله‌ای (TOTP) — چرخهٔ کامل.
#
# ⚠️ چرا لازم بود؟
#
#    سخت‌سازی‌های قبلی — قفلِ حساب، ثبتِ تلاش، سقفِ نرخ — حملهٔ
#    **آنلاین** را کند می‌کنند.  ولی اگر رمز از راه دیگری لو برود
#    (تکرار روی سایتی که نشت کرده، نگاه از روی شانه، بدافزار)،
#    هیچ‌کدامشان جلویش را نمی‌گیرند.
#
#    و مدیرِ یک فروشگاه به همه‌چیز دسترسی دارد: قیمت، خزانه، حقوق،
#    کاربران.
#
# ⚠️ کدِ TOTP اینجا **واقعاً محاسبه می‌شود**، نه اینکه از سرور پرسیده
#    شود.
#
#    اگر آزمون کد را از خودِ سرور می‌گرفت، فقط ثابت می‌کرد سرور با
#    خودش سازگار است — و یک پیاده‌سازیِ کاملاً غلط هم همین را نشان
#    می‌دهد.  محاسبهٔ مستقل با همان الگوریتمِ RFC، ثابت می‌کند
#    برنامهٔ احرازکنندهٔ کاربر هم می‌تواند وارد شود.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }
TOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"; }
JGET() { python3 -c "import sys,json;print(json.load(sys.stdin).get('$1',''))"; }

# کدِ TOTP از روی راز — پیاده‌سازیِ مستقل با همان الگوریتمِ RFC 6238.
totp() {
  python3 -c "
import sys,hmac,hashlib,struct,time,base64
secret=sys.argv[1]
key=base64.b32decode(secret+'='*((8-len(secret)%8)%8))
step=int(time.time())//30
d=hmac.new(key,struct.pack('>Q',step),hashlib.sha1).digest()
o=d[-1]&0x0f
print(str((int.from_bytes(d[o:o+4],'big')&0x7fffffff)%1000000).zfill(6))
" "$1"
}

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
}

JS="Content-Type: application/json"
T=${MOLIDO_TOKEN:-}
if [ -z "$T" ]; then login 'admin@molido.ai' "$PW"; T=$(printf '%s' "$_R" | TOK); fi
if [ -z "$T" ]; then echo "  ✗ ورود مدیر ناموفق"; exit 1; fi
AU="Authorization: Bearer $T"

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

EMAIL=mfa.probe@molido.ai
cleanup() { Q "DELETE FROM \"User\" WHERE email='$EMAIL';" >/dev/null; }
cleanup
trap cleanup EXIT

curl -s -X POST "$A/users" -H "$AU" -H "$JS" \
  -d "{\"firstName\":\"Mfa\",\"lastName\":\"Probe\",\"email\":\"$EMAIL\",\"password\":\"Correct#123\",\"role\":\"MANAGER\"}" \
  >/dev/null

login "$EMAIL" 'Correct#123'
V=$(printf '%s' "$_R" | TOK)
UAU="Authorization: Bearer $V"
chk "ورود بدون MFA توکن می‌دهد" "$([ -n "$V" ] && echo yes || echo no)" "yes"

echo '--- ۱) وضعیت اولیه: خاموش ---'
chk "enabled=false" "$(curl -s "$A/auth/mfa/status" -H "$UAU" | JGET enabled)" "False"

echo '--- ۲) راه‌اندازی راز می‌دهد ولی فعال نمی‌کند ---'
#
# ⚠️ مهم‌ترین تصمیمِ طراحی در این فایل.
#
#    اگر راه‌اندازی بلافاصله فعال می‌کرد، کاربری که QR را دید و پنجره
#    را بست، دفعهٔ بعد نمی‌توانست وارد شود: سامانه کد می‌خواست و هیچ
#    برنامه‌ای راز را نداشت.
#
#    یعنی خودِ سخت‌سازی، کاربر را از حسابش بیرون می‌انداخت.
req -X POST "$A/auth/mfa/setup" -H "$UAU" -H "$JS" -d '{}'
SECRET=$(printf '%s' "$_R" | JGET secret)
# ۲۰ بایتِ تصادفی = ۱۶۰ بیت = دقیقاً ۳۲ نویسهٔ base32 (طولِ پیشنهادیِ
# RFC 4226).  `printf '%s'` سطر جدید اضافه نمی‌کند، پس ۳۲ نه ۳۳.
chk "راز گرفته شد" "$(printf '%s' "$SECRET" | wc -c)" "32"
chk "نشانی otpauth دارد" \
  "$(printf '%s' "$_R" | JGET otpauth | grep -c '^otpauth://totp/')" "1"
chk "هنوز فعال نشده" "$(curl -s "$A/auth/mfa/status" -H "$UAU" | JGET enabled)" "False"
chk "در انتظار تأیید" "$(curl -s "$A/auth/mfa/status" -H "$UAU" | JGET pending)" "True"

echo '--- ۳) ورود هنوز عادی است ---'
# تا وقتی تأیید نشده، نباید چیزی عوض شود.
login "$EMAIL" 'Correct#123'
chk "ورود توکن می‌دهد" "$([ -n "$(printf '%s' "$_R" | TOK)" ] && echo yes || echo no)" "yes"

echo '--- ۴) کدِ غلط تأیید نمی‌کند ---'
chk "کد غلط ۴۰۱" \
  "$(code -X POST "$A/auth/mfa/confirm" -H "$UAU" -H "$JS" -d '{"code":"000000"}')" "401"

echo '--- ۵) کدِ درست فعال می‌کند و کدهای بازیابی می‌دهد ---'
req -X POST "$A/auth/mfa/confirm" -H "$UAU" -H "$JS" -d "{\"code\":\"$(totp "$SECRET")\"}"
chk "تأیید ۲۰۰" "$_C" "200"
RECOVERY=$(printf '%s' "$_R" | python3 -c "import sys,json;c=json.load(sys.stdin).get('recoveryCodes',[]);print(c[0] if c else '')")
chk "هشت کد بازیابی" \
  "$(printf '%s' "$_R" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('recoveryCodes',[])))")" "8"
chk "حالا فعال است" "$(curl -s "$A/auth/mfa/status" -H "$UAU" | JGET enabled)" "True"

echo '--- ۶) ورود دیگر توکن نمی‌دهد، چالش می‌دهد ---'
#
# ⚠️ مهم‌ترین سنجهٔ امنیتیِ این فایل.
#
#    اگر `accessToken` برگردد، یعنی MFA فقط یک تنظیمِ تزئینی است و
#    رمزِ درست هنوز کافی است — یعنی هیچ‌چیز عوض نشده.
login "$EMAIL" 'Correct#123'
chk "توکن دسترسی نمی‌دهد" \
  "$([ -z "$(printf '%s' "$_R" | TOK)" ] && echo yes || echo no)" "yes"
chk "mfaRequired=true" "$(printf '%s' "$_R" | JGET mfaRequired)" "True"
CH=$(printf '%s' "$_R" | JGET challenge)
chk "چالش گرفته شد" "$([ -n "$CH" ] && echo yes || echo no)" "yes"

echo '--- ۷) چالش، توکنِ دسترسی نیست ---'
#
# ⚠️ اگر این ۲۰۰ بدهد، کلِ MFA دور زده می‌شود.
#
#    چالش با کلیدِ **جدا** امضا می‌شود.  با کلیدِ مشترک، همین رشته یک
#    توکنِ دسترسیِ معتبر می‌شد: نگهبان امضا را درست می‌دید، `sub` را
#    می‌خواند و کاربر را داخل می‌فرستاد — بی‌آنکه هرگز کدی خواسته شود.
chk "چالش روی /auth/me ۴۰۱" "$(code "$A/auth/me" -H "Authorization: Bearer $CH")" "401"

echo '--- ۸) کدِ غلط در مرحلهٔ دوم رد می‌شود ---'
chk "کد غلط ۴۰۱" \
  "$(code -X POST "$A/auth/mfa/verify" -H "$JS" -d "{\"challenge\":\"$CH\",\"code\":\"000000\"}")" "401"
# تلاشِ ناموفقِ مرحلهٔ دوم هم باید رد بگذارد، مثل مرحلهٔ اول.
chk "علت BAD_MFA ثبت شد" \
  "$(Q "SELECT reason FROM \"LoginAttempt\" WHERE email='$EMAIL' ORDER BY \"createdAt\" DESC LIMIT 1;")" "BAD_MFA"

echo '--- ۹) کدِ درست توکنِ کامل می‌دهد ---'
req -X POST "$A/auth/mfa/verify" -H "$JS" -d "{\"challenge\":\"$CH\",\"code\":\"$(totp "$SECRET")\"}"
V2=$(printf '%s' "$_R" | TOK)
chk "توکن دسترسی آمد" "$([ -n "$V2" ] && echo yes || echo no)" "yes"
chk "توکن کار می‌کند" "$(code "$A/auth/me" -H "Authorization: Bearer $V2")" "200"

echo '--- ۱۰) کدِ بازیابی یک بار کار می‌کند ---'
#
# ⚠️ بدون کدِ بازیابی، گم شدنِ گوشی یعنی از دست رفتنِ حساب — و برای
#    مدیرِ یک فروشگاه یعنی کلِ کسب‌وکار خوابیده.
login "$EMAIL" 'Correct#123'
CH2=$(printf '%s' "$_R" | JGET challenge)
req -X POST "$A/auth/mfa/verify" -H "$JS" -d "{\"challenge\":\"$CH2\",\"code\":\"$RECOVERY\"}"
chk "کد بازیابی پذیرفته شد" "$([ -n "$(printf '%s' "$_R" | TOK)" ] && echo yes || echo no)" "yes"

echo '--- ۱۱) همان کدِ بازیابی دوباره کار نمی‌کند ---'
#
# ⚠️ بدون این، یک کدِ لو رفته برای همیشه یک درِ باز است.
login "$EMAIL" 'Correct#123'
CH3=$(printf '%s' "$_R" | JGET challenge)
chk "مصرف‌شده ۴۰۱" \
  "$(code -X POST "$A/auth/mfa/verify" -H "$JS" -d "{\"challenge\":\"$CH3\",\"code\":\"$RECOVERY\"}")" "401"
chk "هفت کد مانده" "$(Q "SELECT count(*) FROM \"MfaRecoveryCode\" WHERE \"userId\"=(SELECT id FROM \"User\" WHERE email='$EMAIL') AND \"usedAt\" IS NULL;")" "7"

echo '--- ۱۲) خاموش کردن، رمز و کد هر دو می‌خواهد ---'
#
# ⚠️ فقط توکنِ معتبر کافی نیست.
#
#    توکن ممکن است دزدیده شده باشد؛ اگر با آن بشود MFA را خاموش کرد،
#    مهاجم اولین کاری که می‌کند همین است و از آن پس محافظتی نیست.
chk "بدون رمز ۴۰۱" \
  "$(code -X POST "$A/auth/mfa/disable" -H "Authorization: Bearer $V2" -H "$JS" \
     -d "{\"password\":\"wrong-one\",\"code\":\"$(totp "$SECRET")\"}")" "401"
chk "بدون کد ۴۰۱" \
  "$(code -X POST "$A/auth/mfa/disable" -H "Authorization: Bearer $V2" -H "$JS" \
     -d '{"password":"Correct#123","code":"000000"}')" "401"
chk "با هر دو ۲۰۰" \
  "$(code -X POST "$A/auth/mfa/disable" -H "Authorization: Bearer $V2" -H "$JS" \
     -d "{\"password\":\"Correct#123\",\"code\":\"$(totp "$SECRET")\"}")" "200"

echo '--- ۱۳) پس از خاموش کردن، ورود عادی برمی‌گردد ---'
login "$EMAIL" 'Correct#123'
chk "توکن مستقیم می‌آید" "$([ -n "$(printf '%s' "$_R" | TOK)" ] && echo yes || echo no)" "yes"
chk "کدهای بازیابی پاک شدند" \
  "$(Q "SELECT count(*) FROM \"MfaRecoveryCode\" WHERE \"userId\"=(SELECT id FROM \"User\" WHERE email='$EMAIL');")" "0"

echo '--- ۱۴) ردِ حسابرسی: مرحلهٔ اول «ورودِ موفق» نیست ---'
#
# ⚠️ پیش‌تر رمزِ درست بلافاصله یک ردیفِ success=true می‌ساخت — حتی
#    وقتی حساب MFA داشت و کاربر هرگز کد نمی‌داد.
#
#    یعنی مهاجمی که فقط رمز را دزدیده بود، در تاریخچه‌ای که مدیر
#    می‌بیند به شکلِ «ورودِ موفق» ثبت می‌شد.  لاگی که دروغ می‌گوید از
#    نبودِ لاگ بدتر است: به آن اعتماد می‌شود.
# راه‌اندازیِ دوباره — مرحلهٔ ۱۲ آن را خاموش کرده بود.
login "$EMAIL" 'Correct#123'
V3=$(printf '%s' "$_R" | TOK)
req -X POST "$A/auth/mfa/setup" -H "Authorization: Bearer $V3" -H "$JS" -d '{}'
SECRET=$(printf '%s' "$_R" | JGET secret)
code -X POST "$A/auth/mfa/confirm" -H "Authorization: Bearer $V3" -H "$JS" \
  -d "{\"code\":\"$(totp "$SECRET")\"}" >/dev/null
chk "MFA دوباره روشن شد" \
  "$(curl -s "$A/auth/mfa/status" -H "Authorization: Bearer $V3" | JGET enabled)" "True"

login "$EMAIL" 'Correct#123'
CH4=$(printf '%s' "$_R" | JGET challenge)
chk "مرحلهٔ اول success=false" \
  "$(Q "SELECT success FROM \"LoginAttempt\" WHERE email='$EMAIL' ORDER BY \"createdAt\" DESC LIMIT 1;")" "f"
chk "علتش MFA_PENDING" \
  "$(Q "SELECT reason FROM \"LoginAttempt\" WHERE email='$EMAIL' ORDER BY \"createdAt\" DESC LIMIT 1;")" "MFA_PENDING"

echo '--- ۱۵) «ورودِ موفق» فقط پس از مرحلهٔ دوم ثبت می‌شود ---'
req -X POST "$A/auth/mfa/verify" -H "$JS" -d "{\"challenge\":\"$CH4\",\"code\":\"$(totp "$SECRET")\"}"
chk "توکن آمد" "$([ -n "$(printf '%s' "$_R" | TOK)" ] && echo yes || echo no)" "yes"
chk "حالا success=true" \
  "$(Q "SELECT success FROM \"LoginAttempt\" WHERE email='$EMAIL' ORDER BY \"createdAt\" DESC LIMIT 1;")" "t"

echo '--- ۱۶) حدسِ کدِ مرحلهٔ دوم هم به قفل می‌رسد ---'
#
# ⚠️ پیش‌تر تنها سدّ، سقفِ نرخِ ده‌تا-در-دقیقه بود: حدس زدن کند می‌شد
#    ولی هرگز متوقف نمی‌شد.  مرحلهٔ اول پس از ده شکست قفل می‌شد و
#    مرحلهٔ دوم نمی‌شد — همان درِ پشتی که MFA قرار بود ببندد.
login "$EMAIL" 'Correct#123'
CH5=$(printf '%s' "$_R" | JGET challenge)
i=0
while [ "$i" -lt 10 ]; do
  code -X POST "$A/auth/mfa/verify" -H "$JS" \
    -d "{\"challenge\":\"$CH5\",\"code\":\"000000\"}" >/dev/null
  i=$((i+1))
done
chk "حساب قفل شد" \
  "$(Q "SELECT COALESCE(\"lockedUntil\" > now(), false) FROM \"User\" WHERE email='$EMAIL';")" "t"

echo '--- ۱۷) مرحلهٔ اول، قفل را باز نمی‌کند ---'
#
# ⚠️ پیش‌تر برداشتنِ قفل هم پیش از مرحلهٔ دوم رخ می‌داد.  یعنی مهاجمی
#    که رمز را می‌دانست ولی کد را نداشت، می‌توانست بی‌نهایت بار قفل را
#    باز کند — و قفل برای حساب‌های MFA‌دار عملاً بی‌اثر بود.
chk "ورود پشتِ قفل ۴۰۱" "$(code -X POST "$A/auth/login" -H "$JS" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Correct#123\"}")" "401"
chk "قفل هنوز سرِ جایش است" \
  "$(Q "SELECT COALESCE(\"lockedUntil\" > now(), false) FROM \"User\" WHERE email='$EMAIL';")" "t"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
