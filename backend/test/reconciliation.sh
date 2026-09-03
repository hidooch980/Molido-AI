#!/usr/bin/env bash
#
# مغایرت‌گیری بانکی.
#
# ⚠️ دو سنجهٔ اصلی، و هر دو دربارهٔ خطایی‌اند که «تراز» به نظر می‌رسد:
#
#    ۱) **تطبیقِ مبهم نباید انجام شود.**  دو پرداختِ هم‌مبلغ در یک روز
#       در فروشگاه عادی است.  تطبیقِ خودکارِ ساده اولی را برمی‌دارد و
#       نصفِ مواقع اشتباه جفت می‌کند — و نتیجه هم تراز است، چون مبلغ‌ها
#       یکی‌اند.  فقط شرح و مرجعِ اشتباه به هم چسبیده.
#
#    ۲) **یک گردش نباید دو سطرِ بانک را ببندد.**  بدونِ قیدِ یکتا، یک
#       واریز می‌تواند دو سطر را پوشش دهد و مغایرت‌گیری تراز شود در
#       حالی که پولی گم شده.

set -u
cd "$(dirname "$0")/.."

API=http://localhost:3000
CF="-f ../docker-compose.yml -f ../docker-compose.store.yml"
PASS=0; FAIL=0

chk() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}
sec() { printf -- '--- %s ---\n' "$*"; }
Q() { docker compose $CF exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>&1 | tr -d '\r'; }
P() { python -c "$1" 2>/dev/null; }

PW="${MOLIDO_ADMIN_PASSWORD:-}"
[ -n "$PW" ] || PW="$(grep '^ADMIN_PASSWORD=' ../.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | P 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
[ -n "$TOKEN" ] || { echo "  ✗ ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

CO=seed-company

cleanup() {
  Q "DELETE FROM \"BankStatementLine\"    WHERE \"companyId\"='$CO';
     DELETE FROM \"BankReconciliation\"   WHERE \"companyId\"='$CO';
     DELETE FROM \"TreasuryTransaction\"  WHERE id LIKE 'rc-%';
     DELETE FROM \"TreasuryAccount\"      WHERE id LIKE 'rc-%';" >/dev/null
}
trap cleanup EXIT
cleanup

POST() { curl -s "${A[@]}" -X POST "$API$1" -d "$2"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X POST "$API$1" -d "$2"; }
PATCHC(){ curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X PATCH "$API$1" -d "${2:-{\}}"; }

# ---------------------------------------------------------------- فیکسچر
#
# گردشِ دفتر (خزانه) تا ۱۴۰۵/۰۳/۳۱:
#   +۵٬۰۰۰٬۰۰۰  واریز    ← بانک هم دارد
#   −۱٬۲۰۰٬۰۰۰  برداشت   ← بانک هم دارد
#   −۸۰۰٬۰۰۰    چکِ صادرشده ← بانک **ندارد** (در راه)
#   +۳۰۰٬۰۰۰    واریز    ← مبهم، دوقلو
#   +۳۰۰٬۰۰۰    واریز    ← مبهم، دوقلو
#   ────────── ماندهٔ دفتر = ۳٬۶۰۰٬۰۰۰
#
# صورتحسابِ بانک:
#   +۵٬۰۰۰٬۰۰۰ · −۱٬۲۰۰٬۰۰۰ · +۳۰۰٬۰۰۰ · −۵۰٬۰۰۰ (کارمزد، دفتر ندارد)
#   ────────── ماندهٔ بانک = ۴٬۰۵۰٬۰۰۰
sec "۰) ساخت داده"
# WARN موجودیِ حساب باید با گردشی که درج می‌کنیم بخواند.
#      نسخهٔ اول حساب را با موجودیِ صفر ساخت و گردش‌ها را مستقیم در
#      پایگاه درج کرد — حالتی که در واقعیت ممکن نیست.  بعد recordLine
#      برداشت را با «موجودی کافی نیست» رد کرد و به‌نظر رسید قابلیت خراب
#      است، در حالی که نگهبانِ خزانه درست کار می‌کرد.
#      ۵٬۰۰۰٬۰۰۰ − ۱٬۲۰۰٬۰۰۰ − ۸۰۰٬۰۰۰ + ۳۰۰٬۰۰۰ + ۳۰۰٬۰۰۰ = ۳٬۶۰۰٬۰۰۰
Q "INSERT INTO \"TreasuryAccount\" (id,\"companyId\",name,type,\"bankName\",balance)
     VALUES ('rc-acc','$CO','حساب جاری','BANK','ملت',3600000);" >/dev/null

# WARN مبلغِ گردشِ خزانه **بی‌علامت** است و جهت در `type` می‌نشیند —
#      همان قراردادی که `createTransaction` رعایت می‌کند.
#
#      نسخهٔ اول عددِ منفی درج می‌کرد.  با خودش سازگار بود، پس آزمون سبز
#      می‌داد — ولی سرویس `SUM(amount)` می‌نوشت و روی دادهٔ **واقعی**
#      برداشت‌ها را جمع می‌کرد نه کم.  اشکال فقط وقتی بیرون زد که
#      `recordLine` یک گردشِ واقعی ساخت و ماندهٔ دفتر با ثبتِ یک هزینه
#      بالا رفت.
#
#      فیکسچری که قراردادِ واقعیِ داده را رعایت نکند، اشکال را می‌پوشاند.
mk() { Q "INSERT INTO \"TreasuryTransaction\" (id,\"companyId\",\"accountId\",type,amount,reference,description,date)
          VALUES ('$1','$CO','rc-acc','$2',$3,'$4','$5','$6')" >/dev/null; }
mk rc-t1 DEPOSIT     5000000  REF-1 'واریز فروش'   '2026-04-10'
mk rc-t2 WITHDRAWAL  1200000  REF-2 'پرداخت اجاره' '2026-04-15'
mk rc-t3 WITHDRAWAL   800000  REF-3 'چک صادرشده'   '2026-06-15'
mk rc-t4 DEPOSIT      300000  REF-4 'واریز الف'    '2026-05-10'
mk rc-t5 DEPOSIT      300000  REF-5 'واریز ب'      '2026-05-10'
chk "پنج گردشِ دفتر" "$(Q "SELECT count(*) FROM \"TreasuryTransaction\" WHERE id LIKE 'rc-%'")" "5"

# ---------------------------------------------------------------- جلسه
sec "۱) جلسهٔ مغایرت‌گیری"
REC=$(POST /bank-reconciliation \
  '{"accountId":"rc-acc","statementDate":"2026-06-21","statementBalance":4050000}' \
  | P 'import sys,json;print(json.load(sys.stdin).get("id",""))')
chk "جلسه ساخته شد" "$([ -n "$REC" ] && echo yes || echo no)" "yes"
# ⚠️ دو جلسهٔ باز روی یک تاریخ یعنی دو نفر نیمی از سطرها را می‌بندند.
chk "جلسهٔ تکراری روی همان تاریخ رد می‌شود" \
  "$(CODE /bank-reconciliation '{"accountId":"rc-acc","statementDate":"2026-06-21","statementBalance":1}')" "400"
chk "حساب ناموجود ۴۰۴" \
  "$(CODE /bank-reconciliation '{"accountId":"nope","statementDate":"2026-06-22","statementBalance":1}')" "404"

# ---------------------------------------------------------------- سطرها
sec "۲) سطرهای صورتحساب"
R=$(POST "/bank-reconciliation/$REC/lines" '{"lines":[
  {"occurredAt":"2026-04-10","amount":5000000,"reference":"REF-1","description":"واریز"},
  {"occurredAt":"2026-04-16","amount":-1200000,"reference":"REF-2","description":"اجاره"},
  {"occurredAt":"2026-05-10","amount":300000,"reference":"?","description":"واریز مبهم"},
  {"occurredAt":"2026-05-20","amount":-50000,"reference":"FEE","description":"کارمزد"}]}')
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }
chk "چهار سطر افزوده شد" "$(J "d.get('added')")" "4"
# ⚠️ نیمی از صورتحساب بدتر از هیچ است — همه یا هیچ.
chk "سطرِ بی‌تاریخ کلِ دسته را رد می‌کند" \
  "$(CODE "/bank-reconciliation/$REC/lines" '{"lines":[{"occurredAt":"2026-05-01","amount":100},{"amount":200}]}')" "400"
chk "و هیچ سطری اضافه نشد" \
  "$(Q "SELECT count(*) FROM \"BankStatementLine\" WHERE \"reconciliationId\"='$REC'")" "4"
chk "مبلغِ صفر رد می‌شود" \
  "$(CODE "/bank-reconciliation/$REC/lines" '{"lines":[{"occurredAt":"2026-05-01","amount":0}]}')" "400"

# ---------------------------------------------------------------- تطبیق خودکار
sec "۳) تطبیقِ خودکار"
R=$(POST "/bank-reconciliation/$REC/auto-match" '{}')
chk "دو سطر تطبیق خورد"      "$(J "d.get('matched')")"   "2"
# ⚠️ سطرِ ۳۰۰٬۰۰۰ دو کاندید دارد — نباید هیچ‌کدام انتخاب شود.
chk "سطرِ مبهم دست‌نخورده ماند" "$(J "d.get('ambiguous')")" "1"
chk "کارمزد کاندید ندارد و نماند" \
  "$(Q "SELECT count(*) FROM \"BankStatementLine\"
         WHERE \"reconciliationId\"='$REC' AND reference='FEE' AND \"matchedTxId\" IS NULL")" "1"
chk "تطبیق‌ها با برچسب AUTO ثبت شدند" \
  "$(Q "SELECT count(*) FROM \"BankStatementLine\"
         WHERE \"reconciliationId\"='$REC' AND \"matchMethod\"='AUTO'")" "2"

# ---------------------------------------------------------------- یکتایی
sec "۴) یک گردش، یک سطر"
L3=$(Q "SELECT id FROM \"BankStatementLine\" WHERE \"reconciliationId\"='$REC' AND reference='?'")
LFEE=$(Q "SELECT id FROM \"BankStatementLine\" WHERE \"reconciliationId\"='$REC' AND reference='FEE'")
chk "تطبیقِ دستیِ سطرِ مبهم" "$(PATCHC "/bank-reconciliation/lines/$L3/match" '{"transactionId":"rc-t4"}')" "200"
# ⚠️ همان گردش نباید سطرِ دومی را هم ببندد.
chk "همان گردش برای سطرِ دیگر رد می‌شود" \
  "$(PATCHC "/bank-reconciliation/lines/$LFEE/match" '{"transactionId":"rc-t4"}')" "400"

# ---------------------------------------------------------------- خلاصه
sec "۵) خلاصه و اختلاف"
R=$(curl -s "${A[@]}" "$API/bank-reconciliation/$REC")
chk "ماندهٔ دفتر"    "$(J "int(d['bookBalance'])")"      "3600000"
chk "ماندهٔ بانک"    "$(J "int(d['statementBalance'])")" "4050000"
# در راه = چکِ ۸۰۰ هزارِ نقدنشده + واریزِ ۳۰۰ هزارِ تطبیق‌نخورده = −۵۰۰٬۰۰۰
chk "در راه"        "$(J "int(d['inTransit'])")"        "-500000"
chk "بانکِ تطبیق‌نخورده (کارمزد)" "$(J "int(d['unmatchedBankTotal'])")" "-50000"
#
#   ماندهٔ تعدیل‌شدهٔ بانک = ۴٬۰۵۰٬۰۰۰ + (−۵۰۰٬۰۰۰) = ۳٬۵۵۰٬۰۰۰
#   ماندهٔ تعدیل‌شدهٔ دفتر = ۳٬۶۰۰٬۰۰۰ + (−۵۰٬۰۰۰)  = ۳٬۵۵۰٬۰۰۰
#
chk "ماندهٔ تعدیل‌شدهٔ بانک" "$(J "int(d['adjustedBank'])")" "3550000"
chk "ماندهٔ تعدیل‌شدهٔ دفتر" "$(J "int(d['adjustedBook'])")" "3550000"
chk "اختلاف صفر است" "$(J "int(d['difference'])")"       "0"
chk "تراز است"       "$(J "d['isBalanced']")"            "True"

# ---------------------------------------------------------------- کارمزدِ فراموش‌شده
sec "۵ب) قلمِ جاافتاده باید اختلاف بسازد"
#
# ⚠️ این سنجه از فرمولِ اول عبور می‌کرد و هیچ نمی‌گفت.
#
#    فرمولِ اولِ من `bookBalance - inTransit + unmatchedBankTotal` بود،
#    که بنا به تعریف همیشه برابرِ جمعِ سطرهای بانک درمی‌آمد — یک
#    این‌همان‌گویی.  کارمزدِ ثبت‌نشده در دفتر را نمی‌دید.
#
#    اینجا کارمزد را از تطبیق درمی‌آوریم و **حذفش** می‌کنیم؛ آن‌وقت
#    اقلامِ بانکیِ ثبت‌نشده صفر می‌شود و ماندهٔ تعدیل‌شدهٔ دفتر ۵۰٬۰۰۰
#    بالاتر می‌ماند.  اختلاف باید ظاهر شود.
Q "DELETE FROM \"BankStatementLine\" WHERE id='$LFEE'" >/dev/null
R=$(curl -s "${A[@]}" "$API/bank-reconciliation/$REC")
chk "با حذفِ کارمزد، اختلاف پیدا می‌شود" "$(J "int(d['difference'])")" "-50000"
chk "و دیگر تراز نیست"                    "$(J "d['isBalanced']")"      "False"
chk "بستنِ نابرابر رد می‌شود"             "$(PATCHC "/bank-reconciliation/$REC/complete")" "400"

# کارمزد را برمی‌گردانیم تا بخشِ بستن روی حالتِ تراز اجرا شود.
Q "INSERT INTO \"BankStatementLine\" (id,\"companyId\",\"reconciliationId\",\"occurredAt\",amount,reference,description)
   VALUES ('$LFEE','$CO','$REC','2026-05-20',-50000,'FEE','کارمزد')" >/dev/null
R=$(curl -s "${A[@]}" "$API/bank-reconciliation/$REC")
chk "با برگشتش دوباره تراز می‌شود" "$(J "d['isBalanced']")" "True"

# ---------------------------------------------------------------- ثبت در دفتر
sec "۵ج) ثبتِ سطرِ جامانده در دفتر"
#
# ⚠️ این حلقهٔ اصلیِ مغایرت‌گیری است: قلم پیدا می‌شود، همان‌جا ثبت
#    می‌شود، و همان‌جا تطبیق می‌خورد.  اگر کاربر مجبور باشد برود صفحهٔ
#    خزانه و دستی بزند، در عمل رهایش می‌کند.
#
# کارمزد را دوباره از تطبیق درمی‌آوریم تا سطرِ جاماندهٔ واقعی باشد.
Q "DELETE FROM \"BankStatementLine\" WHERE id='$LFEE';
   INSERT INTO \"BankStatementLine\" (id,\"companyId\",\"reconciliationId\",\"occurredAt\",amount,reference,description)
   VALUES ('$LFEE','$CO','$REC','2026-05-20',-50000,'FEE','کارمزد');" >/dev/null

BEFORE_TX=$(Q "SELECT count(*) FROM \"TreasuryTransaction\" WHERE \"accountId\"='rc-acc'")
R=$(POST "/bank-reconciliation/lines/$LFEE/record" '{"reason":"FEE"}')
chk "گردشِ خزانه ساخته شد" \
  "$(Q "SELECT count(*) FROM \"TreasuryTransaction\" WHERE \"accountId\"='rc-acc'")" "$((BEFORE_TX+1))"
chk "سطر تطبیق خورد" \
  "$(Q "SELECT (\"matchedTxId\" IS NOT NULL) FROM \"BankStatementLine\" WHERE id='$LFEE'")" "t"

# ⚠️ مبلغِ منفیِ بانک باید برداشت شود، نه واریز.  اگر عددِ علامت‌دار
#    مستقیم پاس داده شود، موجودی بالا می‌رود.
chk "برداشت ثبت شد نه واریز" \
  "$(Q "SELECT type FROM \"TreasuryTransaction\" t
          JOIN \"BankStatementLine\" b ON b.\"matchedTxId\"=t.id WHERE b.id='$LFEE'")" "WITHDRAWAL"
# WARN ستونِ `amount` در هر دو جدول هست؛ بدونِ پیشوند مبهم است.
chk "مبلغ بی‌علامت است" \
  "$(Q "SELECT t.amount::int FROM \"TreasuryTransaction\" t
          JOIN \"BankStatementLine\" b ON b.\"matchedTxId\"=t.id WHERE b.id='$LFEE'")" "50000"

# ⚠️ کارمزد باید به حسابِ اختصاصیِ ۵۲۰۷ برود، نه «سایر هزینه‌ها»ی ۵۲۹۹.
#    وگرنه کسی نمی‌داند سالی چقدر به بانک می‌دهد.
chk "کارمزد به حساب ۵۲۰۷ نشست" \
  "$(Q "SELECT COALESCE(sum(l.debit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='5207' AND e.\"sourceType\"='TreasuryMovement'")" "50000"
chk "در سایر هزینه‌ها (۵۲۹۹) ننشست" \
  "$(Q "SELECT COALESCE(sum(l.debit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='5299' AND e.\"sourceType\"='TreasuryMovement'")" "0"

chk "ثبتِ دوبارهٔ همان سطر رد می‌شود" \
  "$(CODE "/bank-reconciliation/lines/$LFEE/record" '{"reason":"FEE"}')" "400"

# حالا کارمزد در دفتر هست، پس دیگر «بانکیِ ثبت‌نشده» نیست و در عوض
# جزو گردشِ دفتر آمده — تراز باید همچنان برقرار باشد.
R=$(curl -s "${A[@]}" "$API/bank-reconciliation/$REC")
chk "پس از ثبت، همچنان تراز است" "$(J "d['isBalanced']")" "True"

# ---------------------------------------------------------------- بستن
sec "۶) بستن"
chk "با اختلافِ صفر بسته می‌شود" "$(PATCHC "/bank-reconciliation/$REC/complete")" "200"
chk "وضعیت COMPLETED شد" "$(Q "SELECT status FROM \"BankReconciliation\" WHERE id='$REC'")" "COMPLETED"
chk "زمانِ بستن ثبت شد" \
  "$(Q "SELECT (\"completedAt\" IS NOT NULL) FROM \"BankReconciliation\" WHERE id='$REC'")" "t"
chk "بستنِ دوباره رد می‌شود" "$(PATCHC "/bank-reconciliation/$REC/complete")" "400"
# ⚠️ جلسهٔ بسته نباید تغییر کند.
chk "افزودنِ سطر به جلسهٔ بسته رد می‌شود" \
  "$(CODE "/bank-reconciliation/$REC/lines" '{"lines":[{"occurredAt":"2026-06-01","amount":1}]}')" "400"

# ---------------------------------------------------------------- نابرابر
sec "۷) جلسهٔ نابرابر بسته نمی‌شود"
REC2=$(POST /bank-reconciliation \
  '{"accountId":"rc-acc","statementDate":"2026-06-22","statementBalance":999999}' \
  | P 'import sys,json;print(json.load(sys.stdin).get("id",""))')
# ⚠️ مغایرت‌گیریِ نابرابر که بسته شود، از نکرده بدتر است: امضایی پای
#    چیزی می‌گذارد که تراز نیست.
chk "با اختلاف بسته نمی‌شود" "$(PATCHC "/bank-reconciliation/$REC2/complete")" "400"
chk "و باز مانده" "$(Q "SELECT status FROM \"BankReconciliation\" WHERE id='$REC2'")" "OPEN"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
