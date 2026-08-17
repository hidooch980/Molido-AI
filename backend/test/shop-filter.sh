#!/usr/bin/env bash
#
# صافیِ قیمت، مرتب‌سازی و سقفِ تعدادِ کاتالوگ فروشگاه.
#
# ⚠️ این مجموعه عمداً **بدون ورود** است.
#
#    کاتالوگ عمومی است — مشتری بی‌حساب باید ببیندش.  اگر روزی مسیر
#    پشت نگهبان برود، این مجموعه با ۴۰۱ می‌افتد و همان چیزی را
#    می‌گوید که باید: فروشگاه برای مهمان بسته شد.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند و خطای کاذب می‌سازد.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }

if [ -z "$(curl -s --max-time 10 "$A/shop/settings" | P "'ok' if isinstance(d,dict) else ''")" ]; then
  echo "  ✗ فروشگاه روی $A پاسخ نمی‌دهد"
  exit 1
fi

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }

# مسیرهای کاتالوگ عمومی‌اند — بدون توکن، مثل مشتری واقعی.
G() { curl -s "$A/shop/products?limit=200&$1" | P "$2"; }

# ----------------------------------------------------------- دادهٔ آزمون
#
# ⚠️ کالای دانه عمداً کافی نیست: دو کالای آنلاین صافی را نمی‌سنجد،
#    چون هر مرزی که بگذاری یا هر دو را می‌گیرد یا هیچ‌کدام را.  چهار
#    کالا با قیمت‌های شناخته‌شده اضافه می‌کنیم تا مرزها معنی بدهند.
CO=$(Q "SELECT id FROM \"Company\" LIMIT 1;")
Q "DELETE FROM \"Product\" WHERE sku LIKE 'FLT-%';" >/dev/null
for pair in "FLT-A 100000" "FLT-B 300000" "FLT-C 600000" "FLT-D 900000"; do
  set -- $pair
  # `unit` NOT NULL است و پیش‌فرض ندارد — بدونش درج بی‌صدا می‌افتد و
  # مجموعه با پنج شکستِ گمراه‌کننده گزارش می‌دهد، نه با یک خطای درج.
  Q "INSERT INTO \"Product\" (id, \"companyId\", name, sku, unit,
                              \"salePrice\", \"purchasePrice\", \"isOnline\")
     VALUES (gen_random_uuid()::text, '$CO', '$1', '$1', 'ea', $2, 1, true);" >/dev/null
done

BASE=$(G "" "len(d)")
echo "--- کالای آنلاین: $BASE ---"

echo '--- 1) صافی سقف ---'
# مرز شامل است: کالای دقیقاً ۳۰۰۰۰۰ باید در «تا ۳۰۰۰۰۰» بیاید.  اگر
# انحصاری بود، مشتری که «تا ۳۰۰ هزار» می‌زند کالای ۳۰۰ هزاری را
# نمی‌بیند — و این را خرابی می‌فهمد، نه دقت.
chk "سقف ۳۰۰۰۰۰ شامل خودش" "$(G "maxPrice=300000" "sum(1 for x in d if x['sku'].startswith('FLT'))")" "2"
chk "هیچ گران‌تر از سقف نیست" "$(G "maxPrice=300000" "sum(1 for x in d if float(x['price'])>300000)")" "0"

echo '--- 2) صافی کف ---'
chk "کف ۶۰۰۰۰۰ شامل خودش" "$(G "minPrice=600000" "sum(1 for x in d if x['sku'].startswith('FLT'))")" "2"
chk "هیچ ارزان‌تر از کف نیست" "$(G "minPrice=600000" "sum(1 for x in d if float(x['price'])<600000)")" "0"

echo '--- 3) بازه ---'
chk "بازه دو سر بسته" "$(G "minPrice=300000&maxPrice=600000" "sum(1 for x in d if x['sku'].startswith('FLT'))")" "2"
# بازهٔ وارونه باید خالی بدهد، نه همه‌چیز.  اگر شرط‌ها با OR جمع
# می‌شدند این سنجه می‌افتاد.
chk "بازهٔ وارونه خالی است" "$(G "minPrice=900000&maxPrice=100000" "len(d)")" "0"

echo '--- 4) مرتب‌سازی ---'
chk "ارزان‌ترین اول" "$(G "sort=price-asc" "'yes' if [float(x['price']) for x in d]==sorted(float(x['price']) for x in d) else 'no'")" "yes"
chk "گران‌ترین اول" "$(G "sort=price-desc" "'yes' if [float(x['price']) for x in d]==sorted((float(x['price']) for x in d),reverse=True) else 'no'")" "yes"

echo '--- 5) ورودی خراب فروشگاه را نمی‌شکند ---'
#
# ⚠️ این پنج سنجه از همه مهم‌ترند.
#
#    `ORDER BY` پارامتری نمی‌شود، پس مقدارش با فهرست سفید انتخاب
#    می‌شود.  اگر روزی کسی آن را به درون‌ریزی رشته برگرداند، سنجهٔ
#    «جدول هست» می‌افتد — و آن روز، پیش از رسیدن به مشتری.
chk "مرتب‌سازی ناشناس => پیش‌فرض" "$(G "sort=nonsense" "len(d)")" "$BASE"
chk "تزریق SQL بی‌اثر" "$(G "sort=%27%3B%20DROP%20TABLE%20%22Product%22%3B--" "len(d)")" "$BASE"
chk "جدول Product هنوز هست" "$(Q "SELECT count(*) FROM \"Product\" WHERE sku LIKE 'FLT-%';")" "4"
# `Number('')` صفر است — و سقفِ صفر یعنی فروشگاهِ خالی.  رشتهٔ خالی
# باید «بدون صافی» بماند نه «تا صفر ریال».
chk "سقف خالی => بدون صافی" "$(G "maxPrice=" "len(d)")" "$BASE"
chk "سقف نامعتبر => بدون صافی" "$(G "maxPrice=abc" "len(d)")" "$BASE"

echo '--- 6) سقف تعداد ---'
chk "limit بزرگ به ۲۰۰ می‌خورد" "$(G "" "'yes' if len(d)<=200 else 'no'")" "yes"
chk "limit کوچک رعایت می‌شود" "$(curl -s "$A/shop/products?limit=2" | P "len(d)")" "2"

echo '--- 7) صافی با دسته و جستجو جمع می‌شود ---'
# صافی‌ها باید AND شوند.  اگر OR بودند، «جستجوی FLT با سقف ۱۰۰۰۰۰»
# چهار کالا می‌داد نه یکی.
chk "جستجو + سقف" "$(G "search=FLT&maxPrice=100000" "len(d)")" "1"

Q "DELETE FROM \"Product\" WHERE sku LIKE 'FLT-%';" >/dev/null

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
