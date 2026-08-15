#!/usr/bin/env bash
#
# منابع انسانی: حضور و غیاب، مرخصی، مانده، و سند حسابداری حقوق.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است: پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند و شکستِ کاذب می‌سازد.  خودِ برنامه یونیکد
#    را درست ذخیره می‌کند؛ برای آزمودنش JSON را در فایل UTF-8 بنویسید و با
#    `curl --data-binary @file` بفرستید.

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
P() { python3 -c "import sys,json,io;sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# آزمون باید از هر وضعیتی قابل اجرا باشد.  کارمند آزمون و همهٔ رکوردهای
# وابسته‌اش پاک می‌شوند، وگرنه اجرای دوم روی «شمارهٔ پرسنلی تکراری» شکست
# می‌خورد و ۱۹ شکستِ زنجیره‌ای می‌سازد که هیچ‌کدام باگ واقعی نیستند.
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"JournalLine\" WHERE \"entryId\" IN (
    SELECT e.id FROM \"JournalEntry\" e
     WHERE e.\"sourceType\" IN ('PayrollSlip','PayrollPayment')
       AND e.\"sourceId\" IN (
         SELECT s.id FROM \"PayrollSlip\" s
          JOIN \"Employee\" x ON x.id = s.\"employeeId\"
         WHERE x.\"employeeNo\" = 'EMP-T01'));
  DELETE FROM \"JournalEntry\" WHERE \"sourceType\" IN ('PayrollSlip','PayrollPayment')
     AND \"sourceId\" IN (
       SELECT s.id FROM \"PayrollSlip\" s
        JOIN \"Employee\" x ON x.id = s.\"employeeId\"
       WHERE x.\"employeeNo\" = 'EMP-T01');
  DELETE FROM \"Employee\" WHERE \"employeeNo\" = 'EMP-T01';
" >/dev/null 2>&1

echo '--- 1) employee ---'
E=$(curl -s -X POST $A/payroll/employees -H "$AU" -H "$JS" \
  -d '{"firstName":"Ali","lastName":"Karimi","employeeNo":"EMP-T01","baseSalary":100000000,"hireDate":"2024-01-01"}')
EID=$(echo "$E" | P "d.get('id','')")
chk "employee created" "$(echo "$E" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 2) attendance: 10h => 8 worked + 2 overtime ---'
AT=$(curl -s -X POST $A/attendance -H "$AU" -H "$JS" \
  -d "{\"employeeId\":\"$EID\",\"date\":\"2026-04-01\",\"checkIn\":\"2026-04-01T08:00:00Z\",\"checkOut\":\"2026-04-01T18:00:00Z\"}")
chk "worked hours"   "$(echo "$AT" | P "int(float(d.get('workedHours',0)))")"   "8"
chk "overtime hours" "$(echo "$AT" | P "int(float(d.get('overtimeHours',0)))")" "2"

echo '--- 3) re-record same day must not double ---'
curl -s -X POST $A/attendance -H "$AU" -H "$JS" \
  -d "{\"employeeId\":\"$EID\",\"date\":\"2026-04-01\",\"checkIn\":\"2026-04-01T08:00:00Z\",\"checkOut\":\"2026-04-01T18:00:00Z\"}" >/dev/null
chk "one record per day" "$(Q "SELECT count(*) FROM \"AttendanceRecord\" WHERE \"employeeId\"='$EID' AND date='2026-04-01';")" "1"

echo '--- 4) checkout before checkin rejected ---'
chk "reversed times rejected" "$(curl -s -X POST $A/attendance -H "$AU" -H "$JS" \
  -d "{\"employeeId\":\"$EID\",\"date\":\"2026-04-02\",\"checkIn\":\"2026-04-02T18:00:00Z\",\"checkOut\":\"2026-04-02T08:00:00Z\"}" | P "d.get('statusCode')")" "400"

echo '--- 5) leave entitlement ---'
curl -s -X POST $A/attendance/balances -H "$AU" -H "$JS" \
  -d "{\"employeeId\":\"$EID\",\"year\":2026,\"entitled\":10}" >/dev/null
chk "entitlement set" "$(curl -s "$A/attendance/balances?year=2026" -H "$AU" | P "int(float([b['entitled'] for b in d if b['employeeId']=='$EID'][0]))")" "10"

echo '--- 6) leave request: 3 days ---'
L=$(curl -s -X POST $A/attendance/leaves -H "$AU" -H "$JS" \
  -d "{\"employeeId\":\"$EID\",\"kind\":\"ANNUAL\",\"startDate\":\"2026-04-10\",\"endDate\":\"2026-04-12\"}")
LID=$(echo "$L" | P "d.get('id','')")
chk "3 days inclusive" "$(echo "$L" | P "int(float(d.get('days',0)))")" "3"

echo '--- 7) approve leave => balance used + attendance marked ---'
curl -s -X PATCH "$A/attendance/leaves/$LID/decide" -H "$AU" -H "$JS" -d '{"approve":true}' >/dev/null
chk "balance used"      "$(curl -s "$A/attendance/balances?year=2026" -H "$AU" | P "int(float([b['used'] for b in d if b['employeeId']=='$EID'][0]))")" "3"
chk "attendance marked" "$(Q "SELECT count(*) FROM \"AttendanceRecord\" WHERE \"employeeId\"='$EID' AND status='LEAVE';")" "3"

echo '--- 8) deciding twice rejected ---'
chk "double decide rejected" "$(curl -s -X PATCH "$A/attendance/leaves/$LID/decide" -H "$AU" -H "$JS" -d '{"approve":true}' | P "d.get('statusCode')")" "400"

echo '--- 9) leave beyond entitlement rejected (10 left = 7) ---'
L2=$(curl -s -X POST $A/attendance/leaves -H "$AU" -H "$JS" \
  -d "{\"employeeId\":\"$EID\",\"kind\":\"ANNUAL\",\"startDate\":\"2026-05-01\",\"endDate\":\"2026-05-20\"}")
L2ID=$(echo "$L2" | P "d.get('id','')")
chk "over-entitlement rejected" "$(curl -s -X PATCH "$A/attendance/leaves/$L2ID/decide" -H "$AU" -H "$JS" -d '{"approve":true}' | P "d.get('statusCode')")" "500"

echo '--- 10) payroll slip ---'
# حقوق پایه و مزایا از رکورد کارمند خوانده می‌شوند؛ بدنه فقط اقلام دوره‌ای
# را می‌گیرد.  کارمند آزمون: پایه ۱۰۰م، بدون مزایا ⇒ ناخالص ۱۰۰م.
S=$(curl -s -X POST $A/payroll/slips -H "$AU" -H "$JS" \
  -d "{\"employeeId\":\"$EID\",\"period\":\"2026-04\",\"insurance\":7000000,\"tax\":5000000}")
SID=$(echo "$S" | P "d.get('id','')")
chk "slip created" "$(echo "$S" | P "'yes' if d.get('id') else 'no'")" "yes"
chk "net pay" "$(echo "$S" | P "int(float(d.get('netPay',0)))")" "88000000"

echo '--- 11) approve slip => journal entry ---'
curl -s -X PATCH "$A/payroll/slips/$SID/approve" -H "$AU" -H "$JS" -d '{}' >/dev/null
chk "payroll entry posted" "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='PayrollSlip' AND \"sourceId\"='$SID';")" "1"
chk "salary expense 5201" "$(Q "SELECT COALESCE(SUM(l.debit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" JOIN \"Account\" a ON a.id=l.\"accountId\" WHERE e.\"sourceId\"='$SID' AND a.code='5201';")" "100000000"
chk "salary payable 2104" "$(Q "SELECT COALESCE(SUM(l.credit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" JOIN \"Account\" a ON a.id=l.\"accountId\" WHERE e.\"sourceId\"='$SID' AND a.code='2104';")" "88000000"

echo '--- 12) approve twice rejected ---'
chk "double approve rejected" "$(curl -s -X PATCH "$A/payroll/slips/$SID/approve" -H "$AU" -H "$JS" -d '{}' | P "d.get('statusCode')")" "400"

echo '--- 13) pay slip => settlement entry ---'
curl -s -X PATCH "$A/payroll/slips/$SID/pay" -H "$AU" -H "$JS" -d '{}' >/dev/null
chk "payment entry posted" "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='PayrollPayment' AND \"sourceId\"='$SID';")" "1"

echo '--- 14) trial balance still zero ---'
chk "trial balance" "$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" WHERE e.status<>'DRAFT';")" "0"

echo '--- 15) monthly summary ---'
chk "summary overtime" "$(curl -s "$A/attendance/summary?period=2026-04-01" -H "$AU" | P "int(float([r['overtimeHours'] for r in d if r['employeeId']=='$EID'][0]))")" "2"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
