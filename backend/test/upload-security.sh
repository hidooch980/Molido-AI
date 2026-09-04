#!/usr/bin/env bash
#
# آپلود فایل — فهرست سفید و سربرگ‌های غیرقابل‌اجرا.
#
# ⚠️ این مجموعه از یک آسیب‌پذیریِ **تأییدشده** آمد، نه از احتیاط.
#
#    پیش از این هیچ صافی‌ای روی نوع فایل نبود.  زنجیرهٔ حمله ساخته و
#    در مرورگر اجرا شد:
#
#      ۱) کاربرِ واردشده — هر نقشی، حتی کارمند — `payload.js` آپلود کرد
#      ۲) و یک `loader.html` که آن را صدا می‌زد
#      ۳) لینک `/uploads/…html` باز شد
#      ۴) اسکریپت در **دامنهٔ برنامه** اجرا شد (عنوان تب عوض شد)
#      ۵) یعنی `localStorage.molido_token` در دسترسش بود
#
#    `helmet` سیاست CSP داشت ولی `script-src 'self'` است و `/uploads/`
#    هم «self» است — پس CSP سراسری اینجا محافظت نمی‌کرد.
#
# دو لایه رفع شد و هر دو اینجا سنجیده می‌شوند:
#   لایهٔ ۱  فهرست سفیدِ پسوند در `uploads.controller.ts`
#   لایهٔ ۲  سربرگ `default-src 'none'; sandbox` در `main.ts`

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق — MOLIDO_ADMIN_PASSWORD را بده"
  exit 1
fi
AU="Authorization: Bearer $T"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

up() {  # up <file> -> کد وضعیت
  curl -s -o /dev/null -w '%{http_code}' -X POST "$A/uploads" -H "$AU" -F "file=@$1"
}

echo '--- ۱) نوعِ اجراشدنی رد می‌شود ---'
#
# فهرست سیاه کافی نیست: هر پسوندی که مرورگر روزی اجرا کند باید
# **پیش‌فرض ممنوع** باشد.  این‌ها نمونه‌اند، نه کلِ خطر.
for ext in html js svg htm xhtml mjs xml; do
  printf 'x' > "$TMP/evil.$ext"
  chk "پسوند .$ext رد می‌شود" "$(up "$TMP/evil.$ext")" "400"
done

echo '--- ۲) نوعِ مشروع پذیرفته می‌شود ---'
#
# نگهبانی که همه‌چیز را رد کند هم خراب است — کاربر باید بتواند عکس
# کالا و فاکتور PDF بگذارد.
printf '\x89PNG\r\n\x1a\n' > "$TMP/ok.png"
printf '%%PDF-1.4' > "$TMP/ok.pdf"
printf 'a,b\n1,2' > "$TMP/ok.csv"
chk "png پذیرفته می‌شود" "$(up "$TMP/ok.png")" "201"
chk "pdf پذیرفته می‌شود" "$(up "$TMP/ok.pdf")" "201"
chk "csv پذیرفته می‌شود" "$(up "$TMP/ok.csv")" "201"

echo '--- ۳) سربرگ‌های غیرقابل‌اجرا ---'
#
# لایهٔ دوم: حتی اگر فایلی از فهرست سفید رد شود، مرورگر نباید
# اجرایش کند.
URL=$(curl -s -X POST "$A/uploads" -H "$AU" -F "file=@$TMP/ok.png" \
      | python3 -c "import sys,json;print(json.load(sys.stdin).get('filePath',''))" 2>/dev/null)
H=$(curl -s -D - -o /dev/null "$A$URL")
chk "CSP روی uploads" "$(echo "$H" | grep -ci "default-src 'none'")" "1"
chk "sandbox روی uploads" "$(echo "$H" | grep -ci 'sandbox')" "1"
chk "nosniff روی uploads" "$(echo "$H" | grep -ci 'X-Content-Type-Options: nosniff')" "1"
chk "قاب ممنوع" "$(echo "$H" | grep -ci 'X-Frame-Options: DENY')" "1"

echo '--- ۴) بدون توکن آپلود نمی‌شود ---'
chk "بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/uploads" -F "file=@$TMP/ok.png")" "401"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
