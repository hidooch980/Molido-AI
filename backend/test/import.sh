#!/usr/bin/env bash
#
# ورود گروهی کالا از فایل.
#
# فروشگاهی که از نرم‌افزار دیگری می‌آید هزاران کالا دارد.  بدترین حالت
# این نیست که ورود شکست بخورد — آن معلوم است.  بدترین حالت این است که
# کالاها با قیمت صفر یا دوبرابر وارد شوند و شبیه موفقیت به نظر برسد.
#
# فایل آزمون از پایتون ساخته می‌شود نه از `curl -d`: پوستهٔ ویندوز متن
# فارسی را خراب می‌کند و اینجا دقیقاً فارسی موضوع آزمون است.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
TMP="${TMPDIR:-/tmp}/molido-import-$$.json"

# توکن مشترک: اگر `run-tests.sh` یک بار وارد شده باشد، دوباره وارد
# نمی‌شویم.  سقف ورود عمداً سخت است (جلوی حدس رمز را می‌گیرد)، و ورودِ
# جداگانه در هر مجموعه همان سقف را می‌خورد، توکن خالی برمی‌گردد، و
# مجموعه با شکست‌هایی می‌افتد که هیچ ربطی به کد ندارند.
T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  # پیام قبلی همیشه «سقف ورود» را متهم می‌کرد — ولی رمزِ غلط، سرویسِ
  # خاموش و سقفِ ورود سه چیز متفاوت‌اند و سه راه‌حل متفاوت دارند.
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
    # پاسخ JSON نبود: خالی، ۴۲۹ بی‌بدنه، یا اتصال قطع‌شده.  بدون این
    # برچسب، خروجیِ خالی در گزارش شبیه اشکال منطقی به نظر می‌رسید.
    # برچسب باید بی‌گیومه و بی‌بک‌اسلش باشد: این مقدار در عبارتِ
    # پایتونِ سنجهٔ بعدی جاگذاری می‌شود و اگر گیومه داشته باشد نحو
    # را می‌شکند — یعنی برچسبِ تشخیصی، خودش شکست تازه می‌سازد.
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

cleanup() {
  psql "DELETE FROM \"Inventory\" WHERE \"productId\" IN
          (SELECT id FROM \"Product\" WHERE sku LIKE 'IMP-%');
        DELETE FROM \"Product\" WHERE sku LIKE 'IMP-%';
        DELETE FROM \"Category\" WHERE name = 'لبنیات وارداتی';"
}
cleanup

# فایل نمونه — همان چیزی که از اکسل فارسی بیرون می‌آید:
#   سرستون فارسی، BOM، جداکنندهٔ نقطه‌ویرگول، عدد فارسی با جداکنندهٔ
#   هزارگان، یک سطر بی‌قیمت، و یک کد تکراری.
build_body() {
python3 - "$1" <<'PY'
import io, json, sys

csv = "﻿" + "\r\n".join([
    "کد کالا;نام کالا;واحد;قیمت خرید;قیمت فروش;موجودی;گروه کالا",
    "IMP-001;شیر پرچرب ۱ لیتری;بطری;۲۵٬۰۰۰;۳۲٬۵۰۰;۴۰;لبنیات وارداتی",
    "IMP-002;ماست سنتی ۹۰۰ گرمی;ظرف;۴۵٬۰۰۰;۵۸٬۰۰۰;۱۵;لبنیات وارداتی",
    'IMP-003;"پنیر, لیقوان";بسته;۱۲۰٬۰۰۰;۱۵۵٬۰۰۰;۸;لبنیات وارداتی',
    "IMP-004;کره حیوانی;بسته;نامشخص;;۵;لبنیات وارداتی",
    "IMP-002;ماست تکراری;ظرف;۴۵٬۰۰۰;۵۸٬۰۰۰;۹۹;لبنیات وارداتی",
])

body = {"csv": csv}
if len(sys.argv) > 2:
    body.update(json.loads(sys.argv[2]))

io.open(sys.argv[1], "w", encoding="utf-8").write(json.dumps(body, ensure_ascii=False))
PY
}

echo '--- 1) preview reads a real Persian export ---'
build_body "$TMP"
PV=$(curl -s -X POST $A/products/import/preview -H "$AU" -H "$JS" --data-binary "@$TMP")

chk "columns matched"   "$(echo "$PV" | P "len(d['missing'])")" "0"
chk "valid rows"        "$(echo "$PV" | P "d['total']")" "3"
chk "will create three" "$(echo "$PV" | P "d['willCreate']")" "3"
chk "nothing to update" "$(echo "$PV" | P "d['willUpdate']")" "0"

echo '--- 2) bad rows are reported with their line number ---'
chk "two rows rejected" "$(echo "$PV" | P "len(d['errors'])")" "2"
chk "missing price line" "$(echo "$PV" | P "'yes' if any(e['line']==5 for e in d['errors']) else 'no'")" "yes"
chk "duplicate code line" "$(echo "$PV" | P "'yes' if any(e['line']==6 for e in d['errors']) else 'no'")" "yes"

echo '--- 3) preview writes nothing ---'
# مهم‌ترین ضمانت این صفحه: دیدن ≠ نوشتن.
chk "still empty" "$(psqlv "SELECT COUNT(*) FROM \"Product\" WHERE sku LIKE 'IMP-%'")" "0"

echo '--- 4) the real import writes them ---'
R=$(curl -s -X POST $A/products/import -H "$AU" -H "$JS" --data-binary "@$TMP")
chk "created three" "$(echo "$R" | P "d['created']")" "3"
chk "none updated"  "$(echo "$R" | P "d['updated']")" "0"
chk "in database"   "$(psqlv "SELECT COUNT(*) FROM \"Product\" WHERE sku LIKE 'IMP-%'")" "3"

echo '--- 5) Persian numbers become real numbers ---'
# «۳۲٬۵۰۰» باید ۳۲۵۰۰ شود، نه صفر و نه NaN.
chk "sale price parsed"     "$(psqlv "SELECT \"salePrice\"::int FROM \"Product\" WHERE sku='IMP-001'")" "32500"
chk "purchase price parsed" "$(psqlv "SELECT \"purchasePrice\"::int FROM \"Product\" WHERE sku='IMP-001'")" "25000"
chk "no zero prices"        "$(psqlv "SELECT COUNT(*) FROM \"Product\" WHERE sku LIKE 'IMP-%' AND \"salePrice\" = 0")" "0"

echo '--- 6) quoted comma survives ---'
chk "comma inside name" "$(psqlv "SELECT name FROM \"Product\" WHERE sku='IMP-003'")" "پنیر, لیقوان"

echo '--- 7) category is created and linked ---'
chk "category made"  "$(psqlv "SELECT COUNT(*) FROM \"Category\" WHERE name='لبنیات وارداتی'")" "1"
chk "products linked" "$(psqlv "SELECT COUNT(*) FROM \"Product\" p JOIN \"Category\" c ON c.id=p.\"categoryId\" WHERE p.sku LIKE 'IMP-%' AND c.name='لبنیات وارداتی'")" "3"

echo '--- 8) stock lands in the warehouse ---'
chk "stock written" "$(psqlv "SELECT quantity::int FROM \"Inventory\" i JOIN \"Product\" p ON p.id=i.\"productId\" WHERE p.sku='IMP-001'")" "40"

echo '--- 9) importing twice updates, never duplicates ---'
# دومین بار که کاربر فایل را وارد می‌کند — که حتماً می‌کند — نباید
# همه‌چیز دو برابر شود.
R2=$(curl -s -X POST $A/products/import -H "$AU" -H "$JS" --data-binary "@$TMP")
chk "updated three"   "$(echo "$R2" | P "d['updated']")" "3"
chk "created none"    "$(echo "$R2" | P "d['created']")" "0"
chk "still three rows" "$(psqlv "SELECT COUNT(*) FROM \"Product\" WHERE sku LIKE 'IMP-%'")" "3"

echo '--- 10) re-import does not overwrite counted stock ---'
# موجودی از فروش و خرید واقعی می‌آید، نه از فایل؛ بازنویسی‌اش شمارش انبار
# را پاک می‌کند.
psql "UPDATE \"Inventory\" SET quantity = 7 WHERE \"productId\" =
        (SELECT id FROM \"Product\" WHERE sku='IMP-001');"
curl -s -X POST $A/products/import -H "$AU" -H "$JS" --data-binary "@$TMP" >/dev/null
chk "stock untouched" "$(psqlv "SELECT quantity::int FROM \"Inventory\" i JOIN \"Product\" p ON p.id=i.\"productId\" WHERE p.sku='IMP-001'")" "7"

echo '--- 11) a file without the required columns is refused ---'
python3 - "$TMP" <<'PY'
import io, json, sys
io.open(sys.argv[1], "w", encoding="utf-8").write(
    json.dumps({"csv": "کد;واحد\nIMP-X;عدد"}, ensure_ascii=False)
)
PY
chk "missing columns refused" "$(curl -s -X POST $A/products/import/preview -H "$AU" -H "$JS" --data-binary "@$TMP" | P "d.get('statusCode')")" "400"

echo '--- 12) an empty file is refused ---'
chk "empty refused" "$(curl -s -X POST $A/products/import/preview -H "$AU" -H "$JS" -d '{"csv":""}' | P "d.get('statusCode')")" "400"

rm -f "$TMP"
cleanup

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
