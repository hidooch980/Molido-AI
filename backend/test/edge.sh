#!/usr/bin/env bash
#
# مسیریابیِ زیردامنه‌ها — با Caddyِ واقعی، نه فقط `caddy validate`.
#
# ⚠️ چرا اعتبارسنجی کافی نیست، و این را گران یاد گرفتیم.
#
#    نسخهٔ اول `Caddyfile.subdomains` کاملاً **معتبر** بود و
#    `caddy validate` سبز می‌داد.  ولی بلوک‌های زیردامنه دستورِ tls
#    نداشتند، پس Caddy می‌رفت سراغ Let's Encrypt، چالش شکست می‌خورد
#    (سرور از بیرون در دسترس نیست) و آن زیردامنه‌ها **هیچ گواهی‌ای**
#    نمی‌گرفتند — یعنی کاملاً از دسترس خارج، نه یک هشدارِ مرورگر.
#
#    فقط اجرای واقعی نشانش داد.
#
# ⚠️ و سنجهٔ اصلی: هر زیردامنه به بک‌اندِ **خودش** برسد.
#
#    هر دو پروژه سرویسی به نامِ `backend` دارند.  روی شبکهٔ مشترک،
#    `backend` به یکی از دو کانتینر حل می‌شود و کدام‌یک به ترتیبِ بالا
#    آمدن بستگی دارد — یعنی زیردامنهٔ فروشگاه گاهی دادهٔ رستوران را
#    نشان می‌دهد، بی‌آنکه چیزی خطا بدهد.  تنها راهِ گرفتنش همین است.

cd "$(dirname "$0")/../.." || exit 1

PORT=${MOLIDO_EDGE_TEST_PORT:-18443}
NAME=molido-edge-test

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

skip() {
  # ⚠️ رد شدن **صریح** است، نه سبزِ خاموش.  اگر بی‌صدا رد می‌شد، در
  #    نصبِ تک‌محصولی گزارشِ سبز می‌داد و کسی نمی‌فهمید که این نگهبان
  #    اصلاً اجرا نشده.
  echo "  $1 — از این مجموعه گذشتیم"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
}

docker image inspect caddy:2-alpine >/dev/null 2>&1 || skip "تصویر caddy:2-alpine نیست"
[ -f Caddyfile.subdomains ] || skip "Caddyfile.subdomains نیست"

# هر دو محصول باید بالا باشند، وگرنه سنجهٔ «به بک‌اندِ درست می‌رسد»
# معنایی ندارد.
docker ps --format '{{.Names}}' | grep -q '^molido-store-backend' || skip "فروشگاه بالا نیست"
docker ps --format '{{.Names}}' | grep -q '^molido-resto-backend' || skip "رستوران بالا نیست"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; }
trap cleanup EXIT
cleanup

docker network inspect molido_edge >/dev/null 2>&1 || docker network create molido_edge >/dev/null

# کانتینرها باید روی شبکهٔ مشترک باشند؛ وگرنه Caddy نمی‌بیندشان.
ON_EDGE=$(docker network inspect molido_edge --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)
printf '%s' "$ON_EDGE" | grep -q 'store-backend' && printf '%s' "$ON_EDGE" | grep -q 'resto-backend' \
  || skip "کانتینرها به molido_edge وصل نیستند (پوششِ edge-store/edge-resto را بالا بیاورید)"

ROOT=$(pwd -W 2>/dev/null || pwd)
MSYS_NO_PATHCONV=1 docker run -d --name "$NAME" --network molido_edge \
  -e MOLIDO_HOST=127.0.0.1 \
  -e MOLIDO_TLS="tls internal" \
  -e MOLIDO_ACME="" \
  -e MOLIDO_TLS_SUB="tls internal" \
  -e MOLIDO_HOST_STORE=shop.test.invalid \
  -e MOLIDO_HOST_RESTO=cafe.test.invalid \
  -p "$PORT:443" \
  -v "$ROOT/Caddyfile.subdomains:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine >/dev/null 2>&1 || skip "Caddy بالا نیامد (پورت $PORT اشغال است؟)"

for _ in $(seq 20); do
  curl -sk -o /dev/null -m 3 "https://127.0.0.1:$PORT/" && break
  sleep 1
done

get() { curl -sk -o /dev/null -w '%{http_code}' -m 20 -H "Host: $1" "https://127.0.0.1:$PORT$2"; }
size() { curl -sk -o /dev/null -w '%{size_download}' -m 20 -H "Host: $1" "https://127.0.0.1:$PORT$2"; }

echo '--- ۱) هیچ تماسی با Let'"'"'s Encrypt نیست ---'
# ⚠️ **سنجه‌ای که آن اشکالِ خاموش را می‌گیرد.**
#
#    اگر دستورِ tls از بلوک‌های زیردامنه برداشته شود، اینجا لاگِ ACME
#    ظاهر می‌شود — و در تولید یعنی زیردامنه بی‌گواهی و از دسترس خارج.
sleep 3
chk "لاگِ ACME خالی است" "$(docker logs "$NAME" 2>&1 | grep -ci 'acme')" "0"

echo '--- ۲) هر زیردامنه به بک‌اندِ خودش می‌رسد ---'
#
# ⚠️ `/restaurant/tables` تمایزدهنده است: در نمایهٔ رستوران هست
#    (۴۰۱ بدونِ توکن) و در نمایهٔ فروشگاه نیست (۴۰۴).
chk "زیردامنهٔ فروشگاه ⇒ بک‌اندِ فروشگاه" "$(get shop.test.invalid /api/restaurant/tables)" "404"
chk "زیردامنهٔ رستوران ⇒ بک‌اندِ رستوران" "$(get cafe.test.invalid /api/restaurant/tables)" "401"

# هر دو باید بک‌اندِ سالمی داشته باشند — ۴۰۱ یعنی رسید و احراز خواست.
chk "فروشگاه پاسخ می‌دهد" "$(get shop.test.invalid /api/products)" "401"
chk "رستوران پاسخ می‌دهد" "$(get cafe.test.invalid /api/products)" "401"

echo '--- ۳) نشانیِ پایه هم کار می‌کند ---'
# ⚠️ اگر صدور گواهی برای زیردامنه‌ها شکست بخورد، این تنها راهِ ورود
#    است.  نباید هرگز از دست برود.
chk "پایه = محصولِ پیش‌فرض (فروشگاه)" "$(get 127.0.0.1 /api/restaurant/tables)" "404"

echo '--- ۴) میزبانِ ناشناخته ---'
# ⚠️ سنجه روی **بدنه** است، نه کدِ وضعیت.
#
#    انتظارِ اولیه ۴۰۴ بود و غلط از آب درآمد: Caddy برای میزبانِ
#    بی‌بلوک **۲۰۰ با بدنهٔ خالی** می‌دهد.  کدِ وضعیت اینجا چیزی
#    نمی‌گوید؛ آنچه اهمیت دارد این است که هیچ محصولی پاسخ نداده.
#
#    بک‌اندِ واقعی همیشه بدنه دارد (۴۰۱ هم JSON برمی‌گرداند)، پس
#    بدنهٔ صفر یعنی درخواست به هیچ‌کدام نرسیده.
chk "میزبانِ ناشناس به محصولی نمی‌رسد" \
  "$(size who.knows.invalid /api/restaurant/tables)" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
