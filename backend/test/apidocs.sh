#!/usr/bin/env bash
#
# نگهبان هم‌گامی مستندات API.
#
# `API.md` دست‌نویس بود و کهنه شد — چهار ماژول کامل در آن نبودند و
# هیچ‌چیز این را نمی‌گفت.  حالا ساخته می‌شود، ولی ساخته شدن به‌تنهایی
# کافی نیست: کسی که مسیر تازه‌ای اضافه کند و فایل را دوباره نسازد،
# همان وضعیت قبل را برمی‌گرداند.
#
# این آزمون همان اختلاف را به یک شکست تبدیل می‌کند.

cd "$(dirname "$0")/.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

echo '--- ۱) spec زنده در دسترس است ---'
chk "swagger json پاسخ می‌دهد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/api-docs-json")" "200"

echo '--- ۲) API.md با برنامه هم‌گام است ---'
# ⚠️ این بررسی فقط روی نمایهٔ **کامل** (`suite`) معنا دارد.
#
#    `API.md` مستنداتِ کلِ سامانه است.  ولی هر محصول زیرمجموعه‌ای از
#    ماژول‌ها را بار می‌کند، و مقایسهٔ سندِ کامل با برنامهٔ ناقص همیشه
#    اختلاف می‌دهد بی‌آنکه چیزی خراب باشد.
#
#    این دقیقاً پیش آمد: `API.md` از نمایهٔ فروشگاه ساخته شده بود و
#    **صفر** مسیرِ رستوران داشت — کلِ آن ماژول از مستندات غایب بود و
#    هیچ‌چیز این را نمی‌گفت.  در فروشگاه سبز می‌ماند چون سند و برنامه
#    هر دو ناقصِ **یکسان** بودند.
#
# ⚠️ مبنای تشخیص عوض شد.
#
#    پیش‌تر `/fire-department` سنجیده می‌شد چون فقط در `suite` بار
#    می‌شد.  آن ماژول کاملاً حذف شده (مهاجرت ۰۵۶)، پس حالا در **هیچ**
#    نمایه‌ای نیست و این بررسی همیشه رد می‌شد — یعنی هرگز اجرا
#    نمی‌شد و کسی نمی‌فهمید.
#
#    `suite` دیگر ماژولِ اختصاصی ندارد؛ تنها تفاوتش این است که هم
#    `retail` دارد هم `restaurant`.  پس همان مبناست: فروشگاه اولی را
#    دارد و دومی را نه، رستوران برعکس، و فقط `suite` هر دو را دارد.
AUTH="Authorization: Bearer ${MOLIDO_TOKEN:-x}"
has_retail=$([ "$(curl -s -o /dev/null -w '%{http_code}' "$A/retail/parked" -H "$AUTH")" = "404" ] && echo no || echo yes)
has_resto=$([ "$(curl -s -o /dev/null -w '%{http_code}' "$A/restaurant/stats" -H "$AUTH")" = "404" ] && echo no || echo yes)

if [ "$has_retail" != "yes" ] || [ "$has_resto" != "yes" ]; then
  echo "  (نمایهٔ کامل نیست — بررسیِ هم‌گامی فقط روی MOLIDO_PRODUCT=suite اجرا می‌شود)"
else
  MOLIDO_API=$A npx tsx tools/generate-api-docs.ts --check >/tmp/apidocs.log 2>&1
  chk "بدون اختلاف" "$?" "0"
  [ -s /tmp/apidocs.log ] && grep -q '❌' /tmp/apidocs.log && cat /tmp/apidocs.log
fi

echo '--- ۳) ماژول‌های تازه مستند شده‌اند ---'
# همان چهارتایی که در نسخهٔ دست‌نویس جا مانده بودند.
for m in voice purchasing ration quick-keys; do
  n=$(grep -c "$m" API.md)
  chk "$m مستند است" "$([ "$n" -gt 0 ] && echo yes || echo no)" "yes"
done

echo '--- ۴) سند می‌گوید که ساخته می‌شود ---'
# بدون این هشدار، نفر بعدی دستی ویرایشش می‌کند و تغییرش با ساختِ بعدی
# از بین می‌رود.
chk "هشدار ویرایش دستی هست" \
  "$(grep -c 'ساخته می‌شود' API.md)" "1"

echo '--- ۵) شمار عملیات معقول است ---'
# اگر spec خالی برگردد، سند هم خالی ساخته می‌شود و «هم‌گام» می‌ماند —
# هم‌گامیِ دو چیز خالی.
ops=$(grep -cE '^\| (GET|POST|PATCH|PUT|DELETE) \|' API.md)
chk "بیش از ۳۰۰ عملیات" "$([ "$ops" -gt 300 ] && echo yes || echo no)" "yes"

rm -f /tmp/apidocs.log

echo
echo "PASS: $pass  FAIL: $fail"
[ $fail -eq 0 ]
