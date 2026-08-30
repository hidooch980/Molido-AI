#!/usr/bin/env bash
#
# فروشِ ماژول از سایتِ معرفی.
#
# ⚠️ سنجهٔ اصلیِ این فایل: **کم‌پرداختی رد شود**.
#
#    درگاه فقط می‌گوید «تراکنش موفق بود».  اگر مبلغ سنجیده نشود،
#    سفارشِ ۵۸ میلیونی با پرداختِ ۱۰۰۰ ریال تأیید می‌شود.
#
#    این دقیقاً اتفاق افتاد: `zarinpal.gateway` مبلغِ **درخواستی** را
#    برمی‌گرداند نه مبلغِ پاسخ، پس نگهبان عدد را با خودش می‌سنجید و
#    همیشه برابر بود.  فروشگاه هم همین ایراد را داشت.
#
# ⚠️ سنجهٔ دوم: قیمت از پایگاه‌داده خوانده شود نه از درخواست.
#
#    کلاینت فقط `slug` می‌فرستد.  اگر مبلغ از بدنه پذیرفته شود، هر
#    خریدی رایگان است.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JS="Content-Type: application/json"

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    print('<<no-json:%d>>' % len(raw)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ماژول هسته است ولی بدونِ SHOP_COMPANY_ID کار نمی‌کند.
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$A/site/modules")
if [ "$CODE" = "503" ]; then
  echo "  SHOP_COMPANY_ID تنظیم نشده — از این مجموعه گذشتیم"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    DELETE FROM \"SitePurchase\" WHERE \"buyerName\" LIKE 'SITETEST%';
    DELETE FROM \"Lead\" WHERE name LIKE 'SITETEST%';" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

# ─────────────────────── درگاهِ ساختگی ───────────────────────
#
# ⚠️ **پیش از** هر سنجه‌ای بالا می‌آید، نه فقط برای بخشِ ۷.
#
#    نسخهٔ اول فقط در بخشِ ۷ روشنش می‌کرد، و بخش‌های ۳ تا ۵ — که
#    خودشان سفارش می‌سازند — با درگاهِ خاموش شش سنجه قرمز می‌دادند.
#    خرابی‌ای که ربطی به کدِ محصول نداشت و وقت می‌گرفت تا فهمیده شود.
ZBASE="${ZARINPAL_BASE_URL:-$(grep -E '^ZARINPAL_BASE_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')}"
FAKE=$(printf '%s' "$ZBASE" | grep -oE '[0-9]+$')
CTL=""
if [ -n "$FAKE" ]; then
  CTL="http://localhost:$FAKE/__control"
  # اگر بالا نیست، خودمان بالا می‌آوریم — «یادم رفت سرور را روشن کنم»
  # نباید به شکستِ سنجه ترجمه شود.
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -X POST "$CTL" -H "$JS" -d '{"underpay":false}')" != "200" ]; then
    python3 backend/test/lib/fake-zarinpal.py "$FAKE" >/dev/null 2>&1 &
    FAKE_PID=$!
    trap 'cleanup; kill '"$FAKE_PID"' 2>/dev/null' EXIT
    for _ in 1 2 3 4 5; do
      sleep 1
      [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -X POST "$CTL" -H "$JS" -d '{"underpay":false}')" = "200" ] && break
    done
  fi
fi

echo '--- ۱) کاتالوگ ---'
chk "کاتالوگ ۲۰۰ می‌دهد" "$CODE" "200"
N=$(curl -s "$A/site/modules" | P "len(d)")
chk "دست‌کم یک ماژول دارد" "$([ "${N:-0}" -gt 0 ] && echo yes || echo no)" "yes"

# ⚠️ دو ماژولِ فعال با یک عنوان یعنی ایرادِ واقعی روی صفحهٔ فروش.
#
#    این واقعاً در تولید رخ داد: مهاجرت ۰۵۸ کاتالوگ را با اسلاگ‌های
#    خودش درج کرد در حالی که کاتالوگ پیش‌تر دستی ساخته شده بود.
#    `ON CONFLICT (companyId, slug)` فقط برخوردِ **اسلاگ** را می‌گیرد،
#    نه برخوردِ **معنا** — پس «انبار و خرید» دو بار، با دو قیمت،
#    روی صفحهٔ خرید نشست.  مشتری می‌توانست یکی را دو بار بخرد.
#
#    هیچ‌چیز اعتراض نکرد؛ فقط با نگاه کردن به خروجیِ API دیده شد.
chk "ماژولِ هم‌عنوان تکراری نیست" \
  "$(curl -s "$A/site/modules" | P "len(d) - len({m['title'] for m in d})")" "0"

# و اسلاگ هم — همان چیزی که مهاجرت رویش تکیه کرده بود.
chk "اسلاگ تکراری نیست" \
  "$(curl -s "$A/site/modules" | P "len(d) - len({m['slug'] for m in d})")" "0"

SLUG=$(curl -s "$A/site/modules" | P "d[0]['slug']")
PRICE=$(curl -s "$A/site/modules" | P "d[0]['priceIrr']")

echo '--- ۲) اعتبارسنجی ---'
chk "بدون ماژول رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/site/purchase" -H "$JS" -d '{"name":"SITETEST","phone":"09120000001","slugs":[]}')" "400"
chk "موبایل نامعتبر رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/site/purchase" -H "$JS" -d "{\"name\":\"SITETEST\",\"phone\":\"123\",\"slugs\":[\"$SLUG\"]}")" "400"
chk "بدون نام رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/site/purchase" -H "$JS" -d "{\"phone\":\"09120000001\",\"slugs\":[\"$SLUG\"]}")" "400"

# ⚠️ اسلاگِ ناشناخته نباید بی‌صدا حذف شود: کاربر سه ماژول انتخاب
#    می‌کند، دو تا حساب می‌شود، و فاکتورش کمتر از انتظارش درمی‌آید.
chk "اسلاگ ناشناخته رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/site/purchase" -H "$JS" -d "{\"name\":\"SITETEST\",\"phone\":\"09120000001\",\"slugs\":[\"$SLUG\",\"no-such-module\"]}")" "400"

echo '--- ۳) قیمت از پایگاه‌داده، نه از درخواست ---'
R=$(curl -s -X POST "$A/site/purchase" -H "$JS" \
    -d "{\"name\":\"SITETEST-price\",\"phone\":\"09120000002\",\"slugs\":[\"$SLUG\"],\"amountIrr\":1000,\"amount\":1000,\"priceIrr\":1000}")
GOT=$(printf '%s' "$R" | P "d.get('amountIrr','?')")
chk "مبلغِ تحمیلی نادیده گرفته می‌شود" "$GOT" "$PRICE"

TC=$(printf '%s' "$R" | P "d.get('trackingCode','')")
chk "کد رهگیری برمی‌گردد" "$([ -n "$TC" ] && echo yes || echo no)" "yes"

# ⚠️ کد باید حدس‌ناپذیر باشد — با کدِ ترتیبی هرکس سفارشِ دیگران را
#    می‌خواند، چون پیگیری توکن نمی‌خواهد.
SUF=${TC#MO-}
chk "کد فقط رقم نیست" \
  "$(printf '%s' "$SUF" | grep -qE '^[0-9]+$' && echo digits || echo mixed)" "mixed"
chk "کد دست‌کم ۱۰ نویسه است" "$([ "${#SUF}" -ge 10 ] && echo yes || echo no)" "yes"

echo '--- ۴) ذخیره‌سازی ---'
chk "سفارش PENDING ثبت شد" \
  "$(Q "SELECT status FROM \"SitePurchase\" WHERE \"trackingCode\"='$TC';")" "PENDING"
chk "مبلغِ ذخیره‌شده درست است" \
  "$(Q "SELECT round(\"amountIrr\")::bigint FROM \"SitePurchase\" WHERE \"trackingCode\"='$TC';")" "$PRICE"
chk "سرنخ CRM ساخته شد" \
  "$(Q "SELECT count(*) FROM \"Lead\" WHERE name='SITETEST-price' AND source='WEBSITE';")" "1"

echo '--- ۵) پیگیریِ عمومی ---'
TRACK=$(curl -s "$A/site/purchase/$TC")
chk "پیگیری بدون توکن ۲۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/site/purchase/$TC")" "200"

# ⚠️ آنچه **نباید** برگردد: دانستنِ کد یعنی «من همان خریدارم»، نه
#    دسترسی به پروندهٔ کامل.
chk "تلفن خریدار بیرون نمی‌رود" "$(printf '%s' "$TRACK" | P "'yes' if 'buyerPhone' in d else 'no'")" "no"
chk "ایمیل بیرون نمی‌رود"      "$(printf '%s' "$TRACK" | P "'yes' if 'buyerEmail' in d else 'no'")" "no"
chk "شناسهٔ درگاه بیرون نمی‌رود" "$(printf '%s' "$TRACK" | P "'yes' if 'paymentRef' in d else 'no'")" "no"
chk "شناسهٔ شرکت بیرون نمی‌رود"  "$(printf '%s' "$TRACK" | P "'yes' if 'companyId' in d else 'no'")" "no"
chk "کد نامعتبر ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/site/purchase/MO-does-not-exist")" "404"

echo '--- ۶) بازگشتِ جعلی ---'
chk "بازگشت با کدِ ناشناخته سفارشی نمی‌سازد" \
  "$(curl -s -o /dev/null "$A/site/purchase/callback?code=MO-ghost-$$"; Q "SELECT count(*) FROM \"SitePurchase\" WHERE \"trackingCode\"='MO-ghost-$$';")" "0"

# ─────────────────────────────────────────────────────────────────────
echo '--- ۷) مبلغِ پاسخِ درگاه ---'
#
# ⚠️ **مهم‌ترین بخشِ این فایل**، و تا امروز هرگز اجرا نشده بود.
#
#    سنجهٔ کم‌پرداختی به درگاهی نیاز دارد که بشود وادارش کرد دروغ
#    بگوید.  درگاهِ واقعی اعتبارنامهٔ پذیرنده می‌خواهد، پس این سنجه
#    عملاً روی هیچ ماشینی اجرا نمی‌شد — یعنی نگهبانِ گران‌بهایی داشتیم
#    که فقط روی کاغذ بود.
#
#    `lib/fake-zarinpal.py` همان درگاه است، با کلیدی که واداردش مبلغی
#    کمتر از آنچه گرفته گزارش کند.
# نشانیِ درگاه از `.env` خوانده می‌شود — همان چیزی که بک‌اند می‌بیند.
# پرسیدنش از محیطِ پوسته گمراه‌کننده بود: آنجا معمولاً تنظیم نیست.
if [ -z "$FAKE" ]; then
  echo "  ZARINPAL_BASE_URL به درگاهِ ساختگی اشاره نمی‌کند — از این بخش گذشتیم"
  echo "  (ZARINPAL_BASE_URL=http://host.docker.internal:8899 در .env)"
else
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$CTL" -H "$JS" -d '{"underpay":false}')" != "200" ]; then
    fail=$((fail+1)); printf '  FAIL درگاهِ ساختگی روی %s پاسخ نمی‌دهد\n' "$CTL"
  else
    mk() {
      curl -s -X POST "$A/site/purchase" -H "$JS" \
        -d "{\"name\":\"SITETEST-$1\",\"phone\":\"09120000003\",\"slugs\":[\"$SLUG\"]}" \
        | P "d.get('trackingCode','')"
    }

    # ۷الف) پرداختِ درست ⇒ PAID
    T_OK=$(mk ok)
    curl -s -o /dev/null "$A/site/purchase/callback?code=$T_OK"
    chk "پرداختِ کامل PAID می‌شود" \
      "$(Q "SELECT status FROM \"SitePurchase\" WHERE \"trackingCode\"='$T_OK';")" "PAID"
    chk "شمارهٔ پیگیریِ بانک ثبت شد" \
      "$(Q "SELECT count(*) FROM \"SitePurchase\" WHERE \"trackingCode\"='$T_OK' AND \"bankRef\" IS NOT NULL;")" "1"

    # ۷ب) درگاه «موفق» می‌گوید ولی مبلغ کمتر است ⇒ باید رد شود
    curl -s -o /dev/null -X POST "$CTL" -H "$JS" -d '{"underpay":true}'
    T_BAD=$(mk under)
    curl -s -o /dev/null "$A/site/purchase/callback?code=$T_BAD"
    curl -s -o /dev/null -X POST "$CTL" -H "$JS" -d '{"underpay":false}'

    chk "کم‌پرداختی PAID نمی‌شود" \
      "$(Q "SELECT status FROM \"SitePurchase\" WHERE \"trackingCode\"='$T_BAD';")" "FAILED"
    # ⚠️ نبودِ `bankRef` جداگانه سنجیده می‌شود: سفارشی که رد شده ولی
    #    شمارهٔ بانکی دارد، در گزارش‌ها «پرداخت‌شده» به نظر می‌رسد.
    chk "کم‌پرداختی شمارهٔ بانک نمی‌گیرد" \
      "$(Q "SELECT count(*) FROM \"SitePurchase\" WHERE \"trackingCode\"='$T_BAD' AND \"bankRef\" IS NOT NULL;")" "0"
  fi
fi

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
