#!/usr/bin/env bash
#
# پیکرهٔ صوتی بلوچی — ساخت دادهٔ آموزش تشخیص گفتار.
#
# هیچ موتور گفتار بلوچی وجود ندارد و دلیلش نبودِ داده است، نه نبودِ
# الگوریتم.  این ماژول همان داده را از فهرست کالای فروشگاه می‌سازد.
#
# ⚠️ متن فارسی/بلوچی از راه **فایل** فرستاده می‌شود نه `curl -d`:
#    پوستهٔ ویندوز متن غیرلاتین را در argv به علامت سؤال تبدیل می‌کند.

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
# ⚠️ رمزگذاری **ورودی** هم باید صریح باشد.
#
# پایتون روی ویندوز stdin را با صفحه‌کد سیستم می‌خواند نه UTF-8؛ JSON
# فارسیِ سرور دوباره کدگذاری می‌شد و هر مقایسهٔ متن فارسی بی‌صدا
# شکست می‌خورد.  چون هیچ آزمون دیگری متن فارسیِ JSON را مقایسه
# نمی‌کرد، این ایراد تا امروز دیده نشده بود.
P() { python3 -c "import sys,json,io;sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8');sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql()  { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# ⚠️ آزمون روی زبان جداگانه کار می‌کند، نه روی 'bal'.
#
# پاک‌سازیِ پایان، عبارت‌ها را حذف می‌کند.  اگر همان زبانِ واقعی باشد،
# اجرای رگرسیون روی یک نصبِ زنده ماه‌ها ضبطِ فروشندگان را از بین
# می‌برد — و هیچ‌کس تا روزِ آموزش نمی‌فهمد.
L=voicetst

TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT
# ارسال بدنهٔ فارسی از فایل — argv پوسته دست‌نخورده می‌ماند.
jpost() { curl -s -X "$1" "$2" -H "$AU" -H "$JS" --data-binary "@$3"; }

psql "DELETE FROM \"VoiceSample\" WHERE \"speakerTag\" LIKE 'VT-%';
      DELETE FROM \"VoicePhrase\" WHERE lang = 'voicetst';
      DELETE FROM \"Product\" WHERE sku LIKE 'VOICE-TEST-%';"

# کالاهایی که نامشان حرف عربی دارد — تا بازنویسی املای بلوچی آزموده شود.
cat > "$TMPD/p1.json" <<'EOF'
{"name":"صابون","sku":"VOICE-TEST-1","unit":"pcs","salePrice":50000,"purchasePrice":30000}
EOF
cat > "$TMPD/p2.json" <<'EOF'
{"name":"نان","sku":"VOICE-TEST-2","unit":"pcs","salePrice":20000,"purchasePrice":12000}
EOF
jpost POST $A/products "$TMPD/p1.json" >/dev/null
jpost POST $A/products "$TMPD/p2.json" >/dev/null

echo '--- 1) فهرست گویش‌ها ---'
D=$(curl -s "$A/voice/dialects" -H "$AU")
chk "سه گویش" "$(echo "$D" | P "len(d)")" "3"
chk "سرحدی هست" "$(echo "$D" | P "'SARHADDI' in [x['code'] for x in d]")" "True"
chk "برچسب فارسی دارد" \
  "$(echo "$D" | P "[x['label'] for x in d if x['code']=='MAKRANI'][0]")" "مکرانی"

echo '--- 2) ساخت عبارت‌ها ---'
B=$(curl -s -X POST "$A/voice/phrases/build?lang=$L" -H "$AU")
chk "گویش پیش‌فرض سرحدی" "$(echo "$B" | P "d.get('dialect')")" "SARHADDI"
# ۳۰ عدد پایه + ۱۰ فرمان + کالاها
chk "اعداد و فرمان‌ها ساخته شدند" \
  "$(psqlv "SELECT count(*) FROM \"VoicePhrase\" WHERE lang='voicetst' AND kind IN ('NUMBER','COMMAND') AND dialect='SARHADDI'")" "40"
chk "کالاها ساخته شدند" \
  "$(psqlv "SELECT count(*)>=2 FROM \"VoicePhrase\" WHERE lang='voicetst' AND kind='PRODUCT' AND dialect='SARHADDI'")" "t"

echo '--- 3) ساخت دوباره، تکراری نمی‌سازد ---'
# عبارت تکراری یعنی ضبط‌ها بین دو ردیف پخش می‌شوند و هیچ‌کدام به حد
# نصاب نمی‌رسند — خطایی که تا روز آموزش دیده نمی‌شود.
curl -s -X POST "$A/voice/phrases/build?lang=$L" -H "$AU" >/dev/null
chk "بدون تکرار" \
  "$(psqlv "SELECT count(*) FROM \"VoicePhrase\" WHERE lang='voicetst' AND kind IN ('NUMBER','COMMAND') AND dialect='SARHADDI'")" "40"

echo '--- 4) گویش نامعتبر رد می‌شود ---'
chk "گویش ناشناس ۴۰۰" \
  "$(curl -s -X POST "$A/voice/phrases/build?lang=$L&dialect=BALOCHI" -H "$AU" | P "d.get('statusCode')")" "400"
chk "گویش خالی، پیش‌فرض" \
  "$(curl -s -X POST "$A/voice/phrases/build?lang=$L&dialect=" -H "$AU" | P "d.get('dialect')")" "SARHADDI"

echo '--- 5) گویش‌ها از هم جدا هستند ---'
curl -s -X POST "$A/voice/phrases/build?lang=$L&dialect=MAKRANI" -H "$AU" >/dev/null
chk "مکرانی جدا ساخته شد" \
  "$(psqlv "SELECT count(*) FROM \"VoicePhrase\" WHERE lang='voicetst' AND kind='COMMAND' AND dialect='MAKRANI'")" "10"
chk "سرحدی دست‌نخورد" \
  "$(psqlv "SELECT count(*) FROM \"VoicePhrase\" WHERE lang='voicetst' AND kind='COMMAND' AND dialect='SARHADDI'")" "10"

echo '--- 6) ورود واژه‌نامه ---'
cat > "$TMPD/dict.json" <<'EOF'
{"csv":"فارسی,بلوچی\nنان,نگن\nآب,آپ\nیک,یک\nدو,دو\nاضافه کن,پچ کن\nهیچ‌کالایی,نداریم\n","dialect":"SARHADDI","lang":"voicetst"}
EOF
DI=$(jpost POST $A/voice/dictionary "$TMPD/dict.json")
chk "واژه‌ها خوانده شدند" "$(echo "$DI" | P "d.get('words')")" "6"
chk "گویش در پاسخ می‌آید" "$(echo "$DI" | P "d.get('dialect')")" "SARHADDI"
# «نان» کالاست، «یک»/«دو» عددند، «اضافه کن» فرمان — چهار تطبیق.
chk "تطبیق با عبارت‌ها" "$(echo "$DI" | P "d.get('matched')>=4")" "True"
chk "متن بلوچیِ نان ثبت شد" \
  "$(psqlv "SELECT \"textTarget\" FROM \"VoicePhrase\" WHERE lang='voicetst' AND \"textFa\"='نان' AND dialect='SARHADDI'")" "نگن"

# «۳۳ مورد تطبیق شد» چیزی برای بازبینی نمی‌دهد.  واژه‌نامه‌های بلوچیِ
# در دسترس با گذر از انگلیسی ساخته می‌شوند و گذر، ابهام فارسی را به
# خطا بدل می‌کند — کسی باید ببیند چه چیزی عوض شد.
chk "فهرست تغییرها برمی‌گردد" "$(echo "$DI" | P "len(d.get('changes',[]))==d['matched']")" "True"
chk "فرمان‌ها اول بازبینی می‌شوند" "$(echo "$DI" | P "d['changes'][0]['kind']")" "COMMAND"
chk "هر تغییر متن بلوچی‌اش را می‌گوید" "$(echo "$DI" | P "all(c.get('textTarget') for c in d['changes'])")" "True"

echo '--- 7) واژه‌نامه گویش دیگر را آلوده نمی‌کند ---'
chk "مکرانی هنوز خالی" \
  "$(psqlv "SELECT count(*) FROM \"VoicePhrase\" WHERE lang='voicetst' AND dialect='MAKRANI' AND \"textTarget\" IS NOT NULL")" "0"

echo '--- 8) سطر ناقص گزارش می‌شود نه نادیده ---'
cat > "$TMPD/bad.json" <<'EOF'
{"csv":"فارسی,بلوچی\nشیر,\n,چیزی\nنان,نگن\n"}
EOF
BD=$(jpost POST $A/voice/dictionary "$TMPD/bad.json")
chk "دو سطر رد شد" "$(echo "$BD" | P "d.get('skipped')")" "2"
chk "دلیل رد گفته شد" "$(echo "$BD" | P "len(d.get('skippedRows',[]))")" "2"

echo '--- 9) فایل خالی رد می‌شود ---'
cat > "$TMPD/empty.json" <<'EOF'
{"csv":"   ","lang":"voicetst"}
EOF
chk "واژه‌نامهٔ خالی ۴۰۰" "$(jpost POST $A/voice/dictionary "$TMPD/empty.json" | P "d.get('statusCode')")" "400"

echo '--- 10) پیشنهاد املای بلوچی ---'
SG=$(curl -s "$A/voice/phrases/suggest?lang=$L" -H "$AU")
chk "صابون پیشنهاد دارد" \
  "$(echo "$SG" | P "[x['suggestion'] for x in d if x['textFa']=='صابون'][0]")" "سابون"
chk "دلیل تغییر گفته می‌شود" \
  "$(echo "$SG" | P "'ص ← س' in [x for y in d if y['textFa']=='صابون' for x in y['notes']]")" "True"
chk "عبارت بدون حرف عربی پیشنهاد ندارد" \
  "$(echo "$SG" | P "any(x['textFa']=='پرداخت' for x in d)")" "False"

echo '--- 11) پیشنهاد چیزی ذخیره نمی‌کند ---'
# واژه‌ای که ماشین حدس زده و آدمی ندیده، از خالی بودنش بدتر است.
chk "صابون هنوز متن بلوچی ندارد" \
  "$(psqlv "SELECT coalesce(\"textTarget\",'NULL') FROM \"VoicePhrase\" WHERE lang='voicetst' AND \"textFa\"='صابون' AND dialect='SARHADDI'")" "NULL"

echo '--- 12) تأیید دستی متن بلوچی ---'
PID=$(psqlv "SELECT id FROM \"VoicePhrase\" WHERE lang='voicetst' AND \"textFa\"='صابون' AND dialect='SARHADDI'")
cat > "$TMPD/target.json" <<'EOF'
{"textTarget":"سابون"}
EOF
jpost PATCH "$A/voice/phrases/$PID" "$TMPD/target.json" >/dev/null
chk "متن بلوچی ثبت شد" \
  "$(psqlv "SELECT \"textTarget\" FROM \"VoicePhrase\" WHERE lang='voicetst' AND id='$PID'")" "سابون"

echo '--- 13) ضبط صدا ---'
S1=$(curl -s -X POST "$A/voice/samples" -H "$AU" -H "$JS" \
  -d "{\"phraseId\":\"$PID\",\"audioUrl\":\"/uploads/voice/vt1.webm\",\"speakerTag\":\"VT-A\",\"durationMs\":1400}")
SID=$(echo "$S1" | P "d.get('id','')")
chk "ضبط ثبت شد" "$([ -n "$SID" ] && echo yes || echo no)" "yes"
chk "وضعیت اولیه در انتظار" "$(echo "$S1" | P "d.get('status')")" "PENDING"

echo '--- 14) ضبط برای عبارت ناموجود ---'
chk "عبارت ناموجود ۴۰۴" \
  "$(curl -s -X POST "$A/voice/samples" -H "$AU" -H "$JS" \
     -d '{"phraseId":"no-such-phrase","audioUrl":"/x.webm","speakerTag":"VT-A"}' | P "d.get('statusCode')")" "404"

echo '--- 15) ضبط بی‌کیفیت رد می‌شود ---'
# کوتاه‌تر از ۲۰۰ms معمولاً کلیک دکمه است و بلندتر از ۳۰s یعنی
# میکروفن باز مانده — هر دو مدل را بدتر می‌کنند نه بهتر.
chk "ضبط خیلی کوتاه ۴۰۰" \
  "$(curl -s -X POST "$A/voice/samples" -H "$AU" -H "$JS" \
     -d "{\"phraseId\":\"$PID\",\"audioUrl\":\"/x.webm\",\"speakerTag\":\"VT-A\",\"durationMs\":50}" | P "d.get('statusCode')")" "400"
chk "ضبط خیلی بلند ۴۰۰" \
  "$(curl -s -X POST "$A/voice/samples" -H "$AU" -H "$JS" \
     -d "{\"phraseId\":\"$PID\",\"audioUrl\":\"/x.webm\",\"speakerTag\":\"VT-A\",\"durationMs\":45000}" | P "d.get('statusCode')")" "400"
chk "گویندهٔ بی‌نام ۴۰۰" \
  "$(curl -s -X POST "$A/voice/samples" -H "$AU" -H "$JS" \
     -d "{\"phraseId\":\"$PID\",\"audioUrl\":\"/x.webm\",\"speakerTag\":\"  \"}" | P "d.get('statusCode')")" "400"

echo '--- 16) صف بازبینی ---'
chk "ضبط در صف است" \
  "$(curl -s "$A/voice/samples/pending?lang=$L" -H "$AU" | P "sum(1 for x in d if x['speakerTag']=='VT-A')")" "1"

echo '--- 17) رد ضبط، دلیل نگه می‌دارد ---'
curl -s -X PATCH "$A/voice/samples/$SID" -H "$AU" -H "$JS" \
  -d '{"approved":false,"reason":"noisy"}' >/dev/null
chk "وضعیت رد شد" "$(psqlv "SELECT status FROM \"VoiceSample\" WHERE id='$SID'")" "REJECTED"
chk "دلیل ثبت شد" "$(psqlv "SELECT \"rejectReason\" FROM \"VoiceSample\" WHERE id='$SID'")" "noisy"
chk "از صف بازبینی رفت" \
  "$(curl -s "$A/voice/samples/pending?lang=$L" -H "$AU" | P "sum(1 for x in d if x['speakerTag']=='VT-A')")" "0"

echo '--- 18) ضبط رد‌شده در مانیفست نمی‌آید ---'
chk "مانیفست خالی" \
  "$(curl -s "$A/voice/manifest?lang=$L" -H "$AU" | P "sum(1 for x in d if x['speaker']=='VT-A')")" "0"

echo '--- 19) پنج ضبط از سه گوینده ---'
for i in 1 2 3 4 5; do
  case $i in 1|2) SP=VT-A ;; 3|4) SP=VT-B ;; *) SP=VT-C ;; esac
  ID=$(curl -s -X POST "$A/voice/samples" -H "$AU" -H "$JS" \
    -d "{\"phraseId\":\"$PID\",\"audioUrl\":\"/uploads/voice/vt-$i.webm\",\"speakerTag\":\"$SP\",\"durationMs\":1500}" \
    | P "d.get('id','')")
  curl -s -X PATCH "$A/voice/samples/$ID" -H "$AU" -H "$JS" -d '{"approved":true}' >/dev/null
done
chk "پنج ضبط تأیید شد" \
  "$(psqlv "SELECT count(*) FROM \"VoiceSample\" WHERE \"phraseId\"='$PID' AND status='APPROVED'")" "5"

echo '--- 20) مانیفست، متن بلوچی می‌دهد نه فارسی ---'
M=$(curl -s "$A/voice/manifest?lang=$L" -H "$AU")
chk "پنج سطر در مانیفست" "$(echo "$M" | P "sum(1 for x in d if x['speaker'].startswith('VT-'))")" "5"
chk "متن بلوچی است" "$(echo "$M" | P "[x['text'] for x in d if x['speaker'].startswith('VT-')][0]")" "سابون"
chk "گویش در مانیفست هست" \
  "$(echo "$M" | P "[x['dialect'] for x in d if x['speaker'].startswith('VT-')][0]")" "SARHADDI"

echo '--- 21) وضعیت آمادگی ---'
ST=$(curl -s "$A/voice/status?lang=$L" -H "$AU")
chk "سه گوینده شمرده شد" "$(echo "$ST" | P "d.get('speakers')")" "3"
chk "یک عبارت کامل" "$(echo "$ST" | P "d.get('ready')")" "1"
chk "گویش گزارش می‌شود" "$(echo "$ST" | P "d.get('dialectLabel')")" "سرحدی"
# سخت‌گیرانه: عبارتی که داده ندارد در مدل به عبارت مشابهش نگاشت
# می‌شود — یعنی «برنج» می‌گویی و «بربری» اضافه می‌شود.
chk "با یک عبارت آماده نیست" "$(echo "$ST" | P "d.get('canTrain')")" "False"
chk "کمبودها فهرست می‌شوند" "$(echo "$ST" | P "len(d.get('gaps',[]))>0")" "True"
chk "دلیل کمبود گفته می‌شود" \
  "$(echo "$ST" | P "any('ضبط' in g['reason'] for g in d['gaps'])")" "True"

echo '--- 22) وضعیت هر گویش جداست ---'
chk "مکرانی هیچ عبارت کاملی ندارد" \
  "$(curl -s "$A/voice/status?lang=$L&dialect=MAKRANI" -H "$AU" | P "d.get('ready')")" "0"

echo '--- 23) بدون توکن ---'
chk "بدون توکن ۴۰۱" "$(curl -s "$A/voice/status" | P "d.get('statusCode')")" "401"

psql "DELETE FROM \"VoiceSample\" WHERE \"speakerTag\" LIKE 'VT-%';
      DELETE FROM \"VoicePhrase\" WHERE lang = 'voicetst';
      DELETE FROM \"Product\" WHERE sku LIKE 'VOICE-TEST-%';"

echo
echo "PASS: $pass  FAIL: $fail"
[ $fail -eq 0 ]
