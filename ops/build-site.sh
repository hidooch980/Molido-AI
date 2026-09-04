#!/usr/bin/env bash
#
# ساختِ بستهٔ آپلودِ سایتِ ایستا برای cPanel.
#
#   bash ops/build-site.sh https://molido.ir/api https://molido.ir/panel
#
# ⚠️ چرا اسکریپت و نه «فایل‌ها را زیپ کن»؟
#
#    `config.js` باید پیش از آپلود درست شود.  اگر دستی انجام شود،
#    دیر یا زود کسی نسخهٔ توسعه را آپلود می‌کند و سایت به
#    `127.0.0.1` وصل می‌شود — خطایی که فقط در کنسولِ مرورگرِ
#    بازدیدکننده دیده می‌شود، نه در هیچ لاگی.
#
# ⚠️ نشانی‌ها **سنجیده** می‌شوند، نه فقط جای‌گذاری.
#
#    سه دام که هر کدام سایت را بی‌صدا می‌شکنند:
#      • `http` به‌جای `https` ⇒ مرورگر درخواست را مسدود می‌کند
#        (mixed content) و فرم بدونِ هیچ پیامی کار نمی‌کند.
#      • اسلشِ پایانی ⇒ نشانی `…/api//site/modules` می‌شود.
#      • گواهیِ خودامضا ⇒ `ERR_CERT_AUTHORITY_INVALID`، و کاتالوگ
#        هرگز بار نمی‌شود.

set -u

API="${1:-}"
PANEL="${2:-}"
# ⚠️ نشانیِ خودِ سایت — با نشانیِ API و پنل فرق دارد.
SITE="${3:-}"

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

[ -n "$API" ] || die "نشانیِ API را بدهید:
     bash ops/build-site.sh https://molido.ir/api https://molido.ir/panel"

PANEL="${PANEL:-${API%/api}/panel}"

# ---------------------------------------------------------------- ۱) سنجش
step "۱) بررسی نشانی‌ها"

for u in "$API" "$PANEL"; do
  case "$u" in
    https://*) ;;
    http://*)
      die "«$u» با http است.

     سایت روی https سرو می‌شود و مرورگر درخواست به نشانیِ ناامن را
     مسدود می‌کند.  فرم بی‌صدا کار نمی‌کند و خطا فقط در کنسول دیده
     می‌شود." ;;
    *) die "«$u» نشانیِ کامل نیست — با https:// شروع کنید" ;;
  esac
  case "$u" in
    */) die "«$u» اسلشِ پایانی دارد؛ برش دارید" ;;
  esac
done

printf '  API:   %s\n' "$API"
printf '  پنل:   %s\n' "$PANEL"

# ⚠️ در دسترس بودن **و** معتبر بودنِ گواهی، هر دو سنجیده می‌شوند.
#
#    `curl -k` گواهیِ بد را نادیده می‌گیرد؛ مرورگرِ بازدیدکننده
#    نمی‌گیرد.  پس بدونِ `-k` سنجیده می‌شود.
step "۲) دسترسیِ API از بیرون"
# ⚠️ `tail -1` لازم است.
#
#    با تغییرِ مسیر، `curl -w %{http_code}` برای **هر پرش** یک کد
#    چاپ می‌کند: خروجی `000000` شد که نه کدِ معتبری است نه قابلِ
#    مقایسه — و شرطِ `case` هیچ‌کدام از شاخه‌ها را نمی‌گرفت.
CODE=$(curl -sL -o /dev/null -w '%{http_code}
' --max-time 20 "$API/site/modules" 2>/dev/null | tail -1)
CODE=${CODE:-000}

case "$CODE" in
  200)
    N=$(curl -s --max-time 20 "$API/site/modules" | grep -o '"slug"' | wc -l | tr -d ' ')
    printf '  ✓ پاسخ داد — %s ماژول\n' "$N"
    [ "${N:-0}" -gt 0 ] || printf '  ⚠️ کاتالوگ خالی است؛ ماژولی در پایگاه‌داده ثبت نشده.\n'
    ;;
  503)
    printf '  ⚠️ ۵۰۳ — احتمالاً SHOP_COMPANY_ID روی سرور تنظیم نشده.\n'
    printf '     سایت بالا می‌آید ولی کاتالوگ خالی می‌ماند.\n'
    ;;
  000)
    printf '  ⚠️ پاسخ نداد.\n'
    printf '     یا سرور در دسترس نیست، یا گواهی معتبر نیست.\n'
    printf '     بررسی:\n'
    curl -s -o /dev/null -w '       با نادیده‌گرفتنِ گواهی: %{http_code}\n' -k --max-time 15 "$API/site/modules" 2>/dev/null || true
    printf '\n     اگر خط بالا ۲۰۰ است، مشکل **گواهی** است نه دسترسی:\n'
    printf '     مرورگر بازدیدکننده درخواست را مسدود می‌کند و کاتالوگ\n'
    printf '     هرگز بار نمی‌شود.  اول دامنه و گواهی را درست کنید:\n'
    printf '       bash ops/set-domain.sh molido.ir\n'
    ;;
  *)
    printf '  ⚠️ پاسخ %s — انتظار ۲۰۰ بود.\n' "$CODE"
    ;;
esac

# ---------------------------------------------------------------- ۳) ساخت
step "۳) ساختِ بسته"

OUT="dist-site"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r site/. "$OUT"/

# `config.js` بازنویسی می‌شود — نه ویرایشِ درجا، تا هیچ باقی‌مانده‌ای
# از نسخهٔ توسعه نماند.
cat > "$OUT/assets/config.js" <<CFG
/*
 * پیکربندیِ سایت — **ساختهٔ ماشین**، دستی ویرایش نکنید.
 *
 *   bash ops/build-site.sh <api> <panel>
 *
 * ویرایشِ دستی یعنی ساختِ بعدی بازنویسی‌اش می‌کند و تغییرتان گم
 * می‌شود، بی‌آنکه چیزی بگوید.
 */
window.MOLIDO_CONFIG = {
  apiBase: '$API',
  panelUrl: '$PANEL',
};
CFG

# نشانیِ واقعی در robots و sitemap
# ⚠️ نشانیِ **سایت**، نه نشانیِ پنل.
#
#    نسخهٔ اول این را از $PANEL می‌گرفت.  با تقسیمِ دامنه
#    (molido.ir سایت، app.molido.ir پنل) نتیجه‌اش این شد که
#    canonical و نقشهٔ سایت به app.molido.ir اشاره کنند — یعنی
#    موتور جست‌وجو سایت را زیرِ دامنه‌ای ایندکس می‌کرد که اصلاً
#    سایت نیست.
#
#    وقتی داده نشود، از نشانیِ API مشتق می‌شود و پیشوندِ app. — اگر
#    باشد — برداشته می‌شود.  حدس است، پس چاپ می‌شود تا دیده شود.
if [ -n "$SITE" ]; then
  HOSTONLY=$(printf '%s' "$SITE" | sed -E 's|^(https://[^/]+).*|\1|')
else
  HOSTONLY=$(printf '%s' "$API" | sed -E 's|^https://(app\.)?([^/]+).*|https://\2|')
  printf '  ⚠️ نشانیِ سایت داده نشد؛ حدس: %s
' "$HOSTONLY"
  printf '     اگر درست نیست، آرگومانِ سوم را بدهید.
'
fi
printf '  سایت: %s
' "$HOSTONLY"
sed -i "s|https://molido.ir|$HOSTONLY|g" "$OUT/robots.txt" "$OUT/sitemap.xml" 2>/dev/null || true

# ⚠️ ارجاعِ باقی‌مانده به `molido.ir` در HTML هم درست می‌شود، وگرنه
#    `canonical` و OpenGraph به دامنهٔ دیگری اشاره می‌کنند.
for f in "$OUT"/*.html; do
  sed -i "s|https://molido.ir|$HOSTONLY|g" "$f" 2>/dev/null || true
done

# ---------------------------------------------------------------- ۴) وارسی
step "۴) وارسیِ بسته"

FAIL=0
check() {
  if [ "$2" = "$3" ]; then printf '  OK   %s\n' "$1"
  else printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; FAIL=$((FAIL+1)); fi
}

for f in index.html track.html result.html robots.txt sitemap.xml \
         assets/style.css assets/app.js assets/config.js; do
  check "$f هست" "$([ -f "$OUT/$f" ] && echo yes || echo no)" "yes"
done

# ⚠️ مهم‌ترین سنجه: هیچ نشانیِ محلی نباید در بسته بماند.
LOCAL=$(grep -rl "127\.0\.0\.1\|localhost" "$OUT" 2>/dev/null | wc -l | tr -d ' ')
check "بدونِ نشانیِ محلی" "$LOCAL" "0"

check "apiBase درست نشسته" \
  "$(grep -c "apiBase: '$API'" "$OUT/assets/config.js")" "1"

[ "$FAIL" -eq 0 ] || die "$FAIL ایراد در بسته"

# ---------------------------------------------------------------- ۵) زیپ
step "۵) بسته‌بندی"

# ⚠️ `zip` روی همهٔ دستگاه‌ها نیست؛ `tar` هست.
#    cPanel هر دو را با Extract باز می‌کند.
ARCHIVE=""
rm -f molido-site.zip molido-site.tar.gz
if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT" && zip -qr ../molido-site.zip . ) && ARCHIVE=molido-site.zip
elif command -v tar >/dev/null 2>&1; then
  tar czf molido-site.tar.gz -C "$OUT" . && ARCHIVE=molido-site.tar.gz
fi

if [ -n "$ARCHIVE" ]; then
  printf '  %s  (%s)
' "$ARCHIVE" "$(du -h "$ARCHIVE" 2>/dev/null | cut -f1)"
else
  printf '  ⚠️ نه zip و نه tar — پوشهٔ %s/ را مستقیم آپلود کنید.
' "$OUT"
fi

printf '\n  ✓ آماده است.\n\n'
printf '  در cPanel:\n'
printf '    ۱. File Manager → public_html\n'
printf '    ۲. محتویاتِ %s را آپلود کنید (یا %s را آپلود و Extract).\n' "$OUT/" "${ARCHIVE:-—}"
printf '    ۳. مطمئن شوید index.html در ریشهٔ public_html است، نه در زیرپوشه.\n\n'
printf '  ⚠️ فایل‌های قدیمیِ cPanel (index.php پیش‌فرض) را پاک کنید،\n'
printf '     وگرنه سرور ممکن است آن را به‌جای index.html نشان دهد.\n'
