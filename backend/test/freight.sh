#!/usr/bin/env bash
#
# کرایهٔ حمل ورودی: سرشکن بر بهای کالا و سند حسابداری.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

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
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

SUP=$(curl -s "$A/suppliers" -H "$AU" | P "d[0]['id']")

echo '--- 1) purchase with freight: 2 items 100k + 300k, freight 40k ---'
# سرشکن به نسبت ارزش ⇒ 10k و 30k
PU=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$SUP\",\"warehouseId\":\"seed-warehouse\",\"freightCost\":40000,
  \"items\":[
    {\"productId\":\"seed-p1\",\"quantity\":1,\"purchasePrice\":100000},
    {\"productId\":\"seed-p2\",\"quantity\":1,\"purchasePrice\":300000}
  ]}")
PID=$(echo "$PU" | P "d.get('id','')")
chk "purchase created" "$(echo "$PU" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 2) receive => freight allocated by value ---'
curl -s -X PATCH "$A/purchases/$PID/receive" -H "$AU" -H "$JS" -d '{}' >/dev/null
chk "share of cheap item" "$(Q "SELECT COALESCE(\"freightShare\",0)::bigint FROM \"PurchaseItem\" WHERE \"purchaseId\"='$PID' AND \"productId\"='seed-p1';")" "10000"
chk "share of costly item" "$(Q "SELECT COALESCE(\"freightShare\",0)::bigint FROM \"PurchaseItem\" WHERE \"purchaseId\"='$PID' AND \"productId\"='seed-p2';")" "30000"

echo '--- 3) shares sum exactly to freight ---'
chk "no rial lost" "$(Q "SELECT COALESCE(SUM(\"freightShare\"),0)::bigint FROM \"PurchaseItem\" WHERE \"purchaseId\"='$PID';")" "40000"

echo '--- 4) landed cost includes freight ---'
chk "landed cost p1" "$(Q "SELECT COALESCE(\"landedUnitCost\",0)::bigint FROM \"PurchaseItem\" WHERE \"purchaseId\"='$PID' AND \"productId\"='seed-p1';")" "110000"
chk "product cost updated" "$(Q "SELECT \"purchasePrice\"::bigint FROM \"Product\" WHERE id='seed-p1';")" "110000"

echo '--- 5) freight capitalised into inventory (1104), not expensed ---'
chk "inventory debited" "$(Q "SELECT COALESCE(SUM(l.debit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" JOIN \"Account\" a ON a.id=l.\"accountId\" WHERE e.\"sourceType\"='PurchaseFreight' AND e.\"sourceId\"='$PID' AND a.code='1104';")" "40000"
chk "freight payable credited" "$(Q "SELECT COALESCE(SUM(l.credit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" JOIN \"Account\" a ON a.id=l.\"accountId\" WHERE e.\"sourceType\"='PurchaseFreight' AND e.\"sourceId\"='$PID' AND a.code='2107';")" "40000"

echo '--- 6) trial balance still zero ---'
chk "trial balance" "$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" WHERE e.status<>'DRAFT';")" "0"

echo '--- 7) purchase without freight posts no freight entry ---'
PU2=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$SUP\",\"warehouseId\":\"seed-warehouse\",
  \"items\":[{\"productId\":\"seed-p3\",\"quantity\":1,\"purchasePrice\":50000}]}")
P2=$(echo "$PU2" | P "d.get('id','')")
curl -s -X PATCH "$A/purchases/$P2/receive" -H "$AU" -H "$JS" -d '{}' >/dev/null
chk "no freight entry" "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='PurchaseFreight' AND \"sourceId\"='$P2';")" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
