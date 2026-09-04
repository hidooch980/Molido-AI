#!/usr/bin/env bash
#
# اشتراک — تا بشود نرم‌افزار را **فروخت**، نه فقط نصب کرد.
#
# ⚠️ خطرِ این سامانه یک‌طرفه نیست، و همین طراحی‌اش را سخت می‌کند.
#
#    اگر شل باشد، کسی که پول نداده کار می‌کند — ضررِ مالی.
#    اگر سفت باشد، کسی که پول **داده** قفل می‌شود — ضررِ اعتباری، و
#    آن بدتر است: مشتری وسطِ فروشِ روزِ شلوغ می‌ماند.
#
#    پس فایل‌سیف در جهتِ **باز** است، و سنجه‌های اینجا بیشتر همان را
#    می‌سنجند تا محدودیت را.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JS="Content-Type: application/json"
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi
AU="Authorization: Bearer $T"

# ⚠️ مسیرهای **فروشنده** نقشِ `SUPER_ADMIN` می‌خواهند و مدیرِ شرکت
#    آن را ندارد — درست است، چون هیچ مشتری‌ای نباید فهرستِ مشتریانِ
#    دیگر را ببیند.
#
#    نسخهٔ اول با توکنِ مدیر می‌سنجید و چهار سنجه ۴۰۳ گرفتند: قرمزی‌ای
#    که شبیه اشکال بود ولی در واقع محافظت درست کار می‌کرد.
VENDOR_PW='Vendor-Test-1'
VQ() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d ' 
'; }
VQ "DELETE FROM \"User\" WHERE email='vendor-test@molido.ai';" >/dev/null
VT=$(curl -s -X POST $A/users -H "$AU" -H "$JS"   -d '{"firstName":"Vendor","lastName":"Test","email":"vendor-test@molido.ai","password":"'"$VENDOR_PW"'","role":"ADMIN"}' >/dev/null
  VQ "UPDATE \"User\" SET role='SUPER_ADMIN' WHERE email='vendor-test@molido.ai';" >/dev/null
  curl -s -X POST $A/auth/login -H "$JS" -d '{"email":"vendor-test@molido.ai","password":"'"$VENDOR_PW"'"}'     | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
VAU="Authorization: Bearer $VT"

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read().strip()
if not raw:
    d=None
else:
    try:
        d=json.loads(raw)
    except ValueError:
        print('<<no-json>>'); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d ' \r'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ⚠️ وضعیتِ اصلی **پیش از** هر تغییری ذخیره می‌شود و در پایان
#    برمی‌گردد.  این آزمون اشتراکِ شرکتِ واقعی را دستکاری می‌کند؛
#    نگرداندنش یعنی مجموعه‌های بعدی روی نصبِ قفل‌شده اجرا شوند.
# ⚠️ `startsOn` هم ذخیره می‌شود.
#
#    نسخهٔ اول فقط plan/status/endsOn/maxUsers را برمی‌گرداند و
#    `startsOn` عقب‌رفته می‌ماند.  اجرای بعدی روی اشتراکِ منقضی شروع
#    می‌شد و اولین سنجه قرمز می‌داد — قرمزی‌ای که ربطی به کد نداشت و
#    فقط نشتِ حالت از اجرای قبلی بود.
ORIG=$(Q "SELECT plan||'|'||status||'|'||COALESCE(\"endsOn\"::text,'')||'|'||COALESCE(\"maxUsers\"::text,'')||'|'||\"startsOn\"::text FROM \"Subscription\" WHERE \"companyId\"='seed-company';")

restore() {
  [ -z "$ORIG" ] && return
  p=${ORIG%%|*}; r=${ORIG#*|}
  s=${r%%|*}; r=${r#*|}
  e=${r%%|*}; r=${r#*|}
  m=${r%%|*}; st=${r#*|}
  Q "UPDATE \"Subscription\" SET plan='$p', status='$s',
       \"startsOn\"='$st',
       \"endsOn\"=$([ -n "$e" ] && echo "'$e'" || echo NULL),
       \"maxUsers\"=$([ -n "$m" ] && echo "$m" || echo NULL)
     WHERE \"companyId\"='seed-company';" >/dev/null
  Q "DELETE FROM \"User\" WHERE email LIKE 'subtest-%@molido.ai';" >/dev/null
  Q "DELETE FROM \"User\" WHERE email='vendor-test@molido.ai';" >/dev/null
}
trap restore EXIT
Q "DELETE FROM \"User\" WHERE email LIKE 'subtest-%@molido.ai';" >/dev/null

echo '--- ۱) اشتراکِ شرکتِ جاری دیده می‌شود ---'
M=$(curl -s "$A/subscription/mine" -H "$AU")
chk "پاسخ می‌دهد" "$(printf '%s' "$M" | P "'yes' if 'active' in d else 'no'")" "yes"
chk "فعال است" "$(printf '%s' "$M" | P "str(d['active'])")" "True"

echo '--- ۲) فهرستِ مشتریان — فقط فروشنده ---'
CUST=$(curl -s "$A/subscription/customers" -H "$VAU")
chk "فهرست می‌آید" "$(printf '%s' "$CUST" | P "'yes' if isinstance(d, list) else 'no'")" "yes"
# ⚠️ تعدادِ کاربر باید **واقعی** باشد، نه صفر — وگرنه فروشنده
#    نمی‌فهمد کدام مشتری به سقف نزدیک است.
chk "تعدادِ کاربر شمرده می‌شود" \
  "$(printf '%s' "$CUST" | P "'yes' if any(x['userCount'] > 0 for x in d) else 'no'")" "yes"

echo '--- ۳) سقفِ کاربر ---'
#
# ⚠️ **سنجهٔ اصلیِ فروش.**  بدونِ آن، «پلنِ پایه ۳ کاربر» فقط یک
#    جمله در بروشور است.
USERS=$(Q "SELECT count(*) FROM \"User\" WHERE \"companyId\"='seed-company';")
Q "UPDATE \"Subscription\" SET \"maxUsers\"=$USERS WHERE \"companyId\"='seed-company';" >/dev/null

chk "کاربرِ فراتر از سقف رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/users" -H "$AU" -H "$JS" \
     -d '{"firstName":"Sub","lastName":"Test","email":"subtest-1@molido.ai","password":"Test-1234","role":"EMPLOYEE"}')" "403"
chk "و کاربری ساخته نشد" \
  "$(Q "SELECT count(*) FROM \"User\" WHERE email='subtest-1@molido.ai';")" "0"

# ⚠️ با بالا بردنِ سقف باید بلافاصله کار کند — بدونِ راه‌اندازیِ دوباره.
Q "UPDATE \"Subscription\" SET \"maxUsers\"=$((USERS + 5)) WHERE \"companyId\"='seed-company';" >/dev/null
chk "با افزایشِ سقف ساخته می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/users" -H "$AU" -H "$JS" \
     -d '{"firstName":"Sub","lastName":"Test","email":"subtest-2@molido.ai","password":"Test-1234","role":"EMPLOYEE"}')" "201"

echo '--- ۴) سقفِ تهی یعنی بی‌حد، نه صفر ---'
#
# ⚠️ این تفاوت، شرکت را قفل می‌کند اگر اشتباه شود.  «حد ندارد» و
#    «حدش صفر است» دو چیزِ کاملاً متفاوت‌اند.
Q "UPDATE \"Subscription\" SET \"maxUsers\"=NULL WHERE \"companyId\"='seed-company';" >/dev/null
chk "با سقفِ تهی، کاربر ساخته می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/users" -H "$AU" -H "$JS" \
     -d '{"firstName":"Sub","lastName":"Test","email":"subtest-3@molido.ai","password":"Test-1234","role":"EMPLOYEE"}')" "201"

echo '--- ۵) اشتراکِ منقضی ---'
# ⚠️ `startsOn` هم عقب برده می‌شود.
#
#    قیدِ `endsOn >= startsOn` وگرنه UPDATE را رد می‌کند — و چون
#    خطای psql دور ریخته می‌شود، آزمون بی‌صدا روی حالتِ **قبلی**
#    سنجیده می‌شد و سبز می‌ماند.  یک بار همین شد.
Q "UPDATE \"Subscription\" SET \"startsOn\"=CURRENT_DATE - 30, \"endsOn\"=CURRENT_DATE - 1 WHERE \"companyId\"='seed-company';" >/dev/null
MM=$(curl -s "$A/subscription/mine" -H "$AU")
chk "غیرفعال گزارش می‌شود" "$(printf '%s' "$MM" | P "str(d['active'])")" "False"
chk "و دلیلش گفته می‌شود" "$(printf '%s' "$MM" | P "'yes' if d['reason'] else 'no'")" "yes"

# ⚠️ **مهم‌ترین سنجهٔ فایل: خواندن باید کار کند.**
#
#    مشتری‌ای که اشتراکش تمام شده باید بتواند داده‌اش را ببیند و
#    بیرون بکشد.  بستنِ خواندن یعنی گروگان گرفتنِ داده — غیراخلاقی،
#    و عملاً هم تماسِ پشتیبانی می‌سازد به‌جای تمدید.
chk "خواندنِ داده همچنان کار می‌کند" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/products" -H "$AU")" "200"

echo '--- ۶) اشتراکی که امروز تمام می‌شود، امروز کار می‌کند ---'
# ⚠️ مقایسه روی **تاریخ** است نه لحظه.  اگر لحظه‌ای بود، مشتری از
#    نیمه‌شبِ روزِ آخر قطع می‌شد در حالی که تا پایانِ آن روز حق دارد.
Q "UPDATE \"Subscription\" SET \"endsOn\"=CURRENT_DATE WHERE \"companyId\"='seed-company';" >/dev/null
chk "روزِ پایان هنوز فعال است" \
  "$(curl -s "$A/subscription/mine" -H "$AU" | P "str(d['active'])")" "True"

echo '--- ۷) تعلیق ---'
# ⚠️ تعلیق با انقضا فرق دارد: اولی تصمیمِ فروشنده است، دومی گذشتِ
#    زمان.  یکی کردنشان یعنی نشود فهمید چرا سرویس قطع شده.
Q "UPDATE \"Subscription\" SET \"endsOn\"=NULL, status='SUSPENDED' WHERE \"companyId\"='seed-company';" >/dev/null
chk "تعلیق‌شده غیرفعال است" \
  "$(curl -s "$A/subscription/mine" -H "$AU" | P "str(d['active'])")" "False"

echo '--- ۸) نبودِ اشتراک یعنی بی‌پایان، نه منقضی ---'
#
# ⚠️ نصبِ اختصاصی، سرورِ خودِ مشتری، و پایگاه‌دادهٔ توسعه هیچ‌کدام
#    اشتراک ندارند — و همه باید کار کنند.  فایل‌سیف در جهتِ **باز**.
SAVE=$(Q "SELECT id FROM \"Subscription\" WHERE \"companyId\"='seed-company';")
Q "DELETE FROM \"Subscription\" WHERE \"companyId\"='seed-company';" >/dev/null
chk "بی‌اشتراک، فعال شمرده می‌شود" \
  "$(curl -s "$A/subscription/mine" -H "$AU" | P "str(d['active'])")" "True"
chk "و کاربر ساخته می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/users" -H "$AU" -H "$JS" \
     -d '{"firstName":"Sub","lastName":"Test","email":"subtest-4@molido.ai","password":"Test-1234","role":"EMPLOYEE"}')" "201"

Q "INSERT INTO \"Subscription\" (id, \"companyId\", plan, status) VALUES ('$SAVE','seed-company','ENTERPRISE','ACTIVE') ON CONFLICT DO NOTHING;" >/dev/null

echo '--- ۸.۵) سه نسخهٔ فروش ---'
PL=$(curl -s "$A/subscription/plans" -H "$AU")
chk "سه نسخه تعریف شده" "$(printf '%s' "$PL" | P "len(d)")" "3"
chk "نام‌ها درست‌اند"   "$(printf '%s' "$PL" | P "','.join(sorted(x['plan'] for x in d))")" "ADVANCED,BASIC,PRO"

# ⚠️ «پیشرفته» باید بی‌حد باشد — اگر عدد بگیرد، مشتریِ زنجیره‌ای که
#    گران‌ترین نسخه را خریده به سقف می‌خورد.
chk "پیشرفته بی‌حد است"   "$(printf '%s' "$PL" | P "next(str(x['maxUsers']) for x in d if x['plan']=='ADVANCED')")" "None"
chk "پایه محدود است"   "$(printf '%s' "$PL" | P "'yes' if next(x['maxUsers'] for x in d if x['plan']=='BASIC') > 0 else 'no'")" "yes"

# ⚠️ تعیینِ نسخه باید سقفش را **هم** بگذارد، وگرنه تفاوتِ نسخه‌ها
#    فقط روی کاغذ می‌ماند.
curl -s -o /dev/null -X PUT "$A/subscription/customers/seed-company" -H "$VAU" -H "$JS" -d '{"plan":"BASIC"}'
chk "با تعیینِ «پایه»، سقفش هم اعمال می‌شود"   "$(Q "SELECT COALESCE(\"maxUsers\"::text,'تهی') FROM \"Subscription\" WHERE \"companyId\"='seed-company';")" "3"

echo '--- ۹) اعتبارسنجی ---'
chk "پلنِ نامعتبر رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$A/subscription/customers/seed-company" \
     -H "$VAU" -H "$JS" -d '{"plan":"GOLD"}')" "400"
chk "سقفِ صفر رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$A/subscription/customers/seed-company" \
     -H "$VAU" -H "$JS" -d '{"maxUsers":0}')" "400"
chk "شرکتِ ناموجود ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$A/subscription/customers/no-such-company" \
     -H "$VAU" -H "$JS" -d '{"plan":"PRO"}')" "404"

echo '--- ۱۰) دسترسی ---'
chk "بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/subscription/customers")" "401"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
