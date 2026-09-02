#!/usr/bin/env bash
#
# ساختِ حسابِ **فروشنده** — نقشِ `SUPER_ADMIN`.
#
#   bash ops/create-vendor.sh vendor@example.com [میزبان]
#
# ⚠️ چرا اسکریپت و نه API؟  **مرغ و تخم‌مرغ.**
#
#    ساختنِ `SUPER_ADMIN` از راهِ API خودش `SUPER_ADMIN` می‌خواهد.  در
#    نصبِ تازه هیچ‌کدام وجود ندارد، پس مسیرهای فروشنده برای همیشه
#    بسته می‌مانند.
#
#    این تنها راهِ ورود است، و عمداً از پوسته می‌گذرد نه از شبکه: کسی
#    که به سرور دسترسی دارد، از قبل همه‌چیز را دارد.
#
# ⚠️ رمز از **ورودیِ محرمانه** خوانده می‌شود، نه از آرگومان.
#
#    آرگومان در `~/.bash_history`، در `ps` و در لاگِ ممیزی می‌نشیند —
#    و این رمزِ حسابی است که فهرستِ **همهٔ مشتریان** را می‌بیند.
#
#    مقدار فقط در حافظه می‌ماند، از راهِ stdin به سرور می‌رود، و
#    هیچ‌جا چاپ نمی‌شود.

set -u

EMAIL="${1:-}"
HOST="${2:-mlz}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"
CF="-f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml"

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

[ -n "$EMAIL" ] || die "ایمیل را بدهید:  bash ops/create-vendor.sh vendor@example.com"
case "$EMAIL" in
  *@*.*) ;;
  *) die "«$EMAIL» ایمیل به نظر نمی‌رسد" ;;
esac

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

step "۰) دسترسی به $HOST"
ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" 'echo "  متصل: $(hostname)"' \
  || die "به $HOST وصل نشد"

# ---------------------------------------------------------------- ۱) وضعیت
step "۱) وضعیتِ فعلی"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF exec -T postgres \
  psql -U postgres -d molido_ai -tAq -c \"
    SELECT '  فروشندهٔ موجود: ' || COALESCE(string_agg(email, ', '), 'هیچ')
      FROM \\\"User\\\" WHERE role = 'SUPER_ADMIN';
    SELECT '  این ایمیل: ' || COALESCE(string_agg(role, ', '), 'وجود ندارد')
      FROM \\\"User\\\" WHERE email = '$EMAIL';\" </dev/null" 2>&1 | tr -d '\r'

# ---------------------------------------------------------------- ۲) رمز
step "۲) رمز"
printf '  رمز را وارد کنید (روی صفحه دیده نمی‌شود):\n  > '
read -r -s PASS1
printf '\n  دوباره:\n  > '
read -r -s PASS2
printf '\n'

[ -n "$PASS1" ] || die "چیزی وارد نشد"
[ "$PASS1" = "$PASS2" ] || die "دو رمز یکی نیستند"

# ⚠️ سنجشِ قوّت **اینجا**، نه فقط اتکا به حداقلِ شش‌نویسه‌ای DTO.
#
#    این حسابی است که فهرستِ همهٔ مشتریان را می‌بیند.  رمزِ ضعیفش
#    یعنی نشتِ داده‌ی همهٔ مشتریان، نه یکی.
if [ "${#PASS1}" -lt 12 ]; then
  printf '  ⚠️  رمز %s نویسه است.  برای حسابی که همهٔ مشتریان را\n' "${#PASS1}"
  printf '      می‌بیند، دستِ‌کم ۱۲ نویسه پیشنهاد می‌شود.\n'
  printf '      ادامه می‌دهید؟ [y/N] '
  read -r ans </dev/tty
  case "$ans" in y|Y) ;; *) die "لغو شد" ;; esac
fi

# ---------------------------------------------------------------- ۳) ساخت
step "۳) ساخت روی سرور"
#
# ⚠️ کد از **فایل** می‌رود، نه از رشته‌ای که چهار لایه گریز دارد.
#
#    نسخهٔ اول کلِ اسکریپتِ Node را در یک رشته از اینجا ← ssh ←
#    پوستهٔ راه دور ← `node -e` رد می‌کرد.  سنجیده شد و **شکست**:
#    `$1` در لایه‌ها گم شد و node خطای نحوی داد.
#
#    فایل هیچ لایه‌ای ندارد و `node --check` می‌تواند از قبل بسنجدش.
#
# ⚠️ و درهم‌سازی **داخلِ کانتینر** با همان bcryptِ برنامه.
#    نسخهٔ محلی اگر متفاوت باشد، رمز پذیرفته نمی‌شود بی‌آنکه خطایی
#    بدهد — فقط «رمز اشتباه است» می‌گیرید و دنبالِ اشتباهی می‌گردید.
scp -q ops/lib/create-vendor.js "$HOST:/tmp/create-vendor.js" \
  || die "فرستادنِ اسکریپت شکست"

printf '%s' "$PASS1" | ssh -o BatchMode=yes "$HOST" \
  "cd $REMOTE && docker compose $CF cp /tmp/create-vendor.js backend:/tmp/cv.js >/dev/null &&
   docker compose $CF exec -T backend node /tmp/cv.js '$EMAIL';
   rc=\$?
   docker compose $CF exec -T backend rm -f /tmp/cv.js >/dev/null 2>&1
   rm -f /tmp/create-vendor.js
   exit \$rc" || die "ساخت شکست خورد"

unset PASS1 PASS2

# ---------------------------------------------------------------- ۴) سنجش
step "۴) سنجش"
#
# ⚠️ «کاربر ساخته شد» با «می‌تواند وارد شود» یکی نیست.
#
#    اگر درهم‌سازی ناسازگار باشد، سطر در پایگاه‌داده هست و ورود کار
#    نمی‌کند — و پیامش «رمز اشتباه است» می‌شود، که آدم را دنبالِ رمز
#    می‌فرستد نه دنبالِ درهم‌سازی.
#
#    اینجا رمز پرسیده نمی‌شود؛ فقط سنجیده می‌شود که مسیرِ فروشنده
#    دیگر برای **همه** بسته نیست.
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF exec -T postgres \
  psql -U postgres -d molido_ai -tAq -c \"
    SELECT '  فروشندگان: ' || string_agg(email, ', ')
      FROM \\\"User\\\" WHERE role = 'SUPER_ADMIN';\" </dev/null" 2>&1 | tr -d '\r'

step "تمام"
cat <<TXT

  حالا با همین ایمیل وارد شوید و مسیرهای فروشنده باز است:

      GET /subscription/customers        فهرست مشتریان
      PUT /subscription/customers/:id    ثبت یا تمدید اشتراک

  ⚠️ ورود را همین حالا امتحان کنید.  اگر «رمز اشتباه» گرفتید، مشکل
     از درهم‌سازی است نه از رمز — دوباره اجرا کنید.

TXT
