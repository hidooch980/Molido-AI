#!/usr/bin/env bash
#
# صف ارسال صورتحساب به سامانهٔ مؤدیان.
#
# مهم‌ترین چیزی که اینجا آزموده می‌شود: **یک فاکتور دوبار به سازمان
# نرود**، و **شمارهٔ مالیاتی هرگز تکرار نشود**.  اصلاح این دو پس از وقوع،
# دستی و پرهزینه است.
#
# همه‌چیز در حالت آزمایشی اجرا می‌شود؛ هیچ درخواستی به سامانهٔ واقعی
# نمی‌رود.
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
T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق — سقف ورود خورده یا سرویس بالا نیست"
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "import sys,json,io;sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8');sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

psql "DELETE FROM \"TaxInvoiceLog\";
      UPDATE \"Sale\" SET \"taxInvoiceId\" = NULL;
      DELETE FROM \"TaxInvoice\";
      DELETE FROM \"TaxSetting\";
      UPDATE \"Inventory\" SET quantity = 10000 WHERE \"productId\" LIKE 'seed-%';"

WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")

echo '--- 1) disabled by default ---'
# پیش‌فرض خاموش است تا نصب تازه به‌طور تصادفی چیزی به سازمان نفرستد.
S=$(curl -s "$A/tax/settings" -H "$AU")
chk "starts disabled" "$(echo "$S" | P "d['isEnabled']")" "False"
chk "starts in sandbox" "$(echo "$S" | P "d['isSandbox']")" "True"

echo '--- 2) real mode needs credentials ---'
chk "no key, no real mode" "$(curl -s -X POST $A/tax/settings -H "$AU" -H "$JS" \
  -d '{"isEnabled":true,"isSandbox":false}' | P "d.get('statusCode')")" "400"

echo '--- 3) sandbox setup ---'
curl -s -X POST $A/tax/settings -H "$AU" -H "$JS" \
  -d '{"memoryId":"A1B2C3","economicCode":"411222333","isEnabled":true,"isSandbox":true}' >/dev/null
chk "enabled" "$(curl -s "$A/tax/settings" -H "$AU" | P "d['isEnabled']")" "True"

echo '--- 4) private key never leaves the server ---'
curl -s -X POST $A/tax/settings -H "$AU" -H "$JS" \
  -d '{"privateKeyPem":"-----BEGIN PRIVATE KEY-----SECRET-----END PRIVATE KEY-----"}' >/dev/null
chk "key masked in API"  "$(curl -s "$A/tax/settings" -H "$AU" | P "d['privateKeyPem']")" "***"
chk "key stored in DB"   "$(psqlv "SELECT CASE WHEN \"privateKeyPem\" LIKE '%SECRET%' THEN 'yes' ELSE 'no' END FROM \"TaxSetting\"")" "yes"

# ارسال دوبارهٔ مقدار پوشانده نباید کلید واقعی را خراب کند
curl -s -X POST $A/tax/settings -H "$AU" -H "$JS" -d '{"privateKeyPem":"***"}' >/dev/null
chk "mask does not overwrite" "$(psqlv "SELECT CASE WHEN \"privateKeyPem\" LIKE '%SECRET%' THEN 'yes' ELSE 'no' END FROM \"TaxSetting\"")" "yes"

echo '--- 5) a sale can be queued ---'
SID=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}" | P "d['id']")
Q=$(curl -s -X POST "$A/tax/invoices/$SID" -H "$AU" -H "$JS")
TAXID=$(echo "$Q" | P "d.get('taxId','')")
chk "queued"            "$([ -n "$TAXID" ] && echo yes || echo no)" "yes"
chk "tax id is 22 chars" "${#TAXID}" "22"
chk "starts with memory id" "${TAXID:0:6}" "A1B2C3"
chk "status QUEUED"     "$(psqlv "SELECT status FROM \"TaxInvoice\" WHERE \"saleId\"='$SID'")" "QUEUED"
chk "sale links back"   "$(psqlv "SELECT CASE WHEN \"taxInvoiceId\" IS NULL THEN 'no' ELSE 'yes' END FROM \"Sale\" WHERE id='$SID'")" "yes"

echo '--- 6) the same sale is never queued twice ---'
# این مهم‌ترین آزمون این فایل است: صورتحساب تکراری در سازمان، اصلاح دستی
# می‌خواهد.
Q2=$(curl -s -X POST "$A/tax/invoices/$SID" -H "$AU" -H "$JS")
chk "same tax id returned" "$(echo "$Q2" | P "d['taxId']")" "$TAXID"
chk "only one row"         "$(psqlv "SELECT COUNT(*) FROM \"TaxInvoice\" WHERE \"saleId\"='$SID'")" "1"

echo '--- 7) tax ids are unique across sales ---'
for i in 1 2 3; do
  S2=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" \
    -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}" | P "d['id']")
  curl -s -X POST "$A/tax/invoices/$S2" -H "$AU" -H "$JS" >/dev/null
done
TOTAL=$(psqlv "SELECT COUNT(*) FROM \"TaxInvoice\"")
UNIQUE=$(psqlv "SELECT COUNT(DISTINCT \"taxId\") FROM \"TaxInvoice\"")
chk "all tax ids distinct" "$UNIQUE" "$TOTAL"

echo '--- 8) the queue runs without touching the real system ---'
R=$(curl -s -X POST $A/tax/process -H "$AU" -H "$JS" -d '{}')
chk "processed all"   "$(echo "$R" | P "d['processed']")" "$TOTAL"
chk "none failed"     "$(echo "$R" | P "d['failed']")" "0"
chk "status SENT"     "$(psqlv "SELECT COUNT(*) FROM \"TaxInvoice\" WHERE status='SENT'")" "$TOTAL"
chk "sandbox reference" "$(psqlv "SELECT CASE WHEN \"referenceNo\" LIKE 'SANDBOX-%' THEN 'yes' ELSE 'no' END FROM \"TaxInvoice\" WHERE \"saleId\"='$SID'")" "yes"
chk "logged"          "$(psqlv "SELECT COUNT(*) FROM \"TaxInvoiceLog\" WHERE action='SEND'")" "$TOTAL"

echo '--- 9) a sent invoice is not re-sent ---'
R2=$(curl -s -X POST $A/tax/process -H "$AU" -H "$JS" -d '{}')
chk "queue empty now" "$(echo "$R2" | P "d['processed']")" "0"

echo '--- 10) cancelled sales are refused ---'
S3=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}" | P "d['id']")
psql "UPDATE \"Sale\" SET status='CANCELLED' WHERE id='$S3';"
chk "cancelled refused" "$(curl -s -X POST "$A/tax/invoices/$S3" -H "$AU" -H "$JS" | P "d.get('statusCode')")" "400"

echo '--- 11) stats show what is NOT queued ---'
# مهم‌ترین عدد این صفحه: فاکتوری که در صف نیست، هرگز به سازمان نمی‌رسد.
chk "stats has notQueued" "$(curl -s "$A/tax/stats" -H "$AU" | P "'yes' if 'notQueued' in d else 'no'")" "yes"
chk "sent counted"        "$(curl -s "$A/tax/stats" -H "$AU" | P "d['sent']")" "$TOTAL"

echo '--- 12) a new sale enters the queue by itself ---'
# یکپارچگی واقعی: صندوق‌دار نباید یادش باشد دکمهٔ مالیات را بزند.  اگر
# افزودن به صف دستی بماند، دیر یا زود فاکتوری جا می‌ماند و ماه‌ها بعد در
# مغایرت مالیاتی کشف می‌شود.
S4=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}" | P "d['id']")
chk "auto-queued on create" "$(psqlv "SELECT COUNT(*) FROM \"TaxInvoice\" WHERE \"saleId\"='$S4'")" "1"
chk "sale links to it"      "$(psqlv "SELECT CASE WHEN \"taxInvoiceId\" IS NULL THEN 'no' ELSE 'yes' END FROM \"Sale\" WHERE id='$S4'")" "yes"
chk "auto tax id valid"     "$(psqlv "SELECT length(\"taxId\") FROM \"TaxInvoice\" WHERE \"saleId\"='$S4'")" "22"

# و خاموش بودن مالیات نباید فروش را بشکند — پرتکرارترین حالت واقعی.
curl -s -X POST $A/tax/settings -H "$AU" -H "$JS" -d '{"isEnabled":false}' >/dev/null
S5=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}" | P "d.get('id','')")
chk "sale works when tax is off" "$([ -n "$S5" ] && echo yes || echo no)" "yes"
chk "nothing queued when off"    "$(psqlv "SELECT COUNT(*) FROM \"TaxInvoice\" WHERE \"saleId\"='$S5'")" "0"
curl -s -X POST $A/tax/settings -H "$AU" -H "$JS" -d '{"isEnabled":true}' >/dev/null

echo '--- 12) bulk queueing drains the backlog ---'
# سقف هر فراخوانی عمدی است: افزودن ده‌هزار فاکتور در یک درخواست، اتصال
# را نگه می‌دارد و تایم‌اوت می‌خورد.  پس آزمون تا تخلیهٔ کامل تکرار
# می‌کند — همان کاری که کاربر با کلیک دوباره می‌کند.
BEFORE=$(curl -s "$A/tax/stats" -H "$AU" | P "d['notQueued']")
chk "there is a backlog" "$([ "$BEFORE" -gt 0 ] && echo yes || echo no)" "yes"

B=$(curl -s -X POST $A/tax/enqueue-pending -H "$AU" -H "$JS" -d '{"limit":50}')
chk "respects the limit" "$(echo "$B" | P "'yes' if d['added'] <= 50 else 'no'")" "yes"

AFTER=$(curl -s "$A/tax/stats" -H "$AU" | P "d['notQueued']")
chk "backlog shrank" "$([ "$AFTER" -lt "$BEFORE" ] && echo yes || echo no)" "yes"

# تکرار تا تهی شدن؛ سقف حلقه برای اینکه یک باگ، آزمون را بی‌پایان نکند.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  LEFT=$(curl -s "$A/tax/stats" -H "$AU" | P "d['notQueued']")
  [ "$LEFT" = "0" ] && break
  curl -s -X POST $A/tax/enqueue-pending -H "$AU" -H "$JS" -d '{"limit":200}' >/dev/null
done
chk "drains completely" "$(curl -s "$A/tax/stats" -H "$AU" | P "d['notQueued']")" "0"

# پاک‌سازی
psql "DELETE FROM \"TaxInvoiceLog\";
      UPDATE \"Sale\" SET \"taxInvoiceId\" = NULL;
      DELETE FROM \"TaxInvoice\";
      DELETE FROM \"TaxSetting\";"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
