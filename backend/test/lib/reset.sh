#!/usr/bin/env bash
#
# پاک‌سازیِ مشترک برای مجموعه‌هایی که فاکتور می‌سازند.
#
# ⚠️ چرا مشترک، و نه در هر مجموعه جدا؟
#
#    نگهبانِ نشت (`leak-check.sh`) روی ۱۲ مجموعه پنج نشت پیدا کرد و
#    هر پنج، یک شکل داشتند: فاکتور و سند و حرکتِ انبار ساخته می‌شد و
#    کسی برشان نمی‌گرداند.
#
#    نوشتنِ پاک‌سازیِ دستی برای هرکدام یعنی پنج جای متفاوت که باید
#    هم‌زمان درست بمانند — و تجربهٔ امروز نشان داد همیشه یکی از قلم
#    می‌افتد: یک بار حرکتِ انبار، یک بار سندِ معکوس، یک بار مشتریِ
#    مهمان.
#
# ⚠️ قاعده: «آنچه پس از مهرِ زمانی ساخته شد، برود.»
#
#    به یادداشت و نامِ کالا وابسته نیست.  مسیرِ تازه‌ای هم که فردا به
#    آزمون اضافه شود خودبه‌خود پوشش می‌گیرد — برخلافِ الگوهای نام‌محور
#    که هر بار باید دستی به‌روز شوند.
#
# کاربرد:
#   . "$(dirname "$0")/lib/reset.sh"
#   reset_begin            # پیش از نخستین نوشتن
#   trap reset_finish EXIT

# `$C` و `Q` باید پیش از فراخوانی تعریف شده باشند (همهٔ مجموعه‌ها دارند).

_RESET_T0=''
_RESET_SNAP=''

reset_begin() {
  _RESET_T0=$($C exec -T postgres psql -U postgres -d molido_ai -tAq \
    -c "SELECT now();" 2>/dev/null | tr -d '\r')

  # ⚠️ موجودی و صندوق **بازگردانده** می‌شوند، نه حذف.
  #
  #    حذفِ فاکتور مقدارِ انبار را برنمی‌گرداند: کالا رفته و رکوردش
  #    مانده.  همین یک بار شش سنجهٔ `e2e-cycles` را قرمز کرد.
  _RESET_SNAP=$(mktemp 2>/dev/null || echo "/tmp/reset-snap-$$")
  $C exec -T postgres psql -U postgres -d molido_ai -tAq -c \
    "SELECT 'UPDATE \"Inventory\" SET quantity='||quantity||',\"avgCost\"='||
            COALESCE(\"avgCost\"::text,'NULL')||' WHERE id='''||id||''';'
       FROM \"Inventory\"
      UNION ALL
     SELECT 'UPDATE \"CashBox\" SET balance='||balance||' WHERE id='''||id||''';'
       FROM \"CashBox\";" 2>/dev/null | tr -d '\r' > "$_RESET_SNAP"
}

reset_finish() {
  [ -z "$_RESET_T0" ] && return 0

  # ترتیب: فرزندها پیش از والدها، و اسناد پیش از فاکتورها — وگرنه
  # زیرپرس‌وجوی شناسایی خالی برمی‌گردد.
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
      (SELECT id FROM \"JournalEntry\" WHERE \"createdAt\" > '$_RESET_T0');
    DELETE FROM \"JournalEntry\" WHERE \"createdAt\" > '$_RESET_T0';
    DELETE FROM \"StockMovement\" WHERE \"createdAt\" > '$_RESET_T0';
    DELETE FROM \"Payment\" WHERE \"createdAt\" > '$_RESET_T0';
    DELETE FROM \"ProductReturnItem\" WHERE \"returnId\" IN
      (SELECT id FROM \"ProductReturn\" WHERE \"createdAt\" > '$_RESET_T0');
    DELETE FROM \"ProductReturn\" WHERE \"createdAt\" > '$_RESET_T0';
    DELETE FROM \"SaleItem\" WHERE \"saleId\" IN
      (SELECT id FROM \"Sale\" WHERE \"createdAt\" > '$_RESET_T0');
    DELETE FROM \"Sale\" WHERE \"createdAt\" > '$_RESET_T0';
    DELETE FROM \"PurchaseItem\" WHERE \"purchaseId\" IN
      (SELECT id FROM \"Purchase\" WHERE \"createdAt\" > '$_RESET_T0');
    DELETE FROM \"Purchase\" WHERE \"createdAt\" > '$_RESET_T0';
    -- ⚠️ کالا فقط وقتی حذف می‌شود که **هیچ ارجاعی** به آن نمانده
    --    باشد.  کالای ساخته‌شدهٔ آزمون بی‌ارجاع می‌شود چون سطرهایش
    --    بالاتر رفته‌اند؛ ولی اگر مسیری ارجاعی جا گذاشته باشد، کالا
    --    می‌ماند و حذفِ کورکورانه خطای کلید خارجی نمی‌دهد.
    DELETE FROM \"Inventory\" WHERE \"productId\" IN
      (SELECT id FROM \"Product\" WHERE \"createdAt\" > '$_RESET_T0')
      AND quantity = 0;
    DELETE FROM \"Product\" p WHERE p.\"createdAt\" > '$_RESET_T0'
      AND NOT EXISTS (SELECT 1 FROM \"SaleItem\" x WHERE x.\"productId\"=p.id)
      AND NOT EXISTS (SELECT 1 FROM \"PurchaseItem\" x WHERE x.\"productId\"=p.id)
      AND NOT EXISTS (SELECT 1 FROM \"Inventory\" x WHERE x.\"productId\"=p.id)
      AND NOT EXISTS (SELECT 1 FROM \"StockMovement\" x WHERE x.\"productId\"=p.id);
  " >/dev/null 2>&1

  # ⚠️ مشتری و تأمین‌کننده عمداً دست‌نخورده می‌مانند.
  #
  #    بعضی مجموعه‌ها عمداً مشتریِ ماندگار می‌سازند و بعضی شماره‌های
  #    ثابت دارند؛ حذفِ خودکارشان از این‌جا، همان تداخلی را می‌سازد که
  #    بینِ `shop` و `e2e-cycles` رخ داد.  هر مجموعه خودش پاکشان کند.

  # بازگرداندنِ موجودی و صندوق به مقدارِ آغاز.
  if [ -s "$_RESET_SNAP" ]; then
    $C exec -T postgres psql -U postgres -d molido_ai -q < "$_RESET_SNAP" \
      >/dev/null 2>&1
  fi
  rm -f "$_RESET_SNAP"
}
