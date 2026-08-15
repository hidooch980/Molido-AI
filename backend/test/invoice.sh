#!/usr/bin/env bash
#
# فاکتور فروش پشتیبان: رفرنس، مهلت تسویه، اضافات و کسورات، شرح ردیف.
#
# چیزی که اینجا واقعاً آزموده می‌شود این است که **مبلغ نهایی درست حساب
# شود**.  اضافات و کسورات تازه‌اند و اگر جای جمع و تفریقشان عوض شود،
# فاکتور بی‌سروصدا غلط می‌شود — نه خطا می‌دهد نه به چشم می‌آید، فقط
# آخر ماه تراز نمی‌خورد.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

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

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql()  { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

WH=$(curl -s $A/warehouses -H "$AU" | P "d[0]['id'] if isinstance(d,list) else d['data'][0]['id']")

# کالای آزمون با قیمت گرد، تا حساب دستی ساده بماند
SKU="INV-TEST-$$"
PROD=$(curl -s -X POST $A/products -H "$AU" -H "$JS" \
  -d "{\"name\":\"Invoice Test Item\",\"sku\":\"$SKU\",\"unit\":\"pcs\",\"salePrice\":1000000,\"purchasePrice\":600000}" \
  | P "d.get('id','')")

# کالای تازه موجودی ندارد و هر فروشی با «موجودی کافی نیست» رد می‌شود.
# اینجا موضوع آزمون مبلغ فاکتور است نه کنترل موجودی، پس موجودی مستقیم
# نشانده می‌شود — همان کاری که آزمون صندوق هم می‌کند.
psql "UPDATE \"Product\" SET \"trackInventory\" = false WHERE id = '$PROD';"

echo '--- 1) فاکتور ساده ---'
BASE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":2}]
}")
chk "فاکتور ساخته شد"  "$(echo "$BASE" | P "'yes' if d.get('id') else 'no'")" "yes"
chk "جمع اقلام"        "$(echo "$BASE" | P "int(float(d['subtotal']))")" "2000000"
chk "مبلغ نهایی"       "$(echo "$BASE" | P "int(float(d['total']))")" "2000000"

echo '--- 2) اضافات به مبلغ اضافه می‌شود ---'
ADD=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"additions\":150000,
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}")
chk "اضافات ثبت شد"   "$(echo "$ADD" | P "int(float(d['additions']))")" "150000"
chk "مبلغ با اضافات"  "$(echo "$ADD" | P "int(float(d['total']))")" "1150000"

echo '--- 3) کسورات از مبلغ کم می‌شود ---'
DED=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"deductions\":50000,
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}")
chk "کسورات ثبت شد"   "$(echo "$DED" | P "int(float(d['deductions']))")" "50000"
chk "مبلغ با کسورات"  "$(echo "$DED" | P "int(float(d['total']))")" "950000"

echo '--- 4) اضافات و کسورات با هم، در کنار مالیات ---'
# ۱۰۰۰۰۰۰ − تخفیف ۱۰۰۰۰۰ = ۹۰۰۰۰۰
#
# مالیات روی مبلغِ **پس از** تخفیف بسته می‌شود، پس ۹۰۰۰۰ به نسبت ۰٫۹
# مقیاس می‌شود → ۸۱۰۰۰.  مالیات روی مبلغی که مشتری نپرداخته بسته
# نمی‌شود، و صورتحساب مؤدیان هم همین را می‌خواهد.
#
# ۹۰۰۰۰۰ + ۸۱۰۰۰ + اضافات ۲۰۰۰۰۰ − کسورات ۵۰۰۰۰ = ۱٬۱۳۱٬۰۰۰
#
# سقف تخفیف باید باز باشد: تخفیف سطح فاکتور حالا همان سقفی را دارد که
# تخفیف قلمی — و سقف پیش‌فرض شرکت صفر است.
psql "UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 20;"
BOTH=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"discount\":100000, \"tax\":90000,
  \"additions\":200000, \"deductions\":50000,
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}")
chk "ترتیب جمع و تفریق درست است" "$(echo "$BOTH" | P "int(float(d['total']))")" "1131000"

psql "UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 0;"

echo '--- 5) کسوراتِ بزرگ‌تر از مبلغ رد می‌شود ---'
# اگر رد نشود، فاکتور با مبلغ منفی ثبت می‌شود و تراز حسابداری می‌شکند.
chk "مبلغ منفی رد می‌شود" "$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\", \"deductions\":9000000,
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}" | P "d.get('statusCode')")" "400"

echo '--- 6) اضافات منفی رد می‌شود ---'
chk "اضافات منفی رد می‌شود" "$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\", \"additions\":-500,
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}" | P "d.get('statusCode')")" "400"

echo '--- 7) رفرنس و مهلت تسویه ---'
REF=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"reference\":\"PO-4402\",
  \"dueDate\":\"2027-03-20\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}")
REF_ID=$(echo "$REF" | P "d.get('id','')")
chk "رفرنس ثبت شد"      "$(echo "$REF" | P "d.get('reference')")" "PO-4402"
chk "مهلت تسویه ثبت شد" "$(psqlv "SELECT \"dueDate\" FROM \"Sale\" WHERE id='$REF_ID'")" "2027-03-20"

echo '--- 8) مهلت تسویهٔ بدشکل رد می‌شود ---'
# «۱۴۰۶/۰۱/۰۱» یا «فردا» نباید تا دیتابیس برود؛ آنجا خطای نوع می‌دهد
# و کاربر پیام مبهم postgres می‌بیند نه پیام فارسی فرم.
chk "تاریخ بدشکل رد می‌شود" "$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\", \"dueDate\":\"1406/01/01\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}" | P "d.get('statusCode')")" "400"

echo '--- 9) رفرنس خالی به NULL تبدیل می‌شود ---'
# رشتهٔ خالی در ایندکس جزئی می‌نشیند و جست‌وجوی رفرنس را کثیف می‌کند.
EMPTY=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\", \"reference\":\"   \",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}" | P "d.get('id','')")
chk "رفرنس فقط‌فاصله NULL شد" "$(psqlv "SELECT COALESCE(reference,'NULL') FROM \"Sale\" WHERE id='$EMPTY'")" "NULL"

echo '--- 10) شرح ردیف ---'
NOTE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1,\"note\":\"damaged corner\"}]
}" | P "d.get('id','')")
chk "شرح ردیف ذخیره شد" \
  "$(psqlv "SELECT note FROM \"SaleItem\" WHERE \"saleId\"='$NOTE'")" "damaged corner"

echo '--- 11) شرح ردیف بلند رد می‌شود ---'
LONG=$(python3 -c "print('x'*250)")
chk "شرح بیش از ۲۰۰ نویسه رد می‌شود" "$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1,\"note\":\"$LONG\"}]
}" | P "d.get('statusCode')")" "400"

echo '--- 12) قیمت همچنان از سرور می‌آید ---'
# فرم فاکتور بهای واحد را قابل ویرایش نشان می‌دهد، ولی آن فقط برای
# نمایش است.  اگر سرور قیمت فرستاده‌شده را بپذیرد، هر کسی با ابزار
# توسعه‌دهندهٔ مرورگر می‌تواند کالای یک میلیونی را ۱ ریال بخرد.
CHEAT=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1,\"price\":1}]
}")
chk "قیمت کلاینت نادیده گرفته می‌شود" "$(echo "$CHEAT" | P "int(float(d['total']))")" "1000000"

echo '--- 13) پیش‌فرض‌ها صفرند نه NULL ---'
# اگر NULL باشند، جمع در گزارش‌ها NULL می‌شود و کل ستون خالی می‌ماند.
BASE_ID=$(echo "$BASE" | P "d.get('id','')")
chk "اضافات پیش‌فرض صفر"  "$(psqlv "SELECT additions::int FROM \"Sale\" WHERE id='$BASE_ID'")" "0"
chk "کسورات پیش‌فرض صفر"  "$(psqlv "SELECT deductions::int FROM \"Sale\" WHERE id='$BASE_ID'")" "0"

echo '--- 14) فاکتور در فهرست دیده می‌شود ---'
chk "فاکتور رفرنس‌دار در فهرست هست" \
  "$(curl -s "$A/sales?limit=200" -H "$AU" | P "'yes' if any(s['id']=='$REF_ID' for s in d['data']) else 'no'")" "yes"

echo '--- 14b) سقف تخفیف روی سطح فاکتور هم اعمال می‌شود ---'
# بدون این، سقف تخفیف قلمی بی‌معنا بود: صندوق‌داری که نمی‌توانست روی یک
# قلم تخفیف بدهد، همان مبلغ را در `discount` سطح فاکتور می‌فرستد و کل
# فاکتور را رایگان می‌کند.
psql "UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 10;"
chk "تخفیف بیش از سقف رد می‌شود" "$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\", \"discount\":900000,
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}" | P "d.get('statusCode')")" "400"

chk "تخفیف داخل سقف پذیرفته می‌شود" "$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\", \"discount\":100000,
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]
}" | P "int(float(d['total']))")" "900000"

echo '--- 14c) نسیه پرداخت حساب نمی‌شود ---'
# نسیه تعهد است نه پرداخت.  اگر «تسویه‌شده» ثبت شود، از گزارش مطالبات
# بیرون می‌ماند — طلبی که هیچ‌کس دنبالش نمی‌رود.
CREDIT_SALE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}],
  \"payments\":[{\"method\":\"CREDIT\",\"amount\":1000000}]
}")
chk "فاکتور نسیه PAID نمی‌شود" "$(echo "$CREDIT_SALE" | P "d.get('status')")" "PENDING"

psql "UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 0;"

echo '--- 15) سند حسابداری اضافات و کسورات ---'
# مهم‌ترین آزمون این فایل.  اولین نسخهٔ اضافات، سند نامتوازن می‌ساخت
# چون فقط سمت بدهکار را بالا می‌برد؛ دفتر خودش جلویش را گرفت.  این
# آزمون هست تا اگر کسی بعداً حساب را عوض کرد، همان‌جا معلوم شود.
ADD_ID=$(echo "$ADD" | P "d.get('id','')")
chk "اضافات به درآمد حمل (۴۱۰۶) بستانکار شد" \
  "$(psqlv "SELECT COALESCE(SUM(l.credit),0)::bigint
            FROM \"JournalLine\" l
            JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
            JOIN \"Account\" a ON a.id = l.\"accountId\"
            WHERE e.\"sourceType\"='Sale' AND e.\"sourceId\"='$ADD_ID'
              AND a.code='4106'")" "150000"

DED_ID=$(echo "$DED" | P "d.get('id','')")
chk "کسورات به هزینهٔ متفرقه (۵۲۹۹) بدهکار شد" \
  "$(psqlv "SELECT COALESCE(SUM(l.debit),0)::bigint
            FROM \"JournalLine\" l
            JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
            JOIN \"Account\" a ON a.id = l.\"accountId\"
            WHERE e.\"sourceType\"='Sale' AND e.\"sourceId\"='$DED_ID'
              AND a.code='5299'")" "50000"

chk "کسورات در حساب تخفیف فروش (۴۱۰۲) ننشسته" \
  "$(psqlv "SELECT COALESCE(SUM(l.debit),0)::bigint
            FROM \"JournalLine\" l
            JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
            JOIN \"Account\" a ON a.id = l.\"accountId\"
            WHERE e.\"sourceType\"='Sale' AND e.\"sourceId\"='$DED_ID'
              AND a.code='4102'")" "0"

echo '--- 16) تراز کل دفتر ---'
chk "تراز صفر است" \
  "$(psqlv "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint
            FROM \"JournalLine\" l
            JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
            WHERE e.status <> 'DRAFT'")" "0"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
