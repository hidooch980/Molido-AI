#!/usr/bin/env bash
#
# صورت‌حسابِ اشتراک، و اعمالِ انقضا.
#
# ⚠️ دو چیزِ متفاوت که هر دو تا امروز نبودند:
#
#    ۱) **انقضا هیچ اثری نداشت.**  `endsOn` می‌گذشت، پنلِ فروشنده
#       «غیرفعال» نشان می‌داد، و مشتری بی‌هیچ تفاوتی کار می‌کرد.
#       یعنی تمدید عملاً داوطلبانه بود.
#
#    ۲) **تمدید از داخلِ نرم‌افزار ممکن نبود.**  هر تمدید یک ssh
#       می‌خواست، پس در شبِ انقضا کسی نبود که انجامش دهد.

set -u
cd "$(dirname "$0")/.."

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

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
[ -n "$TOKEN" ] || { echo "  x ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN")
J=(-H 'Content-Type: application/json')

CO=seed-company

# ⚠️ اشتراکِ اصلی ذخیره و در پایان برگردانده می‌شود.
#
#    این مجموعه اشتراک را **منقضی** می‌کند تا اعمالِ انقضا را بسنجد.
#    اگر برنگردد، هر مجموعهٔ بعدی روی نوشتن ۴۰۲ می‌گیرد — یعنی صدها
#    شکستِ بی‌ربط.  همان تله‌ای که یک بار در `edition.sh` افتاد.
ORIG=$(Q "SELECT plan||'|'||status||'|'||COALESCE(\"endsOn\"::text,'')||'|'||\"startsOn\"::text FROM \"Subscription\" WHERE \"companyId\"='$CO'")
restore() {
  [ -n "$ORIG" ] || return 0
  local p="${ORIG%%|*}" rest="${ORIG#*|}"
  local st="${rest%%|*}" rest2="${rest#*|}"
  local en="${rest2%%|*}" so="${rest2##*|}"

  # ⚠️ هر دو تاریخ در **یک** دستور نوشته می‌شوند.
  #
  #    قیدِ `endsOn >= startsOn` در پایانِ هر دستور سنجیده می‌شود؛ اگر
  #    `startsOn` جدا نوشته شود، در آن لحظه با `endsOn`ِ دستکاری‌شدهٔ
  #    آزمون سنجیده می‌شود و ممکن است رد شود — یعنی بازگردانی بی‌صدا
  #    شکست بخورد، که دقیقاً همان چیزی است که این تابع برای جلوگیری
  #    از آن نوشته شده.
  local endexpr="NULL"
  [ -n "$en" ] && endexpr="'$en'"

  Q "UPDATE \"Subscription\"
        SET plan='$p', status='$st', \"startsOn\"='$so', \"endsOn\"=$endexpr,
            \"updatedAt\"=now()
      WHERE \"companyId\"='$CO'" >/dev/null

  Q "DELETE FROM \"SubscriptionInvoice\" WHERE \"companyId\"='$CO'" >/dev/null
}
trap 'restore; stop_fake' EXIT

CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API$1"; }
POSTCODE() {
  curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X POST \
    "$API$1" -d "${2:-{\}}"
}

# ─────────────────── درگاهِ ساختگی ───────────────────
#
# ⚠️ بدونِ درگاه، مسیرِ **تمدیدِ واقعی** آزموده نمی‌شود و فقط ورودی‌ها
#    سنجیده می‌شوند.  همان تله‌ای که در `shop-payment.sh` نوشته شده:
#    نگهبانِ گران‌بهایی که هرگز اجرا نمی‌شود.
ZBASE="${ZARINPAL_BASE_URL:-$(grep -E '^ZARINPAL_BASE_URL=' ../.env 2>/dev/null | cut -d= -f2- | tr -d '"')}"
FAKE=$(printf '%s' "$ZBASE" | grep -oE '[0-9]+$')
CTL="http://localhost:${FAKE:-0}/__control"
ctl() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 -X POST "$CTL" -H 'Content-Type: application/json' -d "$1"; }

stop_fake() { [ -n "${FAKE_PID:-}" ] && kill "$FAKE_PID" 2>/dev/null; }
if [ -n "$FAKE" ] && [ "$(ctl '{"underpay":false}')" != "200" ]; then
  python3 test/lib/fake-zarinpal.py "$FAKE" >/dev/null 2>&1 &
  FAKE_PID=$!
  for _ in 1 2 3 4 5; do
    sleep 1
    [ "$(ctl '{"underpay":false}')" = "200" ] && break
  done
fi

# ---------------------------------------------------------------- قیمت‌ها
sec "۱) فهرستِ قیمت"
PLANS=$(curl -s "${A[@]}" "$API/billing/plans")
chk "نسخهٔ پایه قیمت دارد" \
  "$(echo "$PLANS" | P "import sys,json;d=json.load(sys.stdin);print(any(x['plan']=='BASIC' and x['monthlyRial']>0 for x in d))")" "True"
# ⚠️ «بی‌قیمت» یعنی «تماس بگیرید»، نه «رایگان».  اگر ADVANCED این‌جا
#    بیاید، کسی آن را می‌خرد و ما به قیمتی که نگفته‌ایم متعهد می‌شویم.
chk "پیشرفته آنلاین فروخته نمی‌شود" \
  "$(echo "$PLANS" | P "import sys,json;d=json.load(sys.stdin);print(any(x['plan']=='ADVANCED' for x in d))")" "False"
chk "دورهٔ ۱۲ ماهه = ۱۲ برابرِ ماهانه" \
  "$(echo "$PLANS" | P "import sys,json;d=json.load(sys.stdin);b=[x for x in d if x['plan']=='BASIC'][0];t=[y for y in b['terms'] if y['months']==12][0];print(t['amountRial']==b['monthlyRial']*12)")" "True"

# ---------------------------------------------------------------- مبلغ از سرور
sec "۲) مبلغ از سرور می‌آید، نه از درخواست"
# ⚠️ اگر مبلغ از بدنهٔ درخواست خوانده می‌شد، اشتراکِ سالانه یک ریال
#    فروخته می‌شد.  درگاه در آزمون پیکربندی نشده، پس ۴۰۰ می‌گیریم —
#    ولی صورت‌حساب باید با مبلغِ **درست** ساخته شده باشد.
Q "DELETE FROM \"SubscriptionInvoice\" WHERE \"companyId\"='$CO'" >/dev/null
POSTCODE /billing/start '{"plan":"BASIC","months":12,"amountRial":1}' >/dev/null
EXPECT=$(Q "SELECT (\"priceRial\"*12)::text FROM \"PlanDefault\" WHERE plan='BASIC'")
GOT=$(Q "SELECT \"amountRial\"::text FROM \"SubscriptionInvoice\" WHERE \"companyId\"='$CO' ORDER BY \"createdAt\" DESC LIMIT 1")
chk "مبلغِ صورت‌حساب از جدولِ قیمت است" "$GOT" "$EXPECT"

sec "۳) ورودیِ نامعتبر رد می‌شود"
chk "مدتِ ۹۹ ماهه رد شد"  "$(POSTCODE /billing/start '{"plan":"BASIC","months":99}')" "400"
chk "نسخهٔ ناشناس رد شد"  "$(POSTCODE /billing/start '{"plan":"HACK","months":12}')" "400"
# ⚠️ ADVANCED قیمت ندارد؛ باید «تماس بگیرید» بدهد نه صورت‌حسابِ صفر.
chk "پیشرفته آنلاین رد شد" "$(POSTCODE /billing/start '{"plan":"ADVANCED","months":12}')" "400"

# ---------------------------------------------------------------- انقضا
sec "۴) اشتراکِ منقضی ⇒ فقط‌خواندنی"
# ⚠️ `startsOn` هم عقب کشیده می‌شود.
#
#    قیدِ `Subscription_dates_check` می‌گوید `endsOn >= startsOn`.  روی
#    نصبی که اشتراکش **امروز** ساخته شده، `endsOn=CURRENT_DATE-1` قید را
#    نقض می‌کند، `UPDATE` بی‌صدا رد می‌شود (چون `Q` خطا را فقط به رشته
#    می‌دهد)، اشتراک فعال می‌ماند، و سنجهٔ بعدی شکست می‌خورد با پیامی
#    که هیچ ربطی به علت ندارد.
Q "UPDATE \"Subscription\" SET status='ACTIVE', \"startsOn\"=CURRENT_DATE-30,
     \"endsOn\"=CURRENT_DATE-1, \"updatedAt\"=now() WHERE \"companyId\"='$CO'" >/dev/null
# حافظهٔ وضعیت ۳۰ ثانیه است و این‌جا مستقیم در پایگاه نوشتیم.
sleep 31

chk "خواندن باز است"       "$(CODE /products)" "200"
chk "خواندنِ فروش باز است"  "$(CODE /sales)"    "200"
# ⚠️ اصلِ ماجرا: نوشتن باید بسته باشد، وگرنه انقضا معنایی ندارد.
chk "ساختِ کالا بسته شد"   "$(POSTCODE /customers '{"firstName":"آزمون","lastName":"انقضا"}')" "402"

sec "۵) راهِ برگشت باز می‌ماند"
# ⚠️ اگر این‌ها هم بسته شوند، مشتریِ منقضی نمی‌تواند تمدید کند و
#    انقضا یک‌طرفه است.  دقیقاً همان تله‌ای که تماسِ اضطراری می‌سازد.
chk "قیمت‌ها خوانده می‌شوند" "$(CODE /billing/plans)" "200"
chk "اشتراکِ خودم دیده می‌شود" "$(CODE /subscription/mine)" "200"
# ⚠️ سنجه «۴۰۲ **نیست**» است، نه یک کدِ مشخص.
#
#    درگاه در محیطِ آزمون نمونهٔ محلی دارد و ۲۰۱ می‌دهد؛ در محیطی که
#    کلید ندارد ۴۰۰.  هر دو یعنی «به سرویس رسید».  بستنِ سنجه به یکی
#    از آن‌ها یعنی روزی که پیکربندی عوض شود، آزمون قرمز می‌شود بی‌آنکه
#    چیزی خراب شده باشد.
BUY=$(POSTCODE /billing/start '{"plan":"BASIC","months":1}')
chk "خریدِ تمدید بسته نشد"  "$([ "$BUY" = "402" ] && echo blocked || echo open)" "open"

sec "۶) تعلیق هم همان‌طور بسته می‌شود"
Q "UPDATE \"Subscription\" SET status='SUSPENDED', \"endsOn\"=CURRENT_DATE+365,
     \"updatedAt\"=now() WHERE \"companyId\"='$CO'" >/dev/null
sleep 31
chk "تعلیق ⇒ نوشتن بسته"   "$(POSTCODE /customers '{"firstName":"آزمون","lastName":"تعلیق"}')" "402"
chk "تعلیق ⇒ خواندن باز"   "$(CODE /products)" "200"

# ---------------------------------------------------------------- تمدید
sec "۷) خریدِ واقعی: پرداخت ← تمدید"
# ⚠️ مسیر از سرِتاسر می‌رود: `/billing/start` ← درگاهِ ساختگی ←
#    `/billing/verify`.  سنجهٔ SQLی که فقط حسابِ تاریخ را می‌سنجید،
#    هیچ خطی از کدِ تمدید را اجرا نمی‌کرد و همیشه سبز بود.
Q "UPDATE \"Subscription\" SET status='ACTIVE', plan='BASIC',
     \"endsOn\"=CURRENT_DATE+30, \"updatedAt\"=now() WHERE \"companyId\"='$CO'" >/dev/null
sleep 31

if [ -z "$FAKE" ] || [ "$(ctl '{"underpay":false}')" != "200" ]; then
  printf '  SKIP درگاهِ ساختگی بالا نیامد؛ مسیرِ تمدید آزموده نشد
'
else
  BEFORE=$(Q "SELECT (\"endsOn\" - CURRENT_DATE)::text FROM \"Subscription\" WHERE \"companyId\"='$CO'")

  S=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/billing/start" -d '{"plan":"PRO","months":3}')
  INV=$(echo "$S" | P "import sys,json;print(json.load(sys.stdin).get('invoiceId',''))")
  chk "صورت‌حساب ساخته شد" "$([ -n "$INV" ] && echo yes || echo no)" "yes"

  V=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/billing/verify/$INV")
  chk "پرداخت تأیید شد" "$(echo "$V" | P "import sys,json;print(json.load(sys.stdin).get('ok'))")" "True"
  chk "نسخه ارتقا یافت" "$(Q "SELECT plan FROM \"Subscription\" WHERE \"companyId\"='$CO'")" "PRO"

  AFTER=$(Q "SELECT (\"endsOn\" - CURRENT_DATE)::text FROM \"Subscription\" WHERE \"companyId\"='$CO'")
  # ⚠️ ۳۰ روزِ باقی‌مانده + ۳ ماه ⇒ حدودِ ۱۲۰ روز.  اگر از **امروز**
  #    حساب می‌شد ۹۰ روز می‌شد و مشتری آن ۳۰ روز را می‌سوزاند.
  chk "تمدید پیوسته است، نه از امروز"     "$(python -c "print(int($AFTER) > int($BEFORE) + 80)")" "True"

  sec "۷ب) کم‌پرداختی رد می‌شود"
  # ⚠️ گران‌بهاترین سنجهٔ این پرونده: بدونش، اشتراکِ سالانه با هزار
  #    ریال تأیید می‌شد — کدِ پیگیری معتبر است و ما فرض می‌کنیم درست
  #    پرداخت شده.
  ctl '{"underpay":true}' >/dev/null
  S2=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/billing/start" -d '{"plan":"PRO","months":12}')
  INV2=$(echo "$S2" | P "import sys,json;print(json.load(sys.stdin).get('invoiceId',''))")
  V2=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/billing/verify/$INV2")
  chk "پرداختِ ناقص تأیید نشد"     "$(echo "$V2" | P "import sys,json;print(json.load(sys.stdin).get('ok'))")" "False"
  chk "و صورت‌حساب PAID نشد"     "$(Q "SELECT status FROM \"SubscriptionInvoice\" WHERE id='$INV2'")" "FAILED"
  ctl '{"underpay":false}' >/dev/null
fi

INV=$(Q "SELECT gen_random_uuid()::text")
Q "INSERT INTO \"SubscriptionInvoice\"
     (id,\"companyId\",plan,months,\"amountRial\",status,gateway,reference,note)
   VALUES ('$INV','$CO','BASIC',1,1000,'PAID','test','ref-$INV','billing.sh')" >/dev/null

sec "۸) تأییدِ دوباره ممکن نیست"
# ⚠️ رفرشِ صفحهٔ بازگشت از درگاه یک درخواستِ تازه است.  بدونِ نگهبان،
#    هر رفرش یک دورهٔ اشتراکِ رایگان می‌داد.
DUP=$(Q "INSERT INTO \"SubscriptionInvoice\"
           (id,\"companyId\",plan,months,\"amountRial\",status,gateway,reference,note)
         VALUES (gen_random_uuid()::text,'$CO','BASIC',1,1000,'PENDING','test','ref-$INV','billing.sh')" 2>&1)
chk "شناسهٔ درگاهِ تکراری رد شد" \
  "$(echo "$DUP" | grep -qi "duplicate\|unique" && echo yes || echo no)" "yes"

R=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/billing/verify/$INV")
chk "صورت‌حسابِ پرداخت‌شده دوباره تمدید نمی‌کند" \
  "$(echo "$R" | P "import sys,json;print(json.load(sys.stdin).get('alreadyVerified'))")" "True"

sec "۹) صورت‌حسابِ شرکتِ دیگر دیده نمی‌شود"
# ⚠️ بدونِ شرطِ companyId، شرکتِ الف می‌توانست تمدیدِ شرکتِ ب را برای
#    خودش تأیید کند.
OTHER=$(Q "SELECT id FROM \"Company\" WHERE id <> '$CO' LIMIT 1")
if [ -n "$OTHER" ]; then
  FOREIGN=$(Q "INSERT INTO \"SubscriptionInvoice\"
      (id,\"companyId\",plan,months,\"amountRial\",status,gateway,reference,note)
    VALUES (gen_random_uuid()::text,'$OTHER','BASIC',1,1000,'PENDING','test',
            'ref-foreign-'||gen_random_uuid()::text,'billing.sh')
    RETURNING id")
  chk "صورت‌حسابِ شرکتِ دیگر ۴۰۴" \
    "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X POST "$API/billing/verify/$FOREIGN")" "404"
else
  printf '  SKIP شرکتِ دومی برای سنجش نیست\n'
fi

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
