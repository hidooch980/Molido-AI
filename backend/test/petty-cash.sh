#!/usr/bin/env bash
#
# تنخواه گردان.
#
# ⚠️ دو سنجهٔ اصلی، و هر دو دربارهٔ چیزی‌اند که خودش را نشان نمی‌دهد:
#
#    ۱) هر گردش باید **سند** بخورد.  این هفته شش نشتِ خاموش بسته شد که
#       همه‌شان یک ریشه داشتند: پول جابه‌جا شد و سندی نوشته نشد.  ترازِ
#       کل صفر ماند و کسی نفهمید.
#
#    ۲) تنخواه نباید **منفی** شود.  خرجِ بیش از مانده یعنی پولی خرج شده
#       که وجود نداشته — و اگر رد نشود، فقط در شمارشِ فیزیکی پیدا می‌شود.

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
  Q "DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
       (SELECT id FROM \"JournalEntry\" WHERE \"sourceType\" LIKE 'PettyCash%');
     DELETE FROM \"JournalEntry\" WHERE \"sourceType\" LIKE 'PettyCash%';
     DELETE FROM \"PettyCashTransaction\" WHERE \"companyId\"='$CO';
     DELETE FROM \"PettyCash\" WHERE \"companyId\"='$CO';" >/dev/null
}
trap cleanup EXIT
cleanup

POST() { curl -s "${A[@]}" -X POST "$API$1" -d "$2"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X POST "$API$1" -d "$2"; }

# ---------------------------------------------------------------- ساخت
sec "۱) ساخت صندوق"
FUND=$(POST /petty-cash '{"name":"تنخواه فروشگاه","ceiling":5000000}' \
  | P 'import sys,json;print(json.load(sys.stdin).get("id",""))')
chk "صندوق ساخته شد" "$([ -n "$FUND" ] && echo yes || echo no)" "yes"
chk "بدونِ نام رد می‌شود" "$(CODE /petty-cash '{"ceiling":100}')" "400"
chk "سقفِ صفر رد می‌شود"  "$(CODE /petty-cash '{"name":"x","ceiling":0}')" "400"

# ---------------------------------------------------------------- شارژ
sec "۲) شارژ"
R=$(POST "/petty-cash/$FUND/charge" '{"amount":3000000,"description":"شارژ اول"}')
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }
chk "شارژ ثبت شد"        "$(J "d.get('type')")"              "CHARGE"
chk "ماندهٔ پس از شارژ"   "$(J "int(d.get('balanceAfter',0))")" "3000000"
chk "سند خورد"           "$(J "bool(d.get('entryNo'))")"      "True"

# ⚠️ سند باید **واقعاً** در دفتر باشد، نه فقط شماره‌اش برگشته باشد.
chk "سند در دفتر هست" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='PettyCashCHARGE'")" "1"
chk "تنخواه (۱۱۰۷) بدهکار شد" \
  "$(Q "SELECT COALESCE(sum(l.debit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
          JOIN \"Account\" a ON a.id=l.\"accountId\"
         WHERE e.\"sourceType\"='PettyCashCHARGE' AND a.code='1107'")" "3000000"
chk "صندوق (۱۱۰۱) بستانکار شد" \
  "$(Q "SELECT COALESCE(sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
          JOIN \"Account\" a ON a.id=l.\"accountId\"
         WHERE e.\"sourceType\"='PettyCashCHARGE' AND a.code='1101'")" "3000000"

# ---------------------------------------------------------------- سقف
sec "۳) سقف"
chk "شارژِ بیش از سقف رد می‌شود" \
  "$(CODE "/petty-cash/$FUND/charge" '{"amount":3000000,"description":"از سقف رد می‌شود"}')" "400"
chk "و چیزی ثبت نشد" \
  "$(Q "SELECT count(*) FROM \"PettyCashTransaction\" WHERE type='CHARGE'")" "1"

# ---------------------------------------------------------------- خرج
sec "۴) خرج"
R=$(POST "/petty-cash/$FUND/spend" '{"amount":1200000,"description":"کرایه حمل"}')
chk "خرج ثبت شد"       "$(J "d.get('type')")"               "SPEND"
chk "مانده کم شد"      "$(J "int(d.get('balanceAfter',0))")" "1800000"
chk "هزینه (۵۲۹۹) بدهکار شد" \
  "$(Q "SELECT COALESCE(sum(l.debit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
          JOIN \"Account\" a ON a.id=l.\"accountId\"
         WHERE e.\"sourceType\"='PettyCashSPEND' AND a.code='5299'")" "1200000"

# ---------------------------------------------------------------- منفی
sec "۵) تنخواه منفی نمی‌شود"
chk "خرجِ بیش از مانده رد می‌شود" \
  "$(CODE "/petty-cash/$FUND/spend" '{"amount":9000000,"description":"بیش از مانده"}')" "400"
chk "و مانده دست‌نخورده ماند" \
  "$(curl -s "${A[@]}" "$API/petty-cash" | P "import sys,json;print(int([f for f in json.load(sys.stdin) if f['id']=='$FUND'][0]['balance']))")" "1800000"

# ⚠️ سندِ ناموفق هم نباید جا مانده باشد.  اگر تراکنش درست بسته نشود،
#    سند می‌ماند و گردش نه — و دفتر با تنخواه مغایرت پیدا می‌کند.
chk "سندِ خرجِ ردشده جا نمانده" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='PettyCashSPEND'")" "1"

# ---------------------------------------------------------------- ورودی بد
sec "۶) ورودیِ نامعتبر"
chk "مبلغِ منفی رد می‌شود" \
  "$(CODE "/petty-cash/$FUND/spend" '{"amount":-500,"description":"منفی"}')" "400"
chk "بدونِ شرح رد می‌شود" \
  "$(CODE "/petty-cash/$FUND/spend" '{"amount":1000}')" "400"
chk "صندوقِ ناموجود ۴۰۴" \
  "$(CODE "/petty-cash/no-such-fund/spend" '{"amount":1000,"description":"x"}')" "404"

# ---------------------------------------------------------------- برگشت
sec "۷) برگشتِ مانده"
R=$(POST "/petty-cash/$FUND/settle" '{"amount":800000,"description":"تسویه"}')
chk "برگشت ثبت شد"  "$(J "d.get('type')")"               "RETURN"
chk "مانده کم شد"   "$(J "int(d.get('balanceAfter',0))")" "1000000"

# ---------------------------------------------------------------- صورت وضعیت
sec "۸) صورت وضعیت"
R=$(curl -s "${A[@]}" "$API/petty-cash/$FUND/statement")
chk "سه گردش"            "$(J "len(d['lines'])")"                    "3"
chk "ماندهٔ پایانی"       "$(J "int(d['totals']['closingBalance'])")" "1000000"
chk "جمع شارژ"           "$(J "int(d['totals']['charged'])")"        "3000000"
chk "جمع خرج"            "$(J "int(d['totals']['spent'])")"          "1200000"
chk "جمع برگشت"          "$(J "int(d['totals']['returned'])")"       "800000"
chk "تاریخ شمسی دارد"    "$(J "len(d['lines'][0]['occurredAtJalali'])")" "10"
chk "ماندهٔ جاریِ آخر با جمع یکی است" \
  "$(J "int(d['lines'][-1]['balance']) == int(d['totals']['closingBalance'])")" "True"

# ---------------------------------------------------------------- تراز کل
sec "۹) دفتر کل تراز است"
chk "همهٔ اسنادِ تنخواه تراز" \
  "$(Q "SELECT COALESCE(sum(l.debit)-sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE e.\"sourceType\" LIKE 'PettyCash%'")" "0"

# ⚠️ و ماندهٔ تنخواه در **دفتر** باید با ماندهٔ گردش یکی باشد.
#    این تنها سنجه‌ای است که «سند خورد ولی اشتباه» را می‌گیرد.
chk "ماندهٔ حساب ۱۱۰۷ با ماندهٔ تنخواه یکی است" \
  "$(Q "SELECT COALESCE(sum(l.debit)-sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
          JOIN \"Account\" a ON a.id=l.\"accountId\"
         WHERE e.\"sourceType\" LIKE 'PettyCash%' AND a.code='1107'")" "1000000"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
