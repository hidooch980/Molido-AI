#!/usr/bin/env bash
#
# پشتیبان و بازیابیِ **ساختار**.
#
# ⚠️ سنجهٔ اصلیِ این فایل «ساختار منتقل می‌شود» نیست.
#
#    مهم‌تر این است که **راز در فایل نباشد**.  خروجی چیزی است که
#    کاربر ایمیل می‌کند، در تلگرام می‌فرستد، روی فلش می‌گذارد.  اگر
#    `privateKeyPem` سامانهٔ مؤدیان یا شبای پایانه در آن بنشیند، از
#    دستِ ما خارج شده و هیچ‌چیز خطا نداده.
#
# ⚠️ سنجهٔ دوم: بازیابی **موجود را خراب نکند**.
#
#    کدینگ حسابِ فروشگاهی که سه سال کار کرده به هزاران سند وصل است.
#    بازیابیِ جایگزین‌کننده یعنی همان سندها بی‌حساب بمانند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JS="Content-Type: application/json"
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"; echo; printf "   PASS: 0   FAIL: 1\n"; exit 1
fi
AU="Authorization: Bearer $T"

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read().strip()
d=json.loads(raw) if raw else None
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d ' \r'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

TMP=.structure-test-tmp
rm -rf "$TMP"; mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

cleanup() {
  Q "DELETE FROM \"Warehouse\" WHERE code LIKE 'STRTEST%';
     DELETE FROM \"Branch\"    WHERE code LIKE 'STRTEST%';
     DELETE FROM \"CashBox\"   WHERE code LIKE 'STRTEST%';
     DELETE FROM \"Account\"   WHERE code LIKE 'STRTEST%';
     DELETE FROM \"Category\"  WHERE name LIKE 'STRTEST%';
     DELETE FROM \"Supplier\"  WHERE name LIKE 'STRTEST%';" >/dev/null
}
cleanup

echo '--- ۱) خروجی گرفته می‌شود ---'
curl -s "$A/structure/export" -H "$AU" > "$TMP/exp.json"
chk "نسخهٔ قالب اعلام شده" "$(P "d.get('molidoStructure')" < "$TMP/exp.json")" "1"
chk "جدولِ حساب هست" "$(P "'yes' if 'Account' in d['tables'] else 'no'" < "$TMP/exp.json")" "yes"

echo '--- ۲) هیچ رازی در فایل نیست ---'
#
# ⚠️ **مهم‌ترین سنجهٔ فایل.**
#
#    نه فقط ستون‌هایی که می‌شناسیم — کلِ متنِ فایل جست‌وجو می‌شود.
#    اگر روزی ستونی به فهرستِ سفید اضافه شود که راز دارد، اینجا
#    می‌شکند حتی اگر کسی این آزمون را به‌روز نکرده باشد.
LEAK=$(python3 - "$TMP/exp.json" <<'PYX'
import io, sys, re
raw = io.open(sys.argv[1], encoding='utf-8').read()
bad = ['privateKeyPem', 'passwordHash', 'merchantId', 'iban', 'accountNo',
       'clientId', 'apiKey', 'BEGIN PRIVATE KEY', 'BEGIN RSA']
hits = [b for b in bad if re.search(re.escape(b), raw, re.I)]
print(','.join(hits) if hits else 'none')
PYX
)
chk "کلید و شبا در فایل نیست" "$LEAK" "none"

# ⚠️ مانده هم نباید برود: از سند می‌آید، نه از ساختار.  بردنش یعنی
#    نصبِ تازه از روزِ اول ماندهٔ بی‌سند دارد.
chk "ماندهٔ حساب در فایل نیست" \
  "$(P "'yes' if any('balance' in r for t in d['tables'].values() for r in t) else 'no'" < "$TMP/exp.json")" "no"

echo '--- ۳) بازیابیِ آزمایشی چیزی نمی‌نویسد ---'
python3 - "$TMP/exp.json" "$TMP/new.json" <<'PYX'
import io, json, sys
d = json.load(io.open(sys.argv[1], encoding='utf-8'))
d['tables'] = {k: [] for k in d['tables']}
d['tables']['Branch'] = [{'id': 'src-b1', 'name': 'STRTEST Branch', 'code': 'STRTEST-B1',
                          'phone': None, 'email': None, 'address': None, 'isActive': True}]
d['tables']['Warehouse'] = [{'id': 'src-w1', 'name': 'STRTEST Store', 'code': 'STRTEST-W1',
                             'description': None, 'branchId': 'src-b1'}]
# درختِ حساب: فرزند **پیش از** والد نوشته می‌شود تا گذرِ دوم سنجیده شود.
d['tables']['Account'] = [
    {'id': 'src-a2', 'name': 'STRTEST Child', 'code': 'STRTEST-A2', 'type': 'ASSET',
     'isActive': True, 'isPostable': True, 'parentId': 'src-a1'},
    {'id': 'src-a1', 'name': 'STRTEST Parent', 'code': 'STRTEST-A1', 'type': 'ASSET',
     'isActive': True, 'isPostable': False, 'parentId': None},
]
io.open(sys.argv[2], 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False))
PYX

DRY=$(curl -s -X POST "$A/structure/restore?dryRun=true" -H "$AU" -H "$JS" --data-binary "@$TMP/new.json")
chk "آزمایشی، ۴ ردیف را تازه می‌بیند" "$(printf '%s' "$DRY" | P "d.get('created')")" "4"
chk "ولی چیزی ننوشت" "$(Q "SELECT count(*) FROM \"Branch\" WHERE code='STRTEST-B1';")" "0"

echo '--- ۴) بازیابیِ واقعی ---'
R=$(curl -s -X POST "$A/structure/restore" -H "$AU" -H "$JS" --data-binary "@$TMP/new.json")
chk "۴ ردیف ساخته شد" "$(printf '%s' "$R" | P "d.get('created')")" "4"
chk "شعبه نشست" "$(Q "SELECT count(*) FROM \"Branch\" WHERE code='STRTEST-B1';")" "1"

# ⚠️ ارجاعِ ترجمه‌شده: انبار باید به شعبهٔ **مقصد** وصل شده باشد، نه
#    به شناسهٔ نصبِ مبدأ.  اگر ترجمه نشود، `branchId` تهی می‌ماند و
#    هیچ خطایی نمی‌دهد — انبار فقط بی‌شعبه می‌شود.
chk "انبار به شعبهٔ درست وصل شد" \
  "$(Q "SELECT count(*) FROM \"Warehouse\" w JOIN \"Branch\" b ON b.id=w.\"branchId\"
        WHERE w.code='STRTEST-W1' AND b.code='STRTEST-B1';")" "1"

# ⚠️ گذرِ دوم: فرزند پیش از والد در فایل بود.  بدونِ گذرِ دوم،
#    `parentId` تهی می‌ماند و درختِ حساب بی‌صدا صاف می‌شود.
chk "والدِ حساب گره خورد (گذرِ دوم)" \
  "$(Q "SELECT count(*) FROM \"Account\" c JOIN \"Account\" p ON p.id=c.\"parentId\"
        WHERE c.code='STRTEST-A2' AND p.code='STRTEST-A1';")" "1"

echo '--- ۵) اجرای دوباره چیزی اضافه نمی‌کند ---'
# ⚠️ همین است که بازیابی را بی‌خطر می‌کند: کاربری که مطمئن نیست
#    فایل را اعمال کرده یا نه، می‌تواند دوباره بزند.
R2=$(curl -s -X POST "$A/structure/restore" -H "$AU" -H "$JS" --data-binary "@$TMP/new.json")
chk "هیچ ردیفِ تازه‌ای نساخت" "$(printf '%s' "$R2" | P "d.get('created')")" "0"
chk "و ۴ تا را موجود دید" "$(printf '%s' "$R2" | P "d.get('existing')")" "4"
chk "شعبه تکراری نشد" "$(Q "SELECT count(*) FROM \"Branch\" WHERE code='STRTEST-B1';")" "1"

echo '--- ۶) ردیفِ موجود دست نمی‌خورد ---'
# ⚠️ سنجهٔ بقای داده.  اگر بازیابی بازنویسی می‌کرد، نامی که کاربر
#    خودش اصلاح کرده با هر بازیابی برمی‌گشت به نامِ فایل.
Q "UPDATE \"Branch\" SET name='STRTEST Renamed' WHERE code='STRTEST-B1';" >/dev/null
curl -s -o /dev/null -X POST "$A/structure/restore" -H "$AU" -H "$JS" --data-binary "@$TMP/new.json"
chk "نامِ ویرایش‌شده حفظ شد" "$(Q "SELECT name FROM \"Branch\" WHERE code='STRTEST-B1';")" "STRTESTRenamed"

echo '--- ۷) فایلِ ناهم‌نسخه رد می‌شود ---'
# ⚠️ «تا جایی که می‌فهمم بازیابی می‌کنم» بدترین حالت است: نیمی درست
#    می‌نشیند و نیمی غلط، و به نظر موفق می‌آید.
python3 -c "
import io,json,sys
d=json.load(io.open('$TMP/new.json',encoding='utf-8')); d['molidoStructure']=99
io.open('$TMP/bad.json','w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False))"
chk "نسخهٔ ۹۹ پذیرفته نشد" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/structure/restore" -H "$AU" -H "$JS" --data-binary "@$TMP/bad.json")" "400"

chk "بدنهٔ بی‌ربط ۴۰۰ می‌گیرد" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/structure/restore" -H "$AU" -H "$JS" -d '{"x":1}')" "400"

echo '--- ۸) تبدیلِ فایلِ نرم‌افزارِ دیگر ---'
#
# ⚠️ منطقش در `foreign-csv.spec.ts` سطر‌به‌سطر آزموده می‌شود؛ اینجا
#    فقط مسیر: که واقعاً وصل است و همان قالبی می‌دهد که `/restore`
#    می‌خواند.  دو چیزِ جدا، و هرکدام بدونِ دیگری ناقص است.
# ⚠️ بدنه از **فایل** می‌رود، نه در آرگومان.
#
#    سه بار همین‌جا خوردیم: خطِ CRLF داخلِ heredoc به خطِ واقعی
#    تبدیل می‌شود و رشتهٔ JSON را می‌شکند.  ساختنِ فایل با پایتون
#    می‌شود و رشتهٔ JSON را می‌شکند.  ساختنِ فایل با پایتون هیچ
#    لایهٔ گریزی ندارد — و همان چیزی است که سنجیده می‌شود.
python3 - "$TMP/conv-in.json" <<'PYC'
import io, json, sys
csv = chr(10).join(['name,phone', 'STRTEST Vendor,02100000000'])
io.open(sys.argv[1], 'w', encoding='utf-8').write(
    json.dumps({'kind': 'Supplier', 'csv': csv}))
PYC
CONV=$(curl -s -X POST "$A/structure/convert" -H "$AU" -H "$JS" --data-binary "@$TMP/conv-in.json")
chk "یک سطر تبدیل شد" "$(printf '%s' "$CONV" | P "d.get('rows')")" "1"
chk "قالبش فایلِ ساختار است" "$(printf '%s' "$CONV" | P "d['file'].get('molidoStructure')")" "1"

# ⚠️ و خروجی واقعاً به `/restore` می‌خورد — همان چیزی که کلِ طراحی به
#    آن تکیه دارد: یک مسیرِ درج، نه دو تا.
printf '%s' "$CONV" | python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
d=json.load(sys.stdin)
io.open('$TMP/conv.json','w',encoding='utf-8').write(json.dumps(d['file'],ensure_ascii=False))"
curl -s -o /dev/null -X POST "$A/structure/restore" -H "$AU" -H "$JS" --data-binary "@$TMP/conv.json"
chk "تأمین‌کننده از فایلِ بیگانه نشست"   "$(Q "SELECT count(*) FROM \"Supplier\" WHERE name='STRTEST Vendor';")" "1"

chk "نوعِ ناشناخته رد می‌شود"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/structure/convert" -H "$AU" -H "$JS" -d '{"kind":"Whatever","csv":"a,b"}')" "400"

echo '--- ۹) دسترسی ---'
chk "بدون توکن ۴۰۱" "$(curl -s -o /dev/null -w '%{http_code}' "$A/structure/export")" "401"

cleanup

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
