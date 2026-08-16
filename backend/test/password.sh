#!/usr/bin/env bash
#
# تغییر رمز کاربر.
#
# چرا تازه اضافه شد: هیچ مسیری برای تغییر رمز وجود نداشت.  فقط
# `PATCH /users/:id` بود که کار مدیر است و رمز فعلی را نمی‌پرسد — یعنی
# صندوق‌دار اصلاً نمی‌توانست رمزش را عوض کند، و هشدار «رمز پیش‌فرض
# admin123 هنوز فعال است» عملاً راه رفعی نداشت.
#
# ⚠️ این مجموعه رمز مدیر را عوض و دوباره برمی‌گرداند؛ اگر وسط کار
#    بمیرد، رمز روی TEMP-PASSWORD می‌ماند.  پیام پایانی همین را می‌گوید.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

# رمز واقعیِ همین نصب، نه `admin123` ثابت.  این مجموعه رمز را عوض و
# دوباره برمی‌گرداند؛ اگر مقدار بازگشتی با رمز واقعی نخواند، آزمون نه
# فقط می‌شکند بلکه **نصب را با رمز اشتباه رها می‌کند**.
ORIG="$PW"
TEMP='Temp-Passw0rd-9x'

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
P() { python3 -c "import sys,json,io;sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8');sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

login() {
  curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
    -d "{\"email\":\"admin@molido.ai\",\"password\":\"$1\"}" \
    | P "d.get('accessToken','')"
}

# کد وضعیت، نه فقط بود و نبودِ توکن.
#
# «توکن خالی» دو علت دارد: رمز غلط (۴۰۱) یا خوردنِ سقف ورود (۴۲۹).  اگر
# این دو یکی گرفته شوند، آزمونی که سقف خورده «موفق» گزارش می‌شود — همان
# دامِ قبلی، فقط برعکس.
login_code() {
  curl -s -o /dev/null -w '%{http_code}' -X POST $A/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"admin@molido.ai\",\"password\":\"$1\"}"
}

# این مجموعه ذاتاً پرورود است و سقف ورود (۱۰ در دقیقه) عمداً سخت نگه
# داشته شده.  به‌جای شل کردن سقف — که همان محافظتی را از بین می‌برد که
# قرار است بسنجیم — یک بار صبر می‌کنیم تا پنجره باز شود.
#
# ۴۲۹ پاسخِ معنادارِ سامانه نیست؛ وضعیتِ ابزار است و نباید شکست حساب شود.
code_of() {
  c=$(login_code "$1")
  if [ "$c" = "429" ]; then
    printf '  … سقف ورود پر شد؛ صبر تا باز شدن پنجره\n'
    i=0
    while [ "$i" -lt 14 ] && [ "$c" = "429" ]; do
      sleep 5
      i=$((i + 1))
      c=$(login_code "$1")
    done
  fi
  printf '%s' "$c"
}

T=$(login "$ORIG")
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"

echo '--- 1) بدون توکن رد می‌شود ---'
chk "ناشناس رد می‌شود" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/auth/change-password \
  -H "$JS" -d "{\"currentPassword\":\"$ORIG\",\"newPassword\":\"$TEMP\"}")" "401"

echo '--- 2) رمز فعلیِ غلط رد می‌شود ---'
# مهم‌ترین بند: بدون این، هر نشستِ باز مانده روی صندوق کافی است تا کسی
# رمز صاحب فروشگاه را عوض کند و خودش را بیرون بیندازد.
chk "رمز فعلی غلط" "$(curl -s -X POST $A/auth/change-password -H "$AU" -H "$JS" \
  -d "{\"currentPassword\":\"totally-wrong\",\"newPassword\":\"$TEMP\"}" | P "d.get('statusCode')")" "401"

echo '--- 3) رمز کوتاه رد می‌شود ---'
chk "کمتر از ۸ نویسه" "$(curl -s -X POST $A/auth/change-password -H "$AU" -H "$JS" \
  -d "{\"currentPassword\":\"$ORIG\",\"newPassword\":\"kotah\"}" | P "d.get('statusCode')")" "400"

echo '--- 4) رمز تکراری رد می‌شود ---'
chk "همان رمز فعلی" "$(curl -s -X POST $A/auth/change-password -H "$AU" -H "$JS" \
  -d "{\"currentPassword\":\"$ORIG\",\"newPassword\":\"$ORIG\"}" | P "d.get('statusCode')")" "400"

echo '--- 5) تغییر موفق ---'
chk "تغییر انجام شد" "$(curl -s -X POST $A/auth/change-password -H "$AU" -H "$JS" \
  -d "{\"currentPassword\":\"$ORIG\",\"newPassword\":\"$TEMP\"}" | P "d.get('changed')")" "True"

echo '--- 6) رمز تازه کار می‌کند ---'
NEW_T=$(login "$TEMP")
chk "ورود با رمز تازه" "$([ -n "$NEW_T" ] && echo yes || echo no)" "yes"

echo '--- 7) رمز قدیمی دیگر کار نمی‌کند ---'
chk "رمز قدیمی ۴۰۱ می‌گیرد" "$(code_of "$ORIG")" "401"

echo '--- 8) بازگرداندن رمز اصلی ---'
chk "بازگشت به رمز اولیه" "$(curl -s -X POST $A/auth/change-password \
  -H "Authorization: Bearer $NEW_T" -H "$JS" \
  -d "{\"currentPassword\":\"$TEMP\",\"newPassword\":\"$ORIG\"}" | P "d.get('changed')")" "True"

chk "ورود دوباره با رمز اولیه" "$([ -n "$(login "$ORIG")" ] && echo yes || echo no)" "yes"

if [ "$(login "$ORIG")" = "" ]; then
  printf '\n  ⚠️  رمز مدیر روی «%s» مانده — دستی برگردانید.\n' "$TEMP"
fi

echo '--- 9) seed رمز داده‌شده را واقعاً می‌نشاند ---'
# روی سرور، نصب با رمز پیش‌فرض بالا آمد در حالی که اسکریپت رمز قوی
# ساخته بود.  دو شکستِ بی‌صدا پشت هم: `ADMIN_PASSWORD` به داخل کانتینر
# نمی‌رسید (فقط در .env بود، که برای جای‌گذاری در compose است نه محیط
# کانتینر)، و درج کاربر هم `ON CONFLICT DO NOTHING` بود.
SEEDPW='Seed-Test-Passw0rd'
$C exec -T -e ADMIN_PASSWORD="$SEEDPW" backend node dist/database/seed.js >/dev/null 2>&1
chk "رمز seed اعمال شد" "$(code_of "$SEEDPW")" "200"

$C exec -T -e ADMIN_PASSWORD="$ORIG" backend node dist/database/seed.js >/dev/null 2>&1
chk "بازگشت به رمز اولیه" "$(code_of "$ORIG")" "200"

echo '--- 10) seed بدون متغیر، رمز موجود را عوض نمی‌کند ---'
# وگرنه هر اجرای seed رمزی را که مدیر خودش عوض کرده به پیش‌فرض
# برمی‌گرداند — و کسی متوجه نمی‌شود تا روزی که نتواند وارد شود.
$C exec -T backend node dist/database/seed.js >/dev/null 2>&1
chk "رمز دست‌نخورده ماند" "$(code_of "$ORIG")" "200"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
