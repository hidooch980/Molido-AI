#!/usr/bin/env bash
#
# اعتبارِ پیکربندیِ Caddy — پیش از آنکه سایت را بخواباند.
#
# ⚠️ این خرابی **یک بار روی سرورِ زنده اتفاق افتاد** و درسش گران بود.
#
#    `{$VAR} { ... }` وقتی متغیر تهی باشد به «بلوکِ بدون نشانی» تبدیل
#    می‌شود و Caddy کلِ فایل را رد می‌کند.  خطایش
#    (`server block without any key`) هیچ اشاره‌ای به متغیرِ خالی
#    ندارد، و نتیجه‌اش سایتِ کاملاً از دسترس خارج است — نه یک هشدار.
#
# ⚠️ و نکتهٔ ظریفی که تازه سنجیده شد:
#
#    پیش‌فرضِ `{$VAR:x}` برای متغیرِ **تهی** اعمال **نمی‌شود**، فقط
#    برای **تعریف‌نشده**.  و `docker compose` با الگوی معمولِ
#    `${VAR:-}` دقیقاً متغیرِ تهی می‌سازد.  یعنی نوشتنِ الگوی رایج،
#    سایت را می‌خواباند.
#
#    پس هر سه حالت اینجا سنجیده می‌شوند، نه فقط حالتِ درست.

cd "$(dirname "$0")/../.." || exit 1

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

if ! docker image inspect caddy:2-alpine >/dev/null 2>&1; then
  # ⚠️ نبودِ تصویر «سبز» شمرده نمی‌شود.
  #
  #    اگر بی‌صدا رد می‌شد، در محیطی که تصویر را ندارد گزارشِ سبز
  #    می‌داد و کسی نمی‌فهمید که این نگهبان اصلاً اجرا نشده.
  echo "  تصویر caddy:2-alpine نیست — از این مجموعه گذشتیم"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

# مسیرِ ویندوزی برای mount؛ روی لینوکس `pwd -W` نیست و `pwd` کافی است.
ROOT=$(pwd -W 2>/dev/null || pwd)

# خروجی: `valid` یا `invalid`.  دلیلِ خطا مهم نیست، معتبر بودن مهم است.
validate() {
  file=$1
  shift
  out=$(MSYS_NO_PATHCONV=1 docker run --rm \
    -e MOLIDO_HOST=194.5.176.140 \
    -e MOLIDO_TLS="tls internal" \
    -e MOLIDO_ACME="" \
    "$@" \
    -v "$ROOT/$file:/etc/caddy/Caddyfile:ro" \
    caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1)
  printf '%s' "$out" | grep -q 'Valid configuration' && echo valid || echo invalid
}

echo '--- ۱) پیکربندیِ تک‌دامنه ---'
chk "Caddyfile معتبر است" "$(validate Caddyfile)" "valid"

if [ -f Caddyfile.subdomains ]; then
  echo '--- ۲) پیکربندیِ چندزیردامنه ---'
  chk "با زیردامنه‌های واقعی معتبر است" \
    "$(validate Caddyfile.subdomains -e MOLIDO_HOST_STORE=shop.molido.ir -e MOLIDO_HOST_RESTO=cafe.molido.ir)" "valid"

  # ⚠️ حالتی که سایت را خواباند: متغیر **تهی**، نه تعریف‌نشده.
  chk "متغیرِ تهی پیکربندی را باطل می‌کند (رفتارِ شناخته‌شدهٔ Caddy)" \
    "$(validate Caddyfile.subdomains -e MOLIDO_HOST_STORE= -e MOLIDO_HOST_RESTO=)" "invalid"

  chk "پیش‌فرضِ .invalid نجاتش می‌دهد" \
    "$(validate Caddyfile.subdomains -e MOLIDO_HOST_STORE=store.invalid -e MOLIDO_HOST_RESTO=resto.invalid)" "valid"

  # ⚠️ **سنجهٔ اصلی.**  آنچه واقعاً اجرا می‌شود، compose تولیدش می‌کند.
  #
  #    سه سنجهٔ بالا دربارهٔ خودِ Caddyfile‌اند.  این یکی می‌سنجد که
  #    `docker-compose.edge-caddy.yml` مقدارِ **تهی** پاس ندهد — همان
  #    اشتباهی که کلِ زنجیره را می‌شکند و در فایلِ Caddy دیده نمی‌شود.
  EMPTY=$(docker compose -f docker-compose.yml -f docker-compose.store.yml \
            -f docker-compose.vps.yml -f docker-compose.edge-caddy.yml config 2>/dev/null \
          | grep -E 'MOLIDO_HOST_(STORE|RESTO):' | grep -cE ':\s*""?\s*$')
  chk "compose متغیرِ تهی پاس نمی‌دهد" "${EMPTY:-0}" "0"
fi

echo
echo '--- ۳) نشانیِ API هر محصول ---'
#
# ⚠️ این ایراد **بی‌صدا** است و یک بار در همین کار پیدا شد.
#
#    Next.js نشانیِ API را در زمانِ **ساخت** داخلِ باندل می‌نویسد.
#    `docker-compose.resto.yml` آن را روی `localhost:3200` ثابت کرده
#    — درست برای محلی، ولی روی زیردامنه یعنی مرورگرِ **مشتری** به
#    `localhost` خودش وصل شود.
#
#    پنل بالا می‌آید، ظاهرش سالم است، و خطایش CORS است — که هیچ
#    ربطی به زیردامنه ندارد و آدم دنبالِ اشتباهی می‌گردد.
#
#    اینجا فقط پیکربندی سنجیده می‌شود (ارزان)، نه ساختِ واقعی.
for pair in "store:MOLIDO_HOST_STORE:shop.test.invalid" "resto:MOLIDO_HOST_RESTO:cafe.test.invalid"; do
  prod=${pair%%:*}
  rest=${pair#*:}
  var=${rest%%:*}
  host=${rest#*:}

  CFG=$(env "$var=$host" docker compose \
        -f docker-compose.yml -f "docker-compose.$prod.yml" \
        -f "docker-compose.edge-$prod.yml" config 2>/dev/null)

  # هر ارجاعِ NEXT_PUBLIC_API_URL باید زیردامنه باشد — هم آرگومانِ
  # ساخت، هم متغیرِ زمانِ اجرا.  یکی‌شان کافی نیست.
  BAD=$(printf '%s' "$CFG" | grep 'NEXT_PUBLIC_API_URL' | grep -cv "$host")
  chk "$prod: نشانیِ API همه‌جا زیردامنه است" "${BAD:-1}" "0"

  # ⚠️ و نشانیِ بازگشتِ درگاه.  اگر زیردامنه نباشد، مشتری پس از
  #    پرداخت جای دیگری برمی‌گردد: پول کم می‌شود و سفارش «در انتظار».
  SITE=$(printf '%s' "$CFG" | grep -c "SITE_URL: https://$host")
  chk "$prod: نشانیِ بازگشتِ درگاه درست است" "$([ "${SITE:-0}" -gt 0 ] && echo yes || echo no)" "yes"
done

printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
