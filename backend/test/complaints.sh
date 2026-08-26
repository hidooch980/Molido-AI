#!/usr/bin/env bash
#
# شکایات شهروندی — به‌ویژه پیگیریِ عمومی.
#
# ⚠️ چه چیزی خراب بود؟
#
#    `GET /complaints/track/:trackingNo` بدونِ ورود کار می‌کند — همان
#    امکانی که برای خودِ شهروند ساخته شده.  ولی **همیشه ۴۰۴ می‌داد**،
#    حتی برای کدِ معتبر: شهروند توکن ندارد، پس `app.company_id` تهی
#    می‌ماند و RLS با رفتار fail-closed هیچ سطری برنمی‌گرداند.
#
#    با `curl` روی سرویسِ در حال اجرا پیدا شد، نه با خواندنِ کد.
#
# ⚠️ کدِ رهگیری هم `137-<زمان>` بود — کاملاً قابلِ شمردن.
#
#    قید یکتایی `(companyId, trackingNo)` است نه سراسری، پس دو
#    شهرداری به‌سادگی کدِ یکسان می‌گرفتند.  بازکردنِ مسیر بدونِ رفعِ
#    این، درِ خواندنِ شکایاتِ همه را باز می‌کرد.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST $A/auth/login     -H 'Content-Type: application/json' -d '{"email":"admin@molido.ai","password":"'"$PW"'"}')
  case "$code" in
    000) echo "  ✗ ورود ناموفق — سرویس روی $A پاسخ نمی‌دهد" ;;
    401) echo "  ✗ ورود ناموفق — رمز نادرست است (MOLIDO_ADMIN_PASSWORD را بده)" ;;
    429) echo "  ✗ ورود ناموفق — سقف ورود خورده؛ چند دقیقه صبر کن" ;;
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از $A/auth/login" ;;
  esac
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ⚠️ ماژول شکایات فقط در قابلیتِ `municipal` است.
if [ "$(curl -s -o /dev/null -w '%{http_code}' "$A/complaints" -H "$AU")" = "404" ]; then
  echo "  ماژول شکایات در این محصول فعال نیست"
  echo "  برای آزمون: MOLIDO_PRODUCT=suite"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q \
    -c "DELETE FROM \"CitizenComplaint\" WHERE subject LIKE 'CMPTEST-%';" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

# ─── ثبت ───

R=$(curl -s -X POST "$A/complaints" -H "$AU" -H "$JS" \
    -d '{"subject":"CMPTEST-noise","category":"OTHER","citizenName":"Probe","citizenPhone":"09121230000","address":"Somewhere 12"}')
ID=$(printf '%s' "$R" | P "d.get('id','')")
TN=$(printf '%s' "$R" | P "d.get('trackingNo','')")

chk "شکایت ثبت شد" "$([ -n "$ID" ] && echo yes || echo no)" "yes"
chk "وضعیت اولیه REGISTERED" "$(printf '%s' "$R" | P "d.get('status','')")" "REGISTERED"
chk "کد رهگیری با ۱۳۷ شروع می‌شود" "$(printf '%s' "$TN" | cut -c1-4)" "137-"

# ⚠️ سنجهٔ اصلیِ حدس‌ناپذیری.
#
#    کدِ قبلی `137-<زمان>` بود: ۱۳ رقمِ پیاپی.  اگر کسی روزی به همان
#    برگردد، این سنجه می‌گیردش — چون بخشِ پس از خط تیره دیگر
#    فقط‌رقمی نخواهد بود.
SUFFIX=${TN#137-}
chk "بخش تصادفی فقط رقم نیست" \
  "$(printf '%s' "$SUFFIX" | grep -qE '^[0-9]+$' && echo digits || echo mixed)" "mixed"
chk "بخش تصادفی دست‌کم ۱۰ نویسه است" \
  "$([ "${#SUFFIX}" -ge 10 ] && echo yes || echo no)" "yes"

# دو شکایتِ پیاپی نباید کدِ یکسان بگیرند.
TN2=$(curl -s -X POST "$A/complaints" -H "$AU" -H "$JS" \
      -d '{"subject":"CMPTEST-second","category":"OTHER"}' | P "d.get('trackingNo','')")
chk "دو کدِ پیاپی یکسان نیستند" "$([ "$TN" != "$TN2" ] && echo yes || echo no)" "yes"

# ─── پیگیریِ عمومی: سنجهٔ اصلیِ این فایل ───
#
# ⚠️ **بدونِ سربرگِ احراز هویت** — دقیقاً همان‌طور که شهروند می‌زند.

echo '--- پیگیری عمومی ---'
TRACK=$(curl -s "$A/complaints/track/$TN")
chk "کد درست ۲۰۰ می‌دهد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/complaints/track/$TN")" "200"
chk "موضوع برمی‌گردد" "$(printf '%s' "$TRACK" | P "d.get('subject','')")" "CMPTEST-noise"

# ⚠️ آنچه **نباید** برگردد.
#    دانستنِ کد یعنی «من همان شاکی‌ام»، نه دسترسی به پروندهٔ کامل.
chk "نام شهروند بیرون نمی‌رود" "$(printf '%s' "$TRACK" | P "'yes' if 'citizenName' in d else 'no'")" "no"
chk "تلفن بیرون نمی‌رود" "$(printf '%s' "$TRACK" | P "'yes' if 'citizenPhone' in d else 'no'")" "no"
chk "نشانی بیرون نمی‌رود" "$(printf '%s' "$TRACK" | P "'yes' if 'address' in d else 'no'")" "no"
chk "شناسهٔ شرکت بیرون نمی‌رود" "$(printf '%s' "$TRACK" | P "'yes' if 'companyId' in d else 'no'")" "no"

chk "کد نامعتبر ۴۰۴ می‌دهد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/complaints/track/137-does-not-exist")" "404"

# ⚠️ فهرست و جزئیات همچنان بسته‌اند: روزنه فقط برای یک سطر است.
chk "فهرست بدون توکن بسته است" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/complaints")" "401"
chk "جزئیات بدون توکن بسته است" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/complaints/$ID")" "401"

# ⚠️ نشتِ اتصالِ بازیافتی.
#
#    `app.track_code` روی اتصال می‌نشیند و اتصال‌ها در استخر بازیافت
#    می‌شوند.  اگر پیش از هر استفاده پاک نشود، درخواستِ بعدی کدِ نفرِ
#    قبل را به ارث می‌برد و سطری می‌بیند که نباید.
echo '--- نشت اتصال ---'
curl -s -o /dev/null "$A/complaints/track/$TN"
leak=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$A/complaints/track/137-ghost-$i")" = "404" ] || leak=$((leak+1))
done
chk "کدِ رهگیری روی اتصال باقی نمی‌ماند" "$leak" "0"
chk "پیگیریِ دوم، شکایتِ اول را نمی‌دهد" \
  "$(curl -s "$A/complaints/track/$TN2" | P "d.get('subject','')")" "CMPTEST-second"

# ─── گردش کار ───

echo '--- گردش کار ---'
chk "ارجاع ۲۰۰" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/complaints/$ID/refer" -H "$AU" -H "$JS" \
     -d '{"referredTo":"CMPTEST-unit"}')" "200"
chk "وضعیت به REFERRED رفت" \
  "$(Q "SELECT status FROM \"CitizenComplaint\" WHERE id='$ID';")" "REFERRED"

curl -s -o /dev/null -X PATCH "$A/complaints/$ID/status" -H "$AU" -H "$JS" \
  -d '{"status":"RESOLVED","responseNote":"CMPTEST-fixed"}'
chk "وضعیت به RESOLVED رفت" \
  "$(Q "SELECT status FROM \"CitizenComplaint\" WHERE id='$ID';")" "RESOLVED"
chk "یادداشت پاسخ ثبت شد" \
  "$(Q "SELECT \"responseNote\" FROM \"CitizenComplaint\" WHERE id='$ID';")" "CMPTEST-fixed"

# شهروند باید پاسخ را در پیگیری ببیند — کلِ فایدهٔ یادداشت همین است.
chk "پاسخ در پیگیریِ عمومی دیده می‌شود" \
  "$(curl -s "$A/complaints/track/$TN" | P "d.get('responseNote','')")" "CMPTEST-fixed"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
