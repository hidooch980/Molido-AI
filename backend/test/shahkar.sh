#!/usr/bin/env bash
#
# سامانه شاهکار — تطبیقِ شمارهٔ موبایل با کد ملی.
#
# ⚠️ سنجهٔ اصلیِ این فایل «تطبیقِ درست تأیید شود» **نیست**.
#
#    آن حالتِ ساده است.  چیزی که واقعاً می‌شکند این است:
#
#      • در دسترس نبودنِ سرویس به «کد ملی جعلی است» ترجمه شود ⇒
#        کاربرِ درست بیرون می‌ماند و علتش هیچ‌جا پیدا نیست.
#      • یا برعکس: قطعیِ سرویس به «تأیید شد» ترجمه شود ⇒ احرازِ
#        هویت به‌کلی دور می‌خورد و هیچ‌کس نمی‌فهمد.
#
#    پس بدلِ شاهکار عمداً می‌تواند خراب باشد، و هر سه حالت سنجیده
#    می‌شود.
#
# ⚠️ سنجهٔ دوم: کدِ ملیِ بدریخت نباید هزینهٔ استعلام بدهد.
#
#    شمارندهٔ تماس‌های بدل خوانده می‌شود تا اثبات شود اعتبارسنجیِ
#    محلی واقعاً جلوی تماس را می‌گیرد — نه اینکه فقط پیامِ خطا عوض شود.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JS="Content-Type: application/json"
PW=${MOLIDO_ADMIN_PASSWORD:-Admin@123456}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق — سرویس روی $A پاسخ نمی‌دهد یا سقف ورود خورده"
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi
AU="Authorization: Bearer $T"

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
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q -c \
    "DELETE FROM \"ShahkarVerification\" WHERE \"nationalCode\" IN ('0499370899','0790419904');" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

# ─────────────────── ۰) سرویس فعال است؟ ───────────────────
ST=$(curl -s "$A/shahkar/status" -H "$AU")
CONFIGURED=$(printf '%s' "$ST" | P "str(d.get('configured')).lower()")

if [ "$CONFIGURED" != "true" ]; then
  echo "  شاهکار پیکربندی نشده — SHAHKAR_URL/SHAHKAR_TOKEN در .env نیست"
  echo "  (برای آزمون:  SHAHKAR_URL=http://host.docker.internal:8898/shahkar/verify"
  echo "                SHAHKAR_TOKEN=fake-token)"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

# بدل را بالا می‌آوریم اگر نیست.
SPORT=$(grep -E '^SHAHKAR_URL=' .env 2>/dev/null | grep -oE ':[0-9]+' | tr -d ':')
CTL="http://localhost:${SPORT:-8898}/__control"
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -X POST "$CTL" -H "$JS" -d '{"mode":"ok"}')" != "200" ]; then
  python3 backend/test/lib/fake-shahkar.py "${SPORT:-8898}" >/dev/null 2>&1 &
  FAKE_PID=$!
  trap 'cleanup; kill '"$FAKE_PID"' 2>/dev/null' EXIT
  for _ in 1 2 3 4 5; do
    sleep 1
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -X POST "$CTL" -H "$JS" -d '{"mode":"ok"}')" = "200" ] && break
  done
fi

if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$CTL" -H "$JS" -d '{"mode":"ok","reset":true}')" != "200" ]; then
  echo "  ✗ سامانهٔ ساختگی روی $CTL پاسخ نمی‌دهد"
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi

V() {
  curl -s -X POST "$A/shahkar/verify" -H "$AU" -H "$JS" \
    -d "{\"nationalCode\":\"$1\",\"mobile\":\"$2\"${3:+,\"refresh\":true}}"
}
calls() { curl -s "$CTL" | P "d['calls']"; }

echo '--- ۱) اعتبارسنجیِ محلی، پیش از تماس ---'
BEFORE=$(calls)

# ⚠️ رقمِ کنترلیِ غلط باید **محلی** رد شود.
chk "کد ملی با رقم کنترلی غلط ۴۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shahkar/verify" -H "$AU" -H "$JS" \
     -d '{"nationalCode":"1234567890","mobile":"09121234567"}')" "400"
chk "کد ملی تک‌رقمی تکراری ۴۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shahkar/verify" -H "$AU" -H "$JS" \
     -d '{"nationalCode":"1111111111","mobile":"09121234567"}')" "400"
chk "موبایل نامعتبر ۴۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shahkar/verify" -H "$AU" -H "$JS" \
     -d '{"nationalCode":"0499370899","mobile":"12345"}')" "400"

# ⚠️ همان سنجه‌ای که ادعا را واقعاً اثبات می‌کند: هیچ تماسی نرفته.
chk "هیچ استعلامی مصرف نشد" "$(calls)" "$BEFORE"

echo '--- ۲) تطبیق ---'
chk "شمارهٔ درست تطبیق دارد" "$(V 0499370899 09121234567 | P "d['outcome']")" "MATCHED"
chk "شمارهٔ دیگری تطبیق ندارد" "$(V 0499370899 09129998877 | P "d['outcome']")" "NOT_MATCHED"

echo '--- ۳) حافظه ---'
BEFORE=$(calls)
chk "پاسخ از حافظه می‌آید" "$(V 0499370899 09121234567 | P "d['outcome']")" "MATCHED"
chk "استعلام دوباره نرفت" "$(calls)" "$BEFORE"
chk "با refresh دوباره می‌رود" \
  "$(V 0499370899 09121234567 x >/dev/null; [ "$(calls)" -gt "$BEFORE" ] && echo yes || echo no)" "yes"

chk "نتیجه در پایگاه‌داده نشست" \
  "$(Q "SELECT outcome FROM \"ShahkarVerification\" WHERE \"nationalCode\"='0499370899' AND mobile='09121234567';")" "MATCHED"

echo '--- ۴) سرویس در دسترس نیست ---'
# ⚠️ **مهم‌ترین بخشِ فایل.**
curl -s -o /dev/null -X POST "$CTL" -H "$JS" -d '{"mode":"down"}'
OUT=$(V 0790419904 09129998877)
chk "قطعیِ سرویس ⇒ UNKNOWN، نه NOT_MATCHED" "$(printf '%s' "$OUT" | P "d['outcome']")" "UNKNOWN"

# ⚠️ و نتیجهٔ نامعلوم **ذخیره نمی‌شود** — وگرنه یک اختلالِ گذرا برای
#    همیشه در پرونده می‌ماند و تلاشِ بعدی هم همان را می‌خواند.
chk "نتیجهٔ نامعلوم ذخیره نشد" \
  "$(Q "SELECT count(*) FROM \"ShahkarVerification\" WHERE \"nationalCode\"='0790419904';")" "0"

echo '--- ۵) پاسخِ بدریخت ---'
curl -s -o /dev/null -X POST "$CTL" -H "$JS" -d '{"mode":"garbage"}'
chk "پاسخِ بی‌فیلدِ نتیجه ⇒ UNKNOWN" \
  "$(V 0790419904 09129998877 | P "d['outcome']")" "UNKNOWN"

curl -s -o /dev/null -X POST "$CTL" -H "$JS" -d '{"mode":"ok"}'

echo '--- ۶) اعمال در کالابرگ ---'
NC_OK=0499370899
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "DELETE FROM \"RationAccount\" WHERE \"nationalCode\" IN ('$NC_OK','0790419904');" >/dev/null 2>&1

# ⚠️ شمارهٔ نادرست باید رد شود — این کلِ دلیلِ وجودِ شاهکار در کالابرگ
#    است: سهمیه به کد ملی بسته است.
chk "کالابرگ با شمارهٔ نادرست رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/ration/accounts" -H "$AU" -H "$JS" \
     -d "{\"nationalCode\":\"$NC_OK\",\"holderName\":\"SHTEST\",\"phone\":\"09129998877\"}")" "400"

chk "کالابرگ با شمارهٔ درست ساخته می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/ration/accounts" -H "$AU" -H "$JS" \
     -d "{\"nationalCode\":\"$NC_OK\",\"holderName\":\"SHTEST\",\"phone\":\"09121234567\"}")" "201"

# ⚠️ کدِ ملیِ بی‌معنا هم رد می‌شود، جدا از شاهکار.
chk "کالابرگ با کد ملی بدریخت رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/ration/accounts" -H "$AU" -H "$JS" \
     -d '{"nationalCode":"1234567890","holderName":"SHTEST","phone":"09121234567"}')" "400"

$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "DELETE FROM \"RationAccount\" WHERE \"holderName\"='SHTEST';" >/dev/null 2>&1

echo '--- ۷) مسیرِ استعلام عمومی نیست ---'
# ⚠️ مسیرِ باز یعنی هرکسی می‌تواند بفهمد فلان شماره به نامِ کدام کد
#    ملی است — خودِ سرویس ابزارِ نشتِ هویت می‌شود.
chk "بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/shahkar/verify" -H "$JS" \
     -d '{"nationalCode":"0499370899","mobile":"09121234567"}')" "401"
chk "وضعیت بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/shahkar/status")" "401"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
