#!/usr/bin/env bash
#
# دادهٔ نمونه — و اینکه واقعاً **از راه API** دیده می‌شود.
#
# ⚠️ سنجهٔ «ردیف در جدول هست» کافی نیست.
#
#    نسخهٔ اول همین را می‌سنجید و سبز بود، در حالی که سه چیز شکسته بود:
#
#      • الگوی سند `isActive=false` داشت و `list()` پیش‌فرض فقط
#        فعال‌ها را می‌دهد ⇒ صفحه خالی باز می‌شد
#      • `spec`ِ گزارشِ ذخیره‌شده کلیدِ `column` داشت به‌جای `field`
#        ⇒ در اجرا ۴۰۰ می‌گرفت
#      • `fields`ِ الگوی چک آرایه بود به‌جای شیء ⇒ قیدِ پایگاه‌داده
#        ردش می‌کرد
#
#    هدفِ دادهٔ نمونه این است که صفحه‌ها پر باز شوند.  نمونه‌ای که
#    ذخیره می‌شود ولی باز نمی‌شود، از نبودنش بدتر است: کاربر فکر
#    می‌کند ماژول خراب است.

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
P() { python -c "$1" 2>/dev/null; }

PW="${MOLIDO_ADMIN_PASSWORD:-}"
[ -n "$PW" ] || PW="$(grep '^ADMIN_PASSWORD=' ../.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | P 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
[ -n "$TOKEN" ] || { echo "  x ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN")
J=(-H 'Content-Type: application/json')

sec "۰) اجرا"
OUT=$(docker compose $CF exec -T backend node dist/database/demo.js 2>&1 | tr -d '\r')
chk "بدونِ خطا تمام شد" "$(echo "$OUT" | grep -c '✅')" "1"

# ⚠️ **دو بار** اجرا می‌شود.
#
#    `ON CONFLICT DO NOTHING` روی شناسهٔ ثابت باید اجرای دوباره را
#    بی‌اثر کند.  اگر روزی کسی `gen_random_uuid()` بگذارد، هر اجرا
#    نسخهٔ تازه‌ای می‌سازد و نصبِ نمایشی پر از تکراری می‌شود.
OUT2=$(docker compose $CF exec -T backend node dist/database/demo.js 2>&1 | tr -d '\r')
chk "اجرای دوباره چیزی اضافه نکرد" \
  "$(echo "$OUT2" | grep -oE 'ردیف تازه' | head -1; echo "$OUT2" | grep -oE '— [0-9]+ ردیف' | grep -oE '[0-9]+')" \
  "ردیف تازه
0"

# ---------------------------------------------------------------- دیده شدن
count() { curl -s "${A[@]}" "$API$1" | P 'import sys,json;print(len(json.load(sys.stdin)))'; }

sec "۱) هر ماژول از راه API پر است"
# ⚠️ مسیرها همان‌هایی‌اند که رابط صدا می‌زند، نه نامِ جدول.  یک بار
#    شش مسیر را از روی نامِ ماژول حدس زدم و همه ۴۰۴ دادند.
chk "امانی"          "$([ "$(count /consignments)" -ge 2 ] && echo ok || echo no)" "ok"
chk "تنخواه"          "$([ "$(count /petty-cash)" -ge 1 ] && echo ok || echo no)" "ok"
chk "یادآوری"         "$([ "$(count /reminders)" -ge 3 ] && echo ok || echo no)" "ok"
chk "الگوی سند"       "$([ "$(count /journal-templates)" -ge 1 ] && echo ok || echo no)" "ok"
chk "گزارش‌ساز"       "$([ "$(count /report-builder/definitions)" -ge 1 ] && echo ok || echo no)" "ok"
chk "الگوی چاپ چک"    "$([ "$(count /cheque-print/templates)" -ge 1 ] && echo ok || echo no)" "ok"

sec "۲) گزارشِ ذخیره‌شده واقعاً اجرا می‌شود"
# ⚠️ گران‌بهاترین سنجهٔ این پرونده.  «ذخیره شد» با «باز می‌شود» یکی
#    نیست، و تفاوتشان را فقط اجرا نشان می‌دهد.
R=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/report-builder/definitions/demo-rep-1/run" -d '{}')
chk "بدونِ خطا اجرا شد" \
  "$(echo "$R" | P "import sys,json;d=json.load(sys.stdin);print('ok' if 'rows' in d else d.get('message','?'))")" "ok"

sec "۳) الگوی سند در فهرستِ پیش‌فرض دیده می‌شود"
# ⚠️ `list()` پیش‌فرض فقط فعال‌ها را می‌دهد؛ الگوی غیرفعال ذخیره
#    می‌شود ولی صفحه خالی می‌ماند.
chk "فعال است" \
  "$(curl -s "${A[@]}" "$API/journal-templates" | P "import sys,json;print(any(t['id']=='demo-tpl-1' for t in json.load(sys.stdin)))")" "True"

sec "۴) امانیِ نمونه از صندوق فروختنی است"
# ⚠️ نمونه‌ای که نتوان با آن کاری کرد، فقط ردیفِ تزئینی است.
#    مهاجرت ۰۸۷ فروشش را ممکن کرد؛ این می‌سنجد که نمونه هم واقعاً
#    قابلِ فروش ساخته شده (باز است، مقدارِ آزاد دارد).
OPEN=$(curl -s "${A[@]}" "$API/consignments" \
  | P "import sys,json;d=json.load(sys.stdin);print(sum(1 for c in d if c['direction']=='IN' and c['status']=='OPEN'))")
chk "دستِ‌کم یک سندِ امانیِ بازِ ورودی" "$([ "${OPEN:-0}" -ge 1 ] && echo ok || echo no)" "ok"

sec "۵) دادهٔ رستوران هم ساخته می‌شود"
# ⚠️ جدول‌های رستوران در **همهٔ** نمایه‌ها هستند، فقط ماژولش در نمایهٔ
#    فروشگاه بار نمی‌شود.  پس این‌جا از پایگاه‌داده سنجیده می‌شود نه
#    از API — وگرنه در نمایهٔ فروشگاه ۴۰۴ می‌گیرد و سنجه بی‌معنا
#    می‌شود.
QQ() { docker compose $CF exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" | tr -d ''; }
chk "شش میز"        "$(QQ "SELECT count(*)::int FROM \"RestaurantTable\" WHERE id LIKE 'demo-%'")" "6"
chk "پنج قلمِ منو"   "$(QQ "SELECT count(*)::int FROM \"MenuItem\" WHERE id LIKE 'demo-%'")" "5"
# ⚠️ رسپی همان چیزی است که رستوران را از فروشگاه جدا می‌کند؛ بدونِ
#    نمونه، صفحهٔ بهای تمام‌شدهٔ غذا خالی باز می‌شود.
chk "رسپی هست"      "$(QQ "SELECT count(*)::int FROM \"MenuRecipe\" WHERE id LIKE 'demo-%'")" "2"
# ⚠️ دو ایستگاه، وگرنه صفحهٔ آشپزخانه معنایش را نشان نمی‌دهد.
chk "دو ایستگاهِ آشپزخانه"   "$(QQ "SELECT count(DISTINCT station)::int FROM \"MenuItem\" WHERE id LIKE 'demo-%'")" "2"

sec "۶) دفتر کل دست‌نخورده ماند"
# ⚠️ دادهٔ نمونه نباید سند بزند.  سندِ نمایشی در دفتری که اظهارِ
#    مالیاتی از آن درمی‌آید، چند ماه بعد قابلِ تشخیص نیست.
chk "هیچ سندی با شناسهٔ demo نیست" \
  "$(docker compose $CF exec -T postgres psql -U postgres -d molido_ai -tAq -c \
      "SELECT count(*)::int FROM \"JournalEntry\" WHERE \"sourceId\" LIKE 'demo-%'" | tr -d '\r')" "0"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
