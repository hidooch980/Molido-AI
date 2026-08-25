#!/usr/bin/env bash
#
# کلیدهای API.
#
# ⚠️ چه چیزی غلط بود؟
#
#    ماژول `BaseCrudService` خالص بود — شش مسیر، سرویسِ سیزده‌خطی.
#    روی کاغذ بی‌عیب؛ روی سرورِ در حال اجرا دو ایرادِ ذاتی داشت:
#
#    ۱. کلاینت خودش `keyHash` را می‌فرستاد و سرور همان را ذخیره
#       می‌کرد.  کلیدی که سرور نساخته باشد هیچ‌وقت قابل اعتماد نیست.
#
#    ۲. `SELECT *` درهم‌سازیِ هر کلید را در فهرست برمی‌گرداند.
#
#    هیچ‌کدام با خواندنِ کد پیدا نشد؛ با `curl` روی سرویسِ واقعی
#    پیدا شد.  این فایل هست تا دوباره برنگردند.
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

# ⚠️ نامِ اختصاصی، تا پاک‌سازی هرگز کلیدِ واقعیِ کسی را نبرد.
NAME="APIKEY-TEST-$$"
cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "DELETE FROM \"ApiKey\" WHERE name LIKE 'APIKEY-TEST-%';" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

# ─── ساخت ───

RES=$(curl -s -X POST "$A/api-keys" -H "$AU" -H "$JS" -d "{\"name\":\"$NAME\"}")
KEY=$(printf '%s' "$RES" | P "d.get('key','')")
ID=$(printf '%s' "$RES" | P "d.get('id','')")

chk "کلیدِ خام در پاسخِ ساخت برمی‌گردد" "$([ -n "$KEY" ] && echo yes || echo no)" "yes"
chk "کلید با پیشوندِ mk_ شروع می‌شود" "$(printf '%s' "$KEY" | cut -c1-3)" "mk_"

# ۳۲ بایت در base64url ⇒ ۴۳ نویسه، به‌علاوهٔ پیشوندِ سه‌نویسه‌ای.
chk "طولِ کلید ۴۶ نویسه است" "$(printf '%s' "$KEY" | wc -c | tr -d ' ')" "46"

# ⚠️ سنجهٔ اصلی: درهم‌سازی نباید هیچ‌جا بیرون برود.
chk "پاسخِ ساخت keyHash ندارد" "$(printf '%s' "$RES" | P "'yes' if 'keyHash' in d else 'no'")" "no"
chk "فهرست keyHash ندارد" \
  "$(curl -s "$A/api-keys" -H "$AU" | P "'yes' if any('keyHash' in r for r in d) else 'no'")" "no"
chk "خواندنِ تکی keyHash ندارد" \
  "$(curl -s "$A/api-keys/$ID" -H "$AU" | P "'yes' if 'keyHash' in d else 'no'")" "no"

# ⚠️ اینکه در پاسخ نیست کافی نیست؛ باید در پایگاه‌داده **درهم‌سازی**
#    باشد، نه خودِ کلید.  وگرنه نشتِ پایگاه‌داده همهٔ کلیدها را می‌دهد.
chk "متنِ خام در پایگاه‌داده ذخیره نشده" \
  "$(Q "SELECT count(*) FROM \"ApiKey\" WHERE name='$NAME' AND \"keyHash\"='$KEY';")" "0"
chk "درهم‌سازیِ ذخیره‌شده ۶۴ نویسه است (sha256)" \
  "$(Q "SELECT length(\"keyHash\") FROM \"ApiKey\" WHERE name='$NAME';")" "64"

# ─── ایرادِ اصلی: hashِ تحمیلیِ کلاینت ───

RES2=$(curl -s -X POST "$A/api-keys" -H "$AU" -H "$JS" \
  -d "{\"name\":\"$NAME-b\",\"keyHash\":\"ATTACKER-CONTROLLED\",\"prefix\":\"mk_evil\"}")
ID2=$(printf '%s' "$RES2" | P "d.get('id','')")
chk "keyHash فرستادهٔ کلاینت نادیده گرفته می‌شود" \
  "$(Q "SELECT count(*) FROM \"ApiKey\" WHERE \"keyHash\"='ATTACKER-CONTROLLED';")" "0"
chk "prefix فرستادهٔ کلاینت نادیده گرفته می‌شود" \
  "$(Q "SELECT count(*) FROM \"ApiKey\" WHERE prefix='mk_evil';")" "0"

# ─── به‌روزرسانی ───

curl -s -X PATCH "$A/api-keys/$ID" -H "$AU" -H "$JS" \
  -d '{"keyHash":"PATCHED-HASH","isActive":false}' >/dev/null
chk "PATCH نمی‌تواند درهم‌سازی را عوض کند" \
  "$(Q "SELECT count(*) FROM \"ApiKey\" WHERE \"keyHash\"='PATCHED-HASH';")" "0"
chk "PATCH میدانِ مجاز را عوض می‌کند" \
  "$(Q "SELECT \"isActive\" FROM \"ApiKey\" WHERE name='$NAME';")" "f"

# ─── نام الزامی ───

chk "ساخت بدون نام رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/api-keys" -H "$AU" -H "$JS" -d '{}')" "400"

# ─── یکتاییِ کلیدها ───
#
# ⚠️ اگر `randomBytes` جایش را به شمارنده یا زمان بدهد، این سنجه
#    می‌گیردش.  دو کلیدِ یکسان یعنی هرکس کلیدِ دیگری را می‌سازد.
K1=$(curl -s -X POST "$A/api-keys" -H "$AU" -H "$JS" -d "{\"name\":\"$NAME-u1\"}" | P "d.get('key','')")
K2=$(curl -s -X POST "$A/api-keys" -H "$AU" -H "$JS" -d "{\"name\":\"$NAME-u2\"}" | P "d.get('key','')")
chk "دو کلیدِ پیاپی یکسان نیستند" "$([ "$K1" != "$K2" ] && echo yes || echo no)" "yes"

# ─── حذف ───

curl -s -X DELETE "$A/api-keys/$ID2" -H "$AU" >/dev/null
chk "حذف کار می‌کند" "$(Q "SELECT count(*) FROM \"ApiKey\" WHERE name='$NAME-b';")" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
