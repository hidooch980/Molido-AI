#!/usr/bin/env bash
#
# یادآوری‌ها.
#
# ⚠️ سنجهٔ اصلی: **سررسیدشده باید در فیدِ هشدار دیده شود.**
#
#    یادآوری‌ای که کاربر باید در صفحهٔ جدا دنبالش بگردد، همان یادآوری‌ای
#    است که فراموش می‌شود.  اگر این سنجه نبود، می‌شد جدول و مسیرِ کامل
#    ساخت که هیچ‌کس هرگز نبیندش — و همه‌چیز هم سبز باشد.

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
cleanup() { Q "DELETE FROM \"Reminder\" WHERE \"companyId\"='$CO'" >/dev/null; }
trap cleanup EXIT
cleanup

POST() { curl -s "${A[@]}" -X POST "$API$1" -d "$2"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X POST "$API$1" -d "$2"; }
PCODE(){ curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X PATCH "$API$1" -d "${2:-{\}}"; }
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }

# ---------------------------------------------------------------- ساخت
sec "۱) ساخت"
PAST=$(P "import datetime;print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=2)).isoformat())")
FUTURE=$(P "import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=10)).isoformat())")

R=$(POST /reminders "{\"title\":\"پیگیری چک آقای رضایی\",\"dueAt\":\"$PAST\"}")
DUE_ID=$(J "d.get('id','')")
chk "یادآوری سررسیدشده ساخته شد" "$([ -n "$DUE_ID" ] && echo yes || echo no)" "yes"
chk "گذشته علامت خورد" "$(J "d.get('isOverdue')")" "True"
chk "تاریخ شمسی دارد"  "$(J "len(d.get('dueAtJalali',''))")" "10"

R=$(POST /reminders "{\"title\":\"تمدید بیمه\",\"dueAt\":\"$FUTURE\"}")
SOON_ID=$(J "d.get('id','')")
chk "یادآوری آینده ساخته شد" "$([ -n "$SOON_ID" ] && echo yes || echo no)" "yes"
chk "آینده گذشته نیست"       "$(J "d.get('isOverdue')")" "False"

# ---------------------------------------------------------------- اعتبار
sec "۲) ورودیِ نامعتبر"
chk "بدونِ عنوان رد می‌شود"        "$(CODE /reminders "{\"dueAt\":\"$FUTURE\"}")" "400"
chk "عنوانِ فقط‌فاصله رد می‌شود"   "$(CODE /reminders "{\"title\":\"   \",\"dueAt\":\"$FUTURE\"}")" "400"
chk "بدونِ سررسید رد می‌شود"       "$(CODE /reminders '{"title":"x"}')" "400"
chk "سررسیدِ بدشکل رد می‌شود"      "$(CODE /reminders '{"title":"x","dueAt":"چهارشنبه"}')" "400"
# ⚠️ شناسهٔ بی‌نوع قابلِ استفاده نیست و نوعِ بی‌شناسه چیزی را باز نمی‌کند.
chk "نوعِ بی‌شناسه رد می‌شود"      "$(CODE /reminders "{\"title\":\"x\",\"dueAt\":\"$FUTURE\",\"entityType\":\"CUSTOMER\"}")" "400"
chk "شناسهٔ بی‌نوع رد می‌شود"      "$(CODE /reminders "{\"title\":\"x\",\"dueAt\":\"$FUTURE\",\"entityId\":\"c1\"}")" "400"
chk "نوعِ ناشناخته رد می‌شود"      "$(CODE /reminders "{\"title\":\"x\",\"dueAt\":\"$FUTURE\",\"entityType\":\"MOON\",\"entityId\":\"c1\"}")" "400"
chk "نوع و شناسه با هم پذیرفته می‌شوند" \
  "$(CODE /reminders "{\"title\":\"x\",\"dueAt\":\"$FUTURE\",\"entityType\":\"CUSTOMER\",\"entityId\":\"c1\"}")" "201"

# ---------------------------------------------------------------- فید هشدار
sec "۳) در فیدِ هشدار دیده می‌شود"
R=$(curl -s "${A[@]}" "$API/notifications")
# ⚠️ اصلِ ماجرا.  بدونِ این، جدول و مسیر می‌سازیم که هیچ‌کس نمی‌بیندش.
chk "سررسیدشده در فیدِ هشدار هست" \
  "$(J "'$DUE_ID' in [r['id'] for r in d.get('dueReminders',[])]")" "True"
chk "شمارنده هم آمده" "$(J "d.get('dueRemindersCount')")" "1"
# ⚠️ یادآوریِ آینده نباید در هشدار بیاید؛ وگرنه فید پر می‌شود از چیزی
#    که هنوز کاری با آن نیست و کاربر از نگاه کردن دست می‌کشد.
chk "آینده در هشدار نیست" \
  "$(J "'$SOON_ID' in [r['id'] for r in d.get('dueReminders',[])]")" "False"

# ---------------------------------------------------------------- فهرست
sec "۴) فهرست"
R=$(curl -s "${A[@]}" "$API/reminders")
chk "پیش‌فرض فقط بازها" "$(J "all(r['status']=='PENDING' for r in d)")" "True"
chk "به ترتیبِ سررسید"  "$(J "d[0]['id']=='$DUE_ID'")" "True"
R=$(curl -s "${A[@]}" "$API/reminders?due=now")
chk "صافیِ سررسیدشده"   "$(J "len(d)")" "1"

# ---------------------------------------------------------------- تعویق
sec "۵) به تعویق انداختن"
NEXT=$(P "import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=5)).isoformat())")
chk "تعویق پذیرفته شد" "$(PCODE "/reminders/$DUE_ID/snooze" "{\"dueAt\":\"$NEXT\"}")" "200"
R=$(curl -s "${A[@]}" "$API/notifications")
# ⚠️ پس از تعویق باید از فیدِ هشدار برود، ولی گم نشود.
chk "از فیدِ هشدار رفت" \
  "$(J "'$DUE_ID' in [r['id'] for r in d.get('dueReminders',[])]")" "False"
chk "ولی هنوز باز است" "$(Q "SELECT status FROM \"Reminder\" WHERE id='$DUE_ID'")" "PENDING"
chk "تعویقِ بدونِ تاریخ رد می‌شود" "$(PCODE "/reminders/$DUE_ID/snooze" '{}')" "400"

# ---------------------------------------------------------------- بستن
sec "۶) انجام و لغو"
chk "انجام شد" "$(PCODE "/reminders/$DUE_ID/complete")" "200"
chk "وضعیت DONE" "$(Q "SELECT status FROM \"Reminder\" WHERE id='$DUE_ID'")" "DONE"
# ⚠️ قیدِ پایگاه‌داده اجبار می‌کند: DONE بدونِ doneAt ممکن نیست.
chk "زمانِ انجام ثبت شد" \
  "$(Q "SELECT (\"doneAt\" IS NOT NULL) FROM \"Reminder\" WHERE id='$DUE_ID'")" "t"
chk "انجامِ دوباره رد می‌شود" "$(PCODE "/reminders/$DUE_ID/complete")" "400"
chk "تعویقِ انجام‌شده رد می‌شود" "$(PCODE "/reminders/$DUE_ID/snooze" "{\"dueAt\":\"$NEXT\"}")" "404"

chk "لغو شد" "$(PCODE "/reminders/$SOON_ID/cancel")" "200"
chk "وضعیت CANCELLED" "$(Q "SELECT status FROM \"Reminder\" WHERE id='$SOON_ID'")" "CANCELLED"
chk "لغوشده doneAt ندارد" \
  "$(Q "SELECT (\"doneAt\" IS NULL) FROM \"Reminder\" WHERE id='$SOON_ID'")" "t"

chk "ناموجود ۴۰۴" "$(PCODE "/reminders/no-such-id/complete")" "404"

# ---------------------------------------------------------------- پس از بستن
sec "۷) پس از بستن"
R=$(curl -s "${A[@]}" "$API/reminders")
chk "انجام‌شده در فهرستِ پیش‌فرض نیست" \
  "$(J "'$DUE_ID' in [r['id'] for r in d]")" "False"
R=$(curl -s "${A[@]}" "$API/reminders?status=ALL")
chk "با status=ALL دیده می‌شود" \
  "$(J "'$DUE_ID' in [r['id'] for r in d]")" "True"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
