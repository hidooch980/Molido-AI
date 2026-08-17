#!/usr/bin/env bash
#
# اختیارات نقش‌ها — قابل ویرایش، ولی نه به قیمتِ قفل شدن نصب.
#
# این آزمون دو چیز را می‌سنجد و دومی مهم‌تر است:
#
#   ۱. مدیر می‌تواند اختیاری را بدهد یا بگیرد و **فوراً** اثر کند.
#   ۲. هیچ پیکربندی‌ای نتواند راهِ برگشت را ببندد.
#
# مورد دوم جایی است که سامانه‌های اختیارات معمولاً می‌شکنند: کسی به
# اشتباه اختیارِ خودش را می‌گیرد و بعد راهی برای پس گرفتنش ندارد.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST $A/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"admin@molido.ai","password":"'"$PW"'"}')
  case "$code" in
    000) echo "  ✗ ورود ناموفق — سرویس روی $A پاسخ نمی‌دهد" ;;
    401) echo "  ✗ ورود ناموفق — رمز نادرست است (MOLIDO_ADMIN_PASSWORD را بده)" ;;
    429) echo "  ✗ ورود ناموفق — سقف ورود خورده؛ چند دقیقه صبر کن" ;;
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از /auth/login" ;;
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
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

pass=0; fail=0
chk() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}

cleanup() {
  psql "DELETE FROM \"RolePermission\" WHERE permission LIKE '%:%'"
  psql "DELETE FROM \"User\" WHERE email = 'roletest@molido.ai'"
}
cleanup

echo '--- ۱) فهرست اختیارات ---'
CAT=$(curl -s "$A/roles/permissions" -H "$AU")
chk "نقش‌ها فهرست می‌شوند" "$(echo "$CAT" | P "len(d['roles']) >= 5")" "True"
chk "گروه‌ها فهرست می‌شوند" "$(echo "$CAT" | P "len(d['groups']) >= 4")" "True"
chk "پیش‌فرضِ کد گفته می‌شود" \
  "$(echo "$CAT" | P "'MANAGER' in [g for g in d['groups'] if g['group']=='sales'][0]['items'][0]['defaultRoles']")" "True"

echo '--- ۲) جدولِ خالی یعنی رفتارِ امروز ---'
# ⚠️ مهم‌ترین ویژگی این تغییر.  استقرارش نباید هیچ‌چیز را عوض کند تا
#    وقتی کسی عمداً چیزی را عوض کند.  اگر پیش‌فرض «ممنوع» بود، اولین
#    استقرار همه را بیرون می‌انداخت.
chk "بدون بازنویسی، جدول خالی است" \
  "$(psqlv "SELECT count(*) FROM \"RolePermission\"")" "0"
chk "مدیر همچنان لغو فاکتور دارد" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/sales/00000000-0000-0000-0000-000000000000/cancel" -H "$AU")" "404"

echo '--- ۳) دادن اختیار به نقشی که نداشت ---'
SET=$(curl -s -X PUT "$A/roles" -H "$AU" -H "$JS" \
  -d '{"role":"CASHIER","permission":"sales:cancel","allowed":true}')
chk "اختیار داده شد" "$(echo "$SET" | P "d.get('allowed')")" "True"
chk "در پایگاه داده نشست" \
  "$(psqlv "SELECT allowed FROM \"RolePermission\" WHERE role='CASHIER' AND permission='sales:cancel'")" "t"
chk "در فهرست دیده می‌شود" \
  "$(curl -s "$A/roles/permissions" -H "$AU" | P "[i for g in d['groups'] for i in g['items'] if i['key']=='sales:cancel'][0]['overrides'].get('CASHIER')")" "True"

echo '--- ۴) گرفتن اختیار ---'
curl -s -X PUT "$A/roles" -H "$AU" -H "$JS" \
  -d '{"role":"MANAGER","permission":"sales:cancel","allowed":false}' >/dev/null
chk "اختیار گرفته شد" \
  "$(psqlv "SELECT allowed FROM \"RolePermission\" WHERE role='MANAGER' AND permission='sales:cancel'")" "f"

echo '--- ۵) بازگرداندن به پیش‌فرض ردیف را حذف می‌کند ---'
# ⚠️ حذف، نه گذاشتنِ `false`.
#
#    نبودِ ردیف یعنی «هرچه کد گفته»، که با «ممنوع» فرق دارد.  اگر
#    بازگرداندن `false` می‌گذاشت، «بازگشت به پیش‌فرض» در عمل اختیار را
#    می‌گرفت — دقیقاً برعکسِ کاری که نامش می‌گوید.
curl -s -X DELETE "$A/roles/MANAGER/sales:cancel" -H "$AU" >/dev/null
chk "ردیف حذف شد نه false" \
  "$(psqlv "SELECT count(*) FROM \"RolePermission\" WHERE role='MANAGER' AND permission='sales:cancel'")" "0"

echo '--- ۶) مدیر ارشد قابل محدود کردن نیست ---'
# اگر مدیری به اشتباه اختیارِ خودش را بگیرد، راهِ برگشتی جز دست بردن در
# دیتابیس نمی‌ماند — و آن کاری است که یک فروشگاه بلد نیست.
chk "گرفتن اختیار مدیر ارشد رد می‌شود" \
  "$(curl -s -X PUT "$A/roles" -H "$AU" -H "$JS" \
     -d '{"role":"SUPER_ADMIN","permission":"sales:cancel","allowed":false}' | P "d.get('statusCode')")" "400"
# و قید دیتابیس هم جلویش را می‌گیرد — حتی اگر روزی کدی این را فراموش کند.
psql "INSERT INTO \"RolePermission\" (id,\"companyId\",role,permission,allowed)
      VALUES ('rt-bad','seed-company','SUPER_ADMIN','sales:cancel',false)"
chk "دیتابیس هم نمی‌گذارد" \
  "$(psqlv "SELECT count(*) FROM \"RolePermission\" WHERE id='rt-bad'")" "0"

echo '--- ۷) اختیار ناشناس رد می‌شود ---'
# ردیفی که هیچ‌جا خوانده نمی‌شود، بدترین نوع خرابی است: خطایی نمی‌دهد و
# مدیر فکر می‌کند تنظیمش کار کرده.
chk "اختیار ناشناس ۴۰۰" \
  "$(curl -s -X PUT "$A/roles" -H "$AU" -H "$JS" \
     -d '{"role":"CASHIER","permission":"nonsense:thing","allowed":true}' | P "d.get('statusCode')")" "400"
chk "نقش ناشناس ۴۰۰" \
  "$(curl -s -X PUT "$A/roles" -H "$AU" -H "$JS" \
     -d '{"role":"WIZARD","permission":"sales:cancel","allowed":true}' | P "d.get('statusCode')")" "400"

echo '--- ۸) خودِ مسیر اختیارات قابل بازنویسی نیست ---'
# وگرنه یک نقش می‌توانست به خودش اختیارِ تغییرِ اختیارات بدهد و از
# آنجا هر در دیگری را باز کند.
chk "مسیر roles بدون @Permission است" \
  "$(grep -c \"@Permission\" backend/src/roles/roles.controller.ts)" "0"

echo '--- ۸b) اثرِ واقعی روی کاربرِ آن نقش ---'
# بقیهٔ سنجه‌ها ردیف پایگاه داده را می‌بینند.  این یکی چیزی را می‌سنجد
# که واقعاً اهمیت دارد: آیا کاربرِ آن نقش رفتار تازه را می‌بیند.
#
# ۴۰۳ در برابر ۴۰۴ عمدی است: ۴۰۳ یعنی «اجازه نداری»، ۴۰۴ یعنی «اجازه
# داری ولی چنین فاکتوری نیست».  اگر هر دو ۴۰۳ بودند، آزمون نمی‌توانست
# بگوید اختیار اثر کرده یا نه.
curl -s -X POST $A/users -H "$AU" -H "$JS" -d '{
  "email":"roletest@molido.ai","password":"Test-Role-1",
  "firstName":"Role","lastName":"Test","role":"CASHIER"}' >/dev/null
CT=$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"roletest@molido.ai","password":"Test-Role-1"}' \
  | P "d.get('accessToken','')")
chk "صندوق‌دار وارد شد" "$([ -n "$CT" ] && echo yes || echo no)" "yes"

CAU="Authorization: Bearer $CT"
FAKE=00000000-0000-0000-0000-000000000000

# ⚠️ از حالتِ معلوم شروع کن.
#
#    بخش ۳ اختیار را به صندوق‌دار داده بود و پس نگرفت؛ این بخش بدون
#    پاک‌سازی، «پیش از اختیار» را با اختیارِ جامانده می‌سنجید.  نشتِ
#    حالت بین بخش‌های یک آزمون، همان چیزی است که آزمون را غیرقابل
#    اعتماد می‌کند.
curl -s -X DELETE "$A/roles/CASHIER/sales:cancel" -H "$AU" >/dev/null

chk "پیش از اختیار، ۴۰۳ می‌گیرد" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/sales/$FAKE/cancel" -H "$CAU")" "403"

curl -s -X PUT "$A/roles" -H "$AU" -H "$JS" \
  -d '{"role":"CASHIER","permission":"sales:cancel","allowed":true}' >/dev/null
# ۴۰۴ یعنی از نگهبان رد شد و به خودِ فاکتور رسید.
chk "پس از اختیار، به فاکتور می‌رسد" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/sales/$FAKE/cancel" -H "$CAU")" "404"

curl -s -X DELETE "$A/roles/CASHIER/sales:cancel" -H "$AU" >/dev/null
chk "پس از بازگرداندن، دوباره ۴۰۳" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/sales/$FAKE/cancel" -H "$CAU")" "403"

# و صندوق‌دار نباید بتواند اختیارات را عوض کند — وگرنه به خودش هر
# اختیاری می‌داد.
chk "صندوق‌دار نمی‌تواند اختیارات را عوض کند" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$A/roles" -H "$CAU" -H "$JS" \
     -d '{"role":"CASHIER","permission":"sales:cancel","allowed":true}')" "403"

echo '--- ۹) بدون توکن بسته است ---'
chk "فهرست بدون توکن" "$(curl -s -o /dev/null -w '%{http_code}' "$A/roles/permissions")" "401"
chk "تغییر بدون توکن" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$A/roles" -H "$JS" \
     -d '{"role":"CASHIER","permission":"sales:cancel","allowed":true}')" "401"

cleanup

echo
printf '   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
