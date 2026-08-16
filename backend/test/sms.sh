#!/usr/bin/env bash
#
# پیامک: پیش‌نمایش، انصراف، تاریخچه، و جلوگیری از ارسال دوباره.
#
# مهم‌ترین بندها اینجا **انصراف** و **ارسال تکراری** هستند.  هر دو
# خطاهایی می‌سازند که در لحظه دیده نمی‌شوند: پیامکِ فرستاده‌شده
# برنمی‌گردد، و مشتری‌ای که پس از انصراف پیام بگیرد، شکایت می‌کند و
# سرشمارهٔ فروشگاه را می‌سوزاند.
#
# ⚠️ SMS_API_KEY تنظیم نیست، پس ارسال شبیه‌سازی می‌شود — که برای این
#    آزمون درست است: مسیر و ثبت را می‌سنجیم، نه اپراتور را.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "import sys,json,io;sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8');sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql()  { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# مشتری‌های آزمون؛ اجرای قبلی نباید نتیجه را عوض کند
PH_OK='09121230001'
PH_OUT='09121230002'
psql "DELETE FROM \"SmsMessage\" WHERE phone IN ('$PH_OK','$PH_OUT','09121230003');
      DELETE FROM \"Customer\" WHERE phone IN ('$PH_OK','$PH_OUT');
      DELETE FROM \"SmsTemplate\" WHERE name = 'TEST-Template';"

curl -s -X POST $A/customers -H "$AU" -H "$JS" \
  -d "{\"firstName\":\"Sms\",\"lastName\":\"Yes\",\"phone\":\"$PH_OK\"}" >/dev/null
curl -s -X POST $A/customers -H "$AU" -H "$JS" \
  -d "{\"firstName\":\"Sms\",\"lastName\":\"No\",\"phone\":\"$PH_OUT\"}" >/dev/null

echo '--- 1) ثبت انصراف مشتری ---'
chk "انصراف ثبت شد" "$(curl -s -X POST $A/sms/opt-out -H "$AU" -H "$JS" \
  -d "{\"phone\":\"$PH_OUT\",\"optOut\":true}" | P "d.get('smsOptOut')")" "True"

echo '--- 2) انصراف با شکل دیگرِ همان شماره ---'
# مشتری ممکن است +98 بنویسد؛ اگر نرمال نشود، انصرافش روی هیچ رکوردی
# نمی‌نشیند و عملاً بی‌اثر است.
chk "شمارهٔ +98 همان مشتری را می‌یابد" "$(curl -s -X POST $A/sms/opt-out -H "$AU" -H "$JS" \
  -d "{\"phone\":\"+98${PH_OUT#0}\",\"optOut\":true}" | P "d.get('phone')")" "$PH_OUT"

echo '--- 3) شمارهٔ نامعتبر رد می‌شود ---'
chk "شمارهٔ ثابت رد می‌شود" "$(curl -s -X POST $A/sms/opt-out -H "$AU" -H "$JS" \
  -d '{"phone":"02112345678","optOut":true}' | P "d.get('statusCode')")" "400"

echo '--- 4) پیش‌نمایش چیزی نمی‌فرستد ---'
BEFORE=$(psqlv "SELECT count(*) FROM \"SmsMessage\"")
PV=$(curl -s -X POST $A/sms/preview -H "$AU" -H "$JS" \
  -d "{\"body\":\"Hello {name}\",\"phones\":[\"$PH_OK\",\"$PH_OUT\",\"021123\"]}")
chk "پیش‌نمایش: یک نفر می‌گیرد" "$(echo "$PV" | P "d['willSend']")" "1"
chk "پیش‌نمایش: یک منصرف"      "$(echo "$PV" | P "d['skipped']['optedOut']")" "1"
chk "پیش‌نمایش: یک شمارهٔ خراب" "$(echo "$PV" | P "d['skipped']['invalidPhone']")" "1"
chk "پیش‌نمایش رکوردی نساخت"   "$(psqlv "SELECT count(*) FROM \"SmsMessage\"")" "$BEFORE"

echo '--- 5) ارسال واقعی ---'
SEND=$(curl -s -X POST $A/sms/send -H "$AU" -H "$JS" \
  -d "{\"body\":\"Hello {name}\",\"phones\":[\"$PH_OK\",\"$PH_OUT\"],\"dedupeKey\":\"TEST-RUN-1\"}")
chk "یک پیام فرستاده شد" "$(echo "$SEND" | P "d['sent']")" "1"
chk "یک نفر رد شد"       "$(echo "$SEND" | P "d['skipped']")" "1"

echo '--- 6) منصرف‌شده پیام نگرفت ---'
# مهم‌ترین بند این فایل.
chk "به منصرف چیزی نرفت" \
  "$(psqlv "SELECT count(*) FROM \"SmsMessage\" WHERE phone='$PH_OUT' AND status='SENT'")" "0"
chk "دلیل رد ثبت شد" \
  "$(psqlv "SELECT \"skipReason\" FROM \"SmsMessage\" WHERE phone='$PH_OUT' AND status='SKIPPED' LIMIT 1")" "OPTED_OUT"

echo '--- 7) نام مشتری در متن نشست ---'
chk "قالب جای‌گذاری شد" \
  "$(psqlv "SELECT body FROM \"SmsMessage\" WHERE phone='$PH_OK' AND status='SENT' LIMIT 1")" "Hello Sms Yes"

echo '--- 8) ارسال دوباره با همان کلید تکرار نمی‌شود ---'
# کلیک دوم روی «ارسال» نباید همان پیام را دوباره بفرستد.  محافظت در
# دیتابیس است، نه در حافظهٔ برنامه — پس ری‌استارت هم دورش نمی‌زند.
AGAIN=$(curl -s -X POST $A/sms/send -H "$AU" -H "$JS" \
  -d "{\"body\":\"Hello {name}\",\"phones\":[\"$PH_OK\"],\"dedupeKey\":\"TEST-RUN-1\"}")
chk "بار دوم چیزی نرفت" "$(echo "$AGAIN" | P "d['sent']")" "0"
chk "فقط یک پیام در تاریخچه" \
  "$(psqlv "SELECT count(*) FROM \"SmsMessage\" WHERE phone='$PH_OK' AND status='SENT'")" "1"

echo '--- 9) سقف ایمنی گیرندگان ---'
# اشتباه در انتخاب مخاطب، فاصله‌اش با ارسال درست فقط یک کلیک است.
chk "بیش از سقف رد می‌شود" "$(curl -s -X POST $A/sms/send -H "$AU" -H "$JS" \
  -d "{\"body\":\"x\",\"phones\":[\"$PH_OK\",\"09121230003\"],\"maxRecipients\":1}" \
  | P "d.get('statusCode')")" "400"

echo '--- 10) متن خالی رد می‌شود ---'
chk "متن خالی" "$(curl -s -X POST $A/sms/send -H "$AU" -H "$JS" \
  -d '{"body":"   ","phones":["09121230003"]}' | P "d.get('statusCode')")" "400"

echo '--- 11) متن بیش از حد بلند رد می‌شود ---'
LONG=$(python3 -c "print('x'*800)")
chk "متن ۸۰۰ نویسه" "$(curl -s -X POST $A/sms/send -H "$AU" -H "$JS" \
  -d "{\"body\":\"$LONG\",\"phones\":[\"09121230003\"]}" | P "d.get('statusCode')")" "400"

echo '--- 12) میدان ناشناخته رد می‌شود ---'
chk "میدان ناشناخته" "$(curl -s -X POST $A/sms/send -H "$AU" -H "$JS" \
  -d '{"body":"x","phones":["09121230003"],"evil":"y"}' | P "d.get('statusCode')")" "400"

echo '--- 13) تاریخچه و آمار ---'
chk "تاریخچه برمی‌گردد" "$(curl -s "$A/sms/history?phone=$PH_OK" -H "$AU" | P "'yes' if len(d) > 0 else 'no'")" "yes"
chk "آمار منصرف‌ها"     "$(curl -s $A/sms/stats -H "$AU" | P "int(d['optedOut']) >= 1")" "True"

echo '--- 14) فهرست منصرف‌ها ---'
chk "منصرف در فهرست هست" "$(curl -s $A/sms/opt-out -H "$AU" \
  | P "'yes' if any(c['phone']=='$PH_OUT' for c in d) else 'no'")" "yes"

echo '--- 15) بازگرداندن مشتری ---'
chk "انصراف برداشته شد" "$(curl -s -X POST $A/sms/opt-out -H "$AU" -H "$JS" \
  -d "{\"phone\":\"$PH_OUT\",\"optOut\":false}" | P "d.get('smsOptOut')")" "False"

echo '--- 16) قالب پیام ---'
TPL=$(curl -s -X POST $A/sms/templates -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Template","body":"Off {pct} percent"}')
chk "قالب ساخته شد" "$(echo "$TPL" | P "d.get('name')")" "TEST-Template"
chk "قالب در فهرست" "$(curl -s $A/sms/templates -H "$AU" \
  | P "'yes' if any(t['name']=='TEST-Template' for t in d) else 'no'")" "yes"
# نام یکتاست: ذخیرهٔ دوباره باید به‌روزرسانی کند نه رکورد دوم بسازد
curl -s -X POST $A/sms/templates -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Template","body":"Off {pct} percent - v2"}' >/dev/null
chk "قالب هم‌نام به‌روز شد، تکرار نشد" \
  "$(psqlv "SELECT count(*) FROM \"SmsTemplate\" WHERE name='TEST-Template'")" "1"

echo '--- 17) بدون توکن بسته است ---'
chk "ارسال بدون توکن" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/sms/send \
  -H "$JS" -d '{"body":"x","phones":["09121230003"]}')" "401"

# پاک‌سازی
psql "DELETE FROM \"SmsMessage\" WHERE phone IN ('$PH_OK','$PH_OUT','09121230003');
      DELETE FROM \"SmsTemplate\" WHERE name = 'TEST-Template';
      DELETE FROM \"Customer\" WHERE phone IN ('$PH_OK','$PH_OUT');"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
