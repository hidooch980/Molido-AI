#!/usr/bin/env bash
#
# چاپ چک.
#
# ⚠️ دو سنجهٔ اصلی، و هر دو دربارهٔ کاغذِ هدررفته‌اند:
#
#    ۱) **مبلغ به حروف باید با رقم بخواند.**  روی چک، حروف رقم را قفل
#       می‌کند: ۱۰۰٬۰۰۰ را می‌شود با یک صفر به ۱٬۰۰۰٬۰۰۰ تبدیل کرد،
#       «صد هزار» را نمی‌شود.  اگر این دو نخوانند، بانک چک را برمی‌گرداند.
#
#    ۲) **مختصاتِ بیرونِ برگه باید رد شود.**  خطا نمی‌دهد؛ فقط چیزی چاپ
#       نمی‌شود و یک برگهٔ چکِ خام هدر می‌رود بی‌آنکه کسی بفهمد چرا.

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
  Q "DELETE FROM \"ChequePrintTemplate\" WHERE \"companyId\"='$CO';
     DELETE FROM \"Cheque\" WHERE id LIKE 'cp-%';" >/dev/null
}
trap cleanup EXIT
cleanup

POST() { curl -s "${A[@]}" -X POST "$API$1" -d "$2"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X POST "$API$1" -d "$2"; }
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }

# ---------------------------------------------------------------- فیکسچر
sec "۰) چک‌ها"
Q "INSERT INTO \"Cheque\" (id,\"companyId\",\"chequeNo\",\"bankName\",\"dueDate\",amount,type,status,\"ownerName\",note)
   VALUES ('cp-issued','$CO','123456','ملت','2026-05-21',87650000,'ISSUED','PENDING','شرکت الف','بابت فاکتور ۱۲'),
          ('cp-recv','$CO','999888','صادرات','2026-06-10',5000000,'RECEIVED','PENDING','آقای ب',NULL);" >/dev/null
chk "دو چک ساخته شد" "$(Q "SELECT count(*) FROM \"Cheque\" WHERE id LIKE 'cp-%'")" "2"

# ---------------------------------------------------------------- بدونِ الگو
sec "۱) بدونِ الگوی پیش‌فرض"
# ⚠️ پیامِ روشن بهتر از چاپِ خالی است.
chk "بدونِ الگو ۴۰۴ می‌دهد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API/cheque-print/cp-issued")" "404"

# ---------------------------------------------------------------- الگو
sec "۲) ساخت الگو"
R=$(POST /cheque-print/templates '{"name":"چک ملت","bankName":"ملت","isDefault":true}')
TPL=$(J "d.get('id','')")
chk "الگو ساخته شد"       "$([ -n "$TPL" ] && echo yes || echo no)" "yes"
chk "پیش‌فرض شد"          "$(J "d.get('isDefault')")" "True"
chk "ابعادِ پیش‌فرض ۱۷۵"   "$(J "int(float(d.get('widthMm',0)))")" "175"

chk "بدونِ نام رد می‌شود" "$(CODE /cheque-print/templates '{"bankName":"x"}')" "400"

# ⚠️ مختصاتِ بیرونِ برگه خطا نمی‌دهد، فقط چاپ نمی‌شود — و یک برگهٔ چک
#    هدر می‌رود.  پس اینجا رد می‌شود.
chk "مختصاتِ بیرونِ برگه رد می‌شود" \
  "$(CODE /cheque-print/templates '{"name":"بد","fields":{"date":{"x":900,"y":10}}}')" "400"
chk "مختصاتِ منفی رد می‌شود" \
  "$(CODE /cheque-print/templates '{"name":"بد۲","fields":{"date":{"x":-5,"y":10}}}')" "400"
chk "میدانِ ناشناخته رد می‌شود" \
  "$(CODE /cheque-print/templates '{"name":"بد۳","fields":{"رنگ":{"x":10,"y":10}}}')" "400"
chk "اندازهٔ قلمِ نامعتبر رد می‌شود" \
  "$(CODE /cheque-print/templates '{"name":"بد۴","fields":{"date":{"x":10,"y":10,"size":0}}}')" "400"

# ⚠️ دو پیش‌فرض یعنی چاپ گاهی روی یکی می‌رود و گاهی دیگری.
R=$(POST /cheque-print/templates '{"name":"چک صادرات","bankName":"صادرات","isDefault":true}')
TPL2=$(J "d.get('id','')")
chk "پیش‌فرضِ تازه ساخته شد" "$([ -n "$TPL2" ] && echo yes || echo no)" "yes"
chk "فقط یک پیش‌فرض هست" \
  "$(Q "SELECT count(*) FROM \"ChequePrintTemplate\" WHERE \"companyId\"='$CO' AND \"isDefault\"")" "1"
chk "و پیش‌فرضِ قبلی برداشته شد" \
  "$(Q "SELECT \"isDefault\" FROM \"ChequePrintTemplate\" WHERE id='$TPL'")" "f"

# ---------------------------------------------------------------- بارِ چاپ
sec "۳) بارِ چاپ"
R=$(curl -s "${A[@]}" "$API/cheque-print/cp-issued")
chk "شمارهٔ چک"        "$(J "d['cheque']['chequeNo']")" "123456"
chk "تاریخ شمسی"       "$(J "d['cheque']['dueDateJalali']")" "1405/02/31"
chk "مبلغ عددِ صحیح"    "$(J "d['cheque']['amount']")" "87650000"

# ⚠️ اصلِ ماجرا: حروف باید با رقم بخواند.
chk "رقمِ چاپی با جداکننده" \
  "$(J "[f['value'] for f in d['fields'] if f['field']=='amountDigits'][0]")" "87,650,000"
chk "مبلغ به حروف" \
  "$(J "[f['value'] for f in d['fields'] if f['field']=='amountWords'][0]")" \
  "هشتاد و هفت میلیون و ششصد و پنجاه هزار ریال"

chk "در وجه از نامِ چک می‌آید" \
  "$(J "[f['value'] for f in d['fields'] if f['field']=='payee'][0]")" "شرکت الف"
chk "پنج میدان جای‌گذاری شد" "$(J "len(d['fields'])")" "5"
chk "میدانِ جامانده‌ای نیست"  "$(J "len(d['missing'])")" "0"
chk "همهٔ مختصات داخلِ برگه" \
  "$(J "all(0 <= f['x'] <= d['template']['widthMm'] and 0 <= f['y'] <= d['template']['heightMm'] for f in d['fields'])")" "True"

# ---------------------------------------------------------------- دریافتی
sec "۴) چکِ دریافتی چاپ نمی‌شود"
# ⚠️ چکِ دریافتی را طرفِ مقابل نوشته؛ درخواستِ چاپش یعنی کاربر اشتباه
#    گرفته، و بهتر است همان‌جا بفهمد تا یک برگهٔ چکِ خام هدر برود.
chk "چکِ دریافتی رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API/cheque-print/cp-recv")" "400"
chk "چکِ ناموجود ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API/cheque-print/no-such")" "404"

# ---------------------------------------------------------------- میدانِ جامانده
sec "۵) میدانِ بی‌مختصات هشدار می‌گیرد"
curl -s "${A[@]}" -X PATCH "$API/cheque-print/templates/$TPL2" \
  -d '{"fields":{"date":{"x":132,"y":16},"amountDigits":{"x":120,"y":34}}}' >/dev/null
R=$(curl -s "${A[@]}" "$API/cheque-print/cp-issued")
chk "دو میدان جای‌گذاری شد" "$(J "len(d['fields'])")" "2"
# ⚠️ بی‌صدا نچاپیدن بدترین حالت است؛ رابط باید بتواند هشدار دهد.
chk "مبلغ به حروف در جاماندگان هست" \
  "$(J "'amountWords' in d['missing']")" "True"

# ---------------------------------------------------------------- الگوی صریح
sec "۶) الگوی صریح"
R=$(curl -s "${A[@]}" "$API/cheque-print/cp-issued?templateId=$TPL")
chk "الگوی خواسته‌شده به کار رفت" "$(J "d['template']['id']")" "$TPL"
chk "و پنج میدان دارد"            "$(J "len(d['fields'])")" "5"
chk "الگوی ناموجود ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API/cheque-print/cp-issued?templateId=nope")" "404"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
