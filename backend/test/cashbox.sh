#!/usr/bin/env bash
#
# صندوق — پول جابه‌جا می‌شود، پس باید ردی بماند.
#
# ⚠️ این مسیر تا امروز **هیچ پوششی نداشت**، و بی‌پوشش بودنش پنهان
#    کرده بود که کاری هم نمی‌کند.
#
#    `PATCH /cashbox/:id/deposit` فقط `balance` را عوض می‌کرد: نه سند
#    دفترکل، نه سطرِ تراکنش.  اندازه‌گیری شد: واریزِ ۱٬۰۰۰٬۰۰۰ موجودی
#    را بالا برد و حسابِ ۱۱۰۱ صفر تکان خورد.
#
# ⚠️ و چرا هیچ آزمونی نمی‌گرفتش: **تراز آزمایشی صفر می‌ماند**.
#
#    وقتی اصلاً سندی زده نمی‌شود، چیزی هم نامتراز نمی‌شود.  همان
#    خانواده از اشکال که «خریدِ دارایی» داشت — دفتر سالم به نظر
#    می‌رسید چون نیمی از یک جفت اصلاً وجود نداشت.

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

cleanup() {
  Q "DELETE FROM \"CashBox\" WHERE code LIKE 'CBTEST%';" >/dev/null
}
trap cleanup EXIT
cleanup

# ماندهٔ حسابِ ۱۱۰۱ در همین لحظه — همه‌چیز نسبت به این سنجیده می‌شود.
cash() {
  Q "SELECT COALESCE(round(sum(l.debit - l.credit)), 0)
       FROM \"JournalLine\" l
       JOIN \"Account\" a ON a.id = l.\"accountId\"
       JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
      WHERE a.code = '$1' AND e.status <> 'REVERSED';"
}

BOX=$(curl -s -X POST "$A/cashbox" -H "$AU" -H "$JS" \
  -d '{"name":"CBTEST","code":"CBTEST-1"}' | P "d.get('id','')")
if [ -z "$BOX" ]; then
  echo "  ✗ ساختِ صندوق ناموفق"
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi

echo '--- ۱) واریز، هم موجودی هم دفتر را تکان می‌دهد ---'
#
# ⚠️ **سنجهٔ اصلیِ فایل.**
#
#    پیش از این، سمتِ راستِ این جدول همیشه صفر بود: پول در صندوق
#    زیاد می‌شد و دفترکل خبر نداشت.
C0=$(cash 1101)
K0=$(cash 3101)
curl -s -o /dev/null -X PATCH "$A/cashbox/$BOX/deposit" -H "$AU" -H "$JS" \
  -d '{"amount":1000000,"reason":"OWNER","note":"سرمایهٔ اولیه"}'
C1=$(cash 1101)
K1=$(cash 3101)

chk "موجودیِ صندوق بالا رفت" "$(Q "SELECT round(balance) FROM \"CashBox\" WHERE id='$BOX';")" "1000000"
chk "حسابِ صندوق (۱۱۰۱) بدهکار شد" "$((C1 - C0))" "1000000"
# سرمایه حسابِ بستانکار است، پس بدهکار منهای بستانکار **منفی** می‌شود.
chk "حسابِ سرمایه (۳۱۰۱) بستانکار شد" "$((K1 - K0))" "-1000000"

echo '--- ۲) ردِ حسابرسی ---'
# ⚠️ بدونِ این، نمی‌شود پرسید «چه کسی، کِی، بابتِ چه».
R=$(curl -s "$A/cashbox/$BOX/transactions" -H "$AU")
chk "یک تراکنش ثبت شد" "$(printf '%s' "$R" | P "len(d)")" "1"
chk "بابت ذخیره شد" "$(printf '%s' "$R" | P "d[0].get('reason','')")" "OWNER"
chk "کاربر ثبت شد" "$(printf '%s' "$R" | P "'yes' if d[0].get('userId') else 'no'")" "yes"
chk "به سند گره خورد" "$(printf '%s' "$R" | P "'yes' if d[0].get('entryId') else 'no'")" "yes"
chk "ماندهٔ پس از تراکنش درست است" \
  "$(printf '%s' "$R" | P "int(float(d[0]['balanceAfter']))")" "1000000"

echo '--- ۳) برداشت با بابتِ بانک ---'
# انتقال به بانک: صندوق بستانکار، بانک بدهکار — جابه‌جاییِ دارایی،
# نه هزینه.
B0=$(cash 1102)
curl -s -o /dev/null -X PATCH "$A/cashbox/$BOX/withdraw" -H "$AU" -H "$JS" \
  -d '{"amount":400000,"reason":"BANK"}'
B1=$(cash 1102)
C2=$(cash 1101)

chk "موجودیِ صندوق کم شد" "$(Q "SELECT round(balance) FROM \"CashBox\" WHERE id='$BOX';")" "600000"
chk "حسابِ صندوق بستانکار شد" "$((C2 - C1))" "-400000"
chk "حسابِ بانک بدهکار شد" "$((B1 - B0))" "400000"

echo '--- ۴) بابتِ نامعتبر ---'
# ⚠️ بابتی که طرفِ دومِ سند ندارد نباید بی‌صدا به «سایر» بیفتد.
chk "بابتِ ناشناخته رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/cashbox/$BOX/deposit" \
     -H "$AU" -H "$JS" -d '{"amount":1000,"reason":"WHATEVER"}')" "400"
chk "و موجودی دست‌نخورده ماند" \
  "$(Q "SELECT round(balance) FROM \"CashBox\" WHERE id='$BOX';")" "600000"

echo '--- ۵) مبلغِ نامعتبر ---'
chk "مبلغِ صفر رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/cashbox/$BOX/deposit" \
     -H "$AU" -H "$JS" -d '{"amount":0,"reason":"OWNER"}')" "400"
chk "مبلغِ منفی رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/cashbox/$BOX/deposit" \
     -H "$AU" -H "$JS" -d '{"amount":-5000,"reason":"OWNER"}')" "400"

echo '--- ۶) برداشتِ بیش از موجودی ---'
# ⚠️ شرطِ موجودی داخلِ خودِ UPDATE است تا دو برداشتِ هم‌زمان نتوانند
#    هر دو «موجودی کافی» ببینند.
chk "برداشتِ بیش از موجودی رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/cashbox/$BOX/withdraw" \
     -H "$AU" -H "$JS" -d '{"amount":99999999,"reason":"OWNER"}')" "400"
chk "موجودی دست‌نخورده ماند" \
  "$(Q "SELECT round(balance) FROM \"CashBox\" WHERE id='$BOX';")" "600000"

echo '--- ۷) هیچ حرکتی بدونِ سند نمی‌ماند ---'
#
# ⚠️ سنجهٔ پایانی: هر سطرِ ردِ حسابرسی باید سندی داشته باشد.  اگر
#    روزی کسی مسیرِ تازه‌ای اضافه کند که موجودی را عوض می‌کند ولی سند
#    نمی‌زند، اینجا دیده می‌شود.
chk "هر تراکنش سند دارد" \
  "$(Q "SELECT count(*) FROM \"CashBoxTransaction\" WHERE \"entryId\" IS NULL;")" "0"

chk "بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$A/cashbox/$BOX/deposit" \
     -H "$JS" -d '{"amount":1000,"reason":"OWNER"}')" "401"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
