#!/usr/bin/env bash
#
# گزارش‌ساز.
#
# ⚠️ سنجهٔ اصلی امنیت است، نه کارکرد.
#
#    گزارش‌ساز یعنی کاربر پرس‌وجو می‌سازد.  اگر نامِ میدان یا عملگر از
#    ورودی به SQL برود، هر کاربرِ سامانه می‌تواند دادهٔ شرکت‌های دیگر،
#    درهم‌سازیِ رمزها و کلیدهای API را بخواند — یا جدول‌ها را پاک کند.
#
#    بخشِ ۵ همین را می‌سنجد: ورودی‌هایی که اگر رشته‌شان به SQL برسد،
#    کارِ خودشان را می‌کنند.

set -u
cd "$(dirname "$0")/.."

# WARN پایتونِ ویندوز آرگومان‌ها و خروجی را با کدپیجِ سیستم می‌خواند، نه
#      UTF-8.  بدونِ این دو، نویسه‌های فارسیِ داخلِ `python -c` به «?»
#      تبدیل می‌شوند و سنجه‌های نامِ فارسی بی‌دلیل قرمز می‌شوند.
#
#      آزمون خودش تنظیمشان می‌کند تا به محیطِ فراخوان تکیه نکند —
#      وگرنه دستی سبز است و در `run-tests.sh` قرمز.
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
[ -n "$TOKEN" ] || { echo "  ✗ ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

CO=seed-company
cleanup() { Q "DELETE FROM \"ReportDefinition\" WHERE \"companyId\"='$CO'" >/dev/null; }
trap cleanup EXIT
cleanup

# WARN بدنهٔ فارسی از **فایل** فرستاده می‌شود، نه از آرگومانِ `-d`.
#
#      سنجیده شد: پوستهٔ ویندوز نویسه‌های فارسیِ داخلِ آرگومان را به
#      «?» تبدیل می‌کند.  از فایل، همان بایت‌های UTF-8 می‌روند
#      (da 86 da a9 = «چک») و سرور درست می‌خواند.
#
#      این اشکالِ آزمون بود نه کد — و اگر تشخیص داده نمی‌شد، دنبالِ
#      اشکالِ کدگذاری در سرویس می‌گشتم که وجود نداشت.
BODY=$(mktemp)
POSTF() { printf '%s' "$2" > "$BODY"; curl -s "${A[@]}" -X POST "$API$1" --data-binary @"$BODY"; }
CODEF() { printf '%s' "$2" > "$BODY"; curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X POST "$API$1" --data-binary @"$BODY"; }
RUN()  { POSTF /report-builder/run "$1"; }
CODE() { CODEF /report-builder/run "$1"; }
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }

# ---------------------------------------------------------------- فهرست
sec "۱) مجموعه‌دادها"
R=$(curl -s "${A[@]}" "$API/report-builder/datasets")
chk "چهار مجموعه‌داده"     "$(J "len(d)")" "4"
chk "فروش هست"             "$(J "'sales' in [x['key'] for x in d]")" "True"
chk "میدان‌ها برچسب دارند" "$(J "all(f.get('label') for x in d for f in x['fields'])")" "True"
# ⚠️ رابط باید بداند روی چه چیزی می‌شود گروه‌بندی یا تجمیع کرد.
chk "مبلغ کل تجمیع‌پذیر است" \
  "$(J "[f['aggregatable'] for x in d if x['key']=='sales' for f in x['fields'] if f['key']=='total'][0]")" "True"
chk "سقفِ سطر اعلام شده" "$(J "[x['maxRows'] for x in d][0]")" "5000"

# ---------------------------------------------------------------- ساده
sec "۲) گزارشِ ساده"
R=$(RUN '{"dataset":"sales","spec":{"columns":["invoiceNo","status","total"],"limit":5}}')
chk "اجرا شد"          "$(J "d.get('dataset')")" "sales"
chk "حداکثر ۵ سطر"     "$(J "d['rowCount'] <= 5")" "True"
chk "ستون‌ها همان‌اند" \
  "$(J "sorted(d['rows'][0].keys()) if d['rows'] else ['invoiceNo','status','total']")" \
  "['invoiceNo', 'status', 'total']"

# ---------------------------------------------------------------- تجمیع
sec "۳) گروه‌بندی و تجمیع"
R=$(RUN '{"dataset":"sales","spec":{"groupBy":["status"],
     "aggregates":[{"field":"total","fn":"sum","as":"جمع"},{"field":"invoiceNo","fn":"count","as":"تعداد"}],
     "orderBy":{"field":"جمع","dir":"desc"}}}')
chk "گروه‌بندی اجرا شد" "$(J "d['rowCount'] > 0")" "True"
chk "نامِ مستعارِ فارسی کار می‌کند" "$(J "'جمع' in d['rows'][0]")" "True"

# ⚠️ ستونی که نه در گروه‌بندی است نه تجمیع‌شده، خطای مبهمِ پستگرس
#    می‌گیرد.  پیامِ ما باید بگوید کدام ستون و چه بکند.
chk "ستونِ ناسازگار با گروه‌بندی رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["invoiceNo"],"groupBy":["status"],"aggregates":[{"field":"total","fn":"sum"}]}}')" "400"
chk "گروه‌بندی روی میدانِ غیرقابل‌گروه رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"groupBy":["total"],"aggregates":[{"field":"total","fn":"sum"}]}}')" "400"
chk "تجمیع روی میدانِ متنی رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"aggregates":[{"field":"status","fn":"sum"}]}}')" "400"
chk "count روی متن مجاز است" \
  "$(CODE '{"dataset":"sales","spec":{"aggregates":[{"field":"status","fn":"count"}]}}')" "201"

# ---------------------------------------------------------------- صافی
sec "۴) صافی"
R=$(RUN '{"dataset":"sales","spec":{"columns":["invoiceNo","status"],
     "filters":[{"field":"status","op":"eq","value":"PAID"}],"limit":50}}')
chk "همهٔ سطرها PAID‌اند" "$(J "all(r['status']=='PAID' for r in d['rows']) if d['rows'] else True")" "True"

R=$(RUN '{"dataset":"sales","spec":{"columns":["invoiceNo","total"],
     "filters":[{"field":"total","op":"gt","value":0}],"limit":50}}')
chk "صافیِ عددی کار می‌کند" "$(J "all(float(r['total'])>0 for r in d['rows']) if d['rows'] else True")" "True"

chk "عملگرِ ناشناخته رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["invoiceNo"],"filters":[{"field":"status","op":"DROP","value":"x"}]}}')" "400"
chk "صافیِ بی‌مقدار رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["invoiceNo"],"filters":[{"field":"status","op":"eq"}]}}')" "400"
chk "مقدارِ غیرعددی روی میدانِ عددی رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["invoiceNo"],"filters":[{"field":"total","op":"gt","value":"خیلی"}]}}')" "400"
chk "«شامل» روی عدد رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["invoiceNo"],"filters":[{"field":"total","op":"contains","value":"1"}]}}')" "400"

# ---------------------------------------------------------------- تزریق
sec "۵) تلاشِ تزریق"
#
# ⚠️ اینها ورودی‌های واقعی‌اند؛ اگر رشته‌شان به SQL برسد، کار می‌کنند.
#    همه باید ۴۰۰ بگیرند — نه ۵۰۰، که یعنی به پایگاه‌داده رسیده‌اند.
BEFORE_TABLES=$(Q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")

chk "میدانِ ساختگی رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["password"]}}')" "400"
chk "میدان با SQL رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["total FROM \"User\" --"]}}')" "400"
chk "میدان با DROP رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["s.total; DROP TABLE \"Sale\"; --"]}}')" "400"
chk "گروه‌بندی با SQL رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"groupBy":["status) --"],"aggregates":[{"field":"total","fn":"sum"}]}}')" "400"
chk "تابعِ تجمیعِ ساختگی رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"aggregates":[{"field":"total","fn":"(SELECT password FROM \"User\" LIMIT 1) --"}]}}')" "400"
chk "ترتیب با SQL رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["total"],"orderBy":{"field":"total; DROP TABLE \"Sale\"","dir":"asc"}}}')" "400"
chk "جهتِ ترتیبِ ساختگی رد می‌شود" \
  "$(CODE '{"dataset":"sales","spec":{"columns":["total"],"orderBy":{"field":"total","dir":"asc; DROP TABLE \"Sale\""}}}')" "400"
chk "مجموعه‌دادهٔ ساختگی رد می‌شود" \
  "$(CODE '{"dataset":"\"User\"","spec":{"columns":["total"]}}')" "400"

# ⚠️ مقدارِ خطرناک **نباید** رد شود؛ باید بی‌ضرر اجرا شود.
#    پارامتر یعنی همین: نقل‌قول داده است، نه دستور.
R=$(RUN '{"dataset":"sales","spec":{"columns":["invoiceNo"],
     "filters":[{"field":"status","op":"eq","value":"x'\'' OR 1=1 --"}],"limit":10}}')
chk "مقدارِ خطرناک بی‌ضرر اجرا می‌شود" "$(J "d.get('rowCount')")" "0"

chk "هیچ جدولی حذف نشد" \
  "$(Q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")" "$BEFORE_TABLES"

# ---------------------------------------------------------------- سقف
sec "۶) سقفِ سطر"
R=$(RUN '{"dataset":"sales","spec":{"columns":["invoiceNo"],"limit":999999}}')
chk "سقف به ۵۰۰۰ بریده شد" "$(J "d['limit']")" "5000"
R=$(RUN '{"dataset":"sales","spec":{"columns":["invoiceNo"],"limit":1}}')
chk "سقفِ یک رعایت شد" "$(J "d['rowCount'] <= 1")" "True"
# ⚠️ نگفتنِ بریدگی یعنی کاربر گزارشِ ناقص را کامل فرض می‌کند.
chk "بریدگی اعلام می‌شود" "$(J "d.get('truncated')")" "True"

chk "بدونِ ستون و تجمیع رد می‌شود" "$(CODE '{"dataset":"sales","spec":{}}')" "400"

# ---------------------------------------------------------------- ذخیره
sec "۷) گزارشِ ذخیره‌شده"
# بدنه از فایل می‌رود — نامِ گزارش فارسی است.
R=$(POSTF /report-builder/definitions '{"name":"فروش به تفکیک وضعیت","dataset":"sales","spec":{"groupBy":["status"],"aggregates":[{"field":"total","fn":"sum","as":"جمع"}]}}')
DEF=$(J "d.get('id','')")
chk "ذخیره شد" "$([ -n "$DEF" ] && echo yes || echo no)" "yes"
chk "نامِ تکراری رد می‌شود" \
  "$(CODEF /report-builder/definitions '{"name":"فروش به تفکیک وضعیت","dataset":"sales","spec":{"columns":["total"]}}')" "400"

# ⚠️ مشخصاتِ خراب پیش از ذخیره اجرا می‌شود؛ گزارشِ ذخیره‌شده‌ای که کار
#    نمی‌کند، ماه‌ها بعد سرِ کاربر خراب می‌شود.
chk "مشخصاتِ خراب ذخیره نمی‌شود" \
  "$(CODEF /report-builder/definitions '{"name":"خراب","dataset":"sales","spec":{"columns":["nope"]}}')" "400"
chk "و ذخیره نشد" "$(Q "SELECT count(*) FROM \"ReportDefinition\" WHERE name='خراب'")" "0"

R=$(curl -s "${A[@]}" -X POST "$API/report-builder/definitions/$DEF/run" -d '{}')
chk "گزارشِ ذخیره‌شده اجرا شد" "$(J "d.get('name')")" "فروش به تفکیک وضعیت"
chk "و سطر دارد"              "$(J "d['rowCount'] > 0")" "True"

chk "حذف شد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X DELETE "$API/report-builder/definitions/$DEF")" "200"
chk "ناموجود ۴۰۴" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X DELETE "$API/report-builder/definitions/$DEF")" "404"

# ---------------------------------------------------------------- سایر
sec "۸) مجموعه‌دادهای دیگر"
# WARN هر مجموعه‌داده میدان‌های خودش را دارد.
#      نسخهٔ اول `total` را برای همه فرستاد و «موجودی» قرمز شد — که
#      **درست بود**: موجودی میدانی به نامِ total ندارد و باید رد شود.
#      اشتباه از انتظارِ آزمون بود، نه از فهرستِ سفید.
chk "purchases اجرا می‌شود" \
  "$(CODE '{"dataset":"purchases","spec":{"aggregates":[{"field":"total","fn":"count"}]}}')" "201"
chk "inventory اجرا می‌شود" \
  "$(CODE '{"dataset":"inventory","spec":{"aggregates":[{"field":"quantity","fn":"sum"}]}}')" "201"
chk "ledger اجرا می‌شود" \
  "$(CODE '{"dataset":"ledger","spec":{"aggregates":[{"field":"debit","fn":"sum"}]}}')" "201"
# ⚠️ و قرینه‌اش: میدانِ یک مجموعه‌داده نباید در دیگری کار کند.
chk "میدانِ فروش در موجودی رد می‌شود" \
  "$(CODE '{"dataset":"inventory","spec":{"aggregates":[{"field":"total","fn":"sum"}]}}')" "400"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
