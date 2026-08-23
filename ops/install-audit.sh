#!/usr/bin/env bash
#
# ممیزیِ پیش از نصب در فروشگاه.
#
# ⚠️ این اسکریپت چیزی را می‌سنجد که `run-tests.sh` نمی‌بیند.
#
#    آزمون‌های کارکردی می‌گویند «برنامه درست کار می‌کند».  این می‌گوید
#    «برنامه درست **نصب** شده».  دو چیزِ متفاوت‌اند، و شکافِ بینشان
#    جایی است که نصب‌های واقعی لو می‌روند:
#
#      رمزِ پیش‌فرضی که کسی عوض نکرد
#      رازی که در `.env` نیست و مقدارِ پیش‌فرضِ داخل کد را گرفته
#      پنلی که روی وای‌فای فروشگاه بی‌رمز باز است
#      پایگاه داده‌ای که از بیرون قابل اتصال است
#
#    هیچ‌کدامشان اشکالِ کد نیستند؛ همه اشکالِ **پیکربندی**اند — و
#    دقیقاً همان‌هایی که در روزِ نصب فراموش می‌شوند.
#
# اجرا:  bash ops/install-audit.sh

cd "$(dirname "$0")/.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
ENVF=${MOLIDO_ENV:-.env}

ok=0; warn=0; bad=0
OK()   { ok=$((ok+1));     printf '  \033[32m✓\033[0m  %s\n' "$1"; }
WARN() { warn=$((warn+1)); printf '  \033[33m!\033[0m  %s\n' "$1"; }
BAD()  { bad=$((bad+1));   printf '  \033[31m✗\033[0m  %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

envv() { grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | sed "s/^$1=//" | tr -d '"'"'"'\r'; }

# ─────────────────────────────────────────────── ۱) رازها
step '۱) رازها'

S=$(envv JWT_SECRET)
if [ -z "$S" ]; then BAD "JWT_SECRET تنظیم نشده — سرویس بالا نمی‌آید"
elif [ ${#S} -lt 32 ]; then BAD "JWT_SECRET کوتاه است (${#S}) — openssl rand -hex 32"
else OK "JWT_SECRET با طول ${#S}"; fi

R=$(envv JWT_REFRESH_SECRET)
# ⚠️ اگر تنظیم نشود، کد از `${JWT_SECRET}_refresh` می‌سازد.
#
#    کار می‌کند، ولی یعنی لو رفتنِ یکی، دیگری را هم لو می‌دهد — و
#    توکنِ نوسازی سی روز عمر دارد در برابر دو ساعتِ توکنِ دسترسی.
if [ -z "$R" ]; then WARN "JWT_REFRESH_SECRET تنظیم نشده — از JWT_SECRET مشتق می‌شود"
else OK "JWT_REFRESH_SECRET جداگانه"; fi

# ⚠️ پیش‌فرضِ داخلِ کد: هر کسی که مخزن را دیده، می‌داندش.
W=$(envv N8N_WEBHOOK_SECRET)
if [ -z "$W" ] || [ "$W" = "molido_n8n_secret" ]; then
  BAD "N8N_WEBHOOK_SECRET همان پیش‌فرضِ عمومیِ داخل کد است"
else OK "N8N_WEBHOOK_SECRET اختصاصی"; fi

# ─────────────────────────────────────────── ۲) رمز مدیر
step '۲) رمز مدیر'

PW=$(envv ADMIN_PASSWORD)
case "$PW" in
  ''|admin123|admin|123456|password|Admin@123)
    BAD "ADMIN_PASSWORD پیش‌فرض یا حدس‌زدنی است" ;;
  *)
    if [ ${#PW} -lt 12 ]; then
      # ⚠️ قفلِ حساب حملهٔ آنلاین را کند می‌کند، ولی اگر پایگاه داده
      #    لو برود، فقط طولِ رمز است که وقت می‌خرد.
      WARN "ADMIN_PASSWORD کوتاه است (${#PW}) — دستِ‌کم ۱۲ نویسه"
    else OK "ADMIN_PASSWORD با طول ${#PW}"; fi ;;
esac

# ───────────────────────────────────── ۳) در معرضِ شبکه
step '۳) در معرضِ شبکه'

PUB=$($C ps --format '{{.Service}} {{.Publishers}}' 2>/dev/null)
if [ -z "$PUB" ]; then
  WARN "سرویس‌ها بالا نیستند — این بخش رد شد"
else
  # ⚠️ پایگاه داده هرگز نباید منتشر شود.
  #
  #    RLS داخلِ برنامه محافظت می‌کند، نه در برابرِ کسی که مستقیم به
  #    ۵۴۳۲ وصل می‌شود با کاربرِ صاحبِ جدول.
  if printf '%s' "$PUB" | grep -q '^postgres.*0\.0\.0\.0'; then
    BAD "پایگاه داده روی شبکه منتشر شده — پورت را ببندید"
  else OK "پایگاه داده منتشر نشده"; fi

  # ⚠️ n8n اعتبارنامهٔ پایگاه داده و کلیدهای API را در خودش دارد.
  #
  #    و از نسخهٔ ۱، `N8N_BASIC_AUTH_*` را نادیده می‌گیرد: تا وقتی
  #    حسابِ مالک ساخته نشده، پنل کاملاً باز است.
  if printf '%s' "$PUB" | grep -q '^n8n.*0\.0\.0\.0'; then
    BAD "n8n روی کلِ شبکه باز است — N8N_BIND را روی 127.0.0.1 بگذارید"
  else OK "n8n روی شبکه منتشر نشده"; fi
fi

# ─────────────────────────────────────── ۴) وضعیتِ n8n
step '۴) وضعیتِ n8n'

NP=$(envv N8N_PORT); NP=${NP:-5678}
SET=$(curl -s --max-time 5 "http://localhost:$NP/rest/settings" 2>/dev/null \
      | python3 -c "
import sys,json
try: print(json.load(sys.stdin).get('data',{}).get('userManagement',{}).get('showSetupOnFirstLoad'))
except Exception: print('unreachable')
" 2>/dev/null)
case "$SET" in
  True)  BAD "حسابِ مالکِ n8n ساخته نشده — اولین بازدیدکننده مالک می‌شود" ;;
  False) OK  "حسابِ مالکِ n8n ساخته شده" ;;
  *)     WARN "n8n پاسخ نداد — اگر عمداً خاموش است، بی‌اشکال" ;;
esac

# ─────────────────────────── ۵) ثبت‌نامِ عمومیِ کارکنان
step '۵) ثبت‌نامِ عمومی'

# ⚠️ `/auth/register` بی‌احراز هویت است و شرکتِ تازه می‌سازد.
#
#    جداسازی سالم است (حسابِ تازه دادهٔ شرکتِ اصلی را نمی‌بیند)، ولی
#    در نصبِ تک‌فروشگاهی هیچ‌کس نباید بتواند خودش حساب بسازد.
#
#    این تصمیمِ صاحبِ سامانه است، نه چیزی که اینجا بی‌خبر عوض شود —
#    پس هشدار است، نه خطا.
RC=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$A/auth/register" \
     -H 'Content-Type: application/json' -d '{}' 2>/dev/null)
case "$RC" in
  400|422) WARN "ثبت‌نامِ عمومی باز است — اگر تک‌فروشگاهی است، ببندیدش" ;;
  404|403) OK   "ثبت‌نامِ عمومی بسته است" ;;
  429)     WARN "سقفِ نرخ — دوباره امتحان کنید" ;;
  *)       WARN "پاسخِ نامنتظر از /auth/register: $RC" ;;
esac

# ────────────────────────────────── ۶) سختی‌های احراز
step '۶) سختی‌های احراز هویت'

EXP=$(envv JWT_EXPIRES_IN); EXP=${EXP:-2h}
case "$EXP" in
  *d) BAD "عمرِ توکن $EXP است — روزها برای توکنی در localStorage زیاد است" ;;
  *)  OK  "عمرِ توکن $EXP" ;;
esac

# کوکیِ نوسازی باید httpOnly باشد — سنجشِ زنده، نه از روی کد.
CK=$(curl -s -D - -o /dev/null --max-time 5 -X POST "$A/auth/login" \
     -H 'Content-Type: application/json' -d '{"email":"nobody@invalid","password":"x"}' 2>/dev/null)
if printf '%s' "$CK" | grep -qi 'set-cookie'; then
  WARN "ورودِ ناموفق کوکی می‌نشاند — نباید بنشاند"
else OK "ورودِ ناموفق کوکی نمی‌نشاند"; fi

# ───────────────────────────────────────── ۷) پشتیبان
step '۷) پشتیبان'

if $C ps --format '{{.Service}}' 2>/dev/null | grep -q '^backup$'; then
  OK "سرویسِ پشتیبان‌گیری بالاست"
else
  # ⚠️ نصبی بی‌پشتیبان، یک خرابیِ دیسک با کلِ دفترِ فروشگاه فاصله دارد.
  BAD "سرویسِ پشتیبان‌گیری بالا نیست"
fi

# ─────────────────────────────────────────────── جمع‌بندی
printf '\n\033[1mجمع‌بندی\033[0m\n'
printf '  سالم: %s   هشدار: %s   \033[31mایراد: %s\033[0m\n' "$ok" "$warn" "$bad"
if [ "$bad" -gt 0 ]; then
  printf '\n  \033[31mنصب نکنید تا ایرادها رفع شوند.\033[0m\n'
  exit 1
fi
printf '\n  آمادهٔ نصب.  هشدارها را بخوانید و تصمیم بگیرید.\n'
