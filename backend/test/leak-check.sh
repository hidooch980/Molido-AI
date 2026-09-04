#!/usr/bin/env bash
#
# نگهبانِ نشت: آیا این مجموعه پس از خودش چیزی جا می‌گذارد؟
#
# ⚠️ چرا لازم شد؟
#
#    امروز سه نشت پیدا شد و هر سه یک ریشه داشتند: پاک‌سازی یا نبود،
#    یا فقط در آغاز بود، یا با `trap` محافظت نمی‌شد.
#
#      • `offline-purchase` موجودی را برنمی‌گرداند
#      • `integration` هر اجرا یک واحد انبار و ۳۱۰۰۰۰ صندوق جابه‌جا می‌کرد
#      • `shop` دو مشتری‌اش را جا می‌گذاشت و `e2e-cycles` را می‌شکست
#
#    هیچ‌کدام باگِ کد نبودند، ولی هر سه ساعت‌ها وقت گرفتند — چون
#    قرمزِ دروغین از قرمزِ راست بدتر است: آدم را به بی‌اعتنایی به قرمز
#    عادت می‌دهد.
#
# ⚠️ چرا شمارش، و نه جست‌وجوی `trap` در متن؟
#
#    وجودِ `trap` چیزی را ثابت نمی‌کند: ممکن است ناقص باشد، یا جدولی
#    را از قلم بیندازد، یا خودش به‌خاطر نامِ غلطِ جدول rollback شود —
#    که دقیقاً دو بار امروز رخ داد و بی‌صدا رد شد.
#
#    شمارشِ پیش و پس، همان چیزی را می‌سنجد که اهمیت دارد.
#
# کاربرد:
#   bash backend/test/leak-check.sh <نام‌مجموعه> [نام‌مجموعه ...]
#   bash backend/test/leak-check.sh --all

cd "$(dirname "$0")/../.." || exit 1
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d ' \r\n'; }

# جدول‌هایی که آزمون‌ها معمولاً دستشان می‌زنند.  مقدار — نه فقط تعداد —
# برای موجودی و صندوق سنجیده می‌شود: حذفِ فاکتور بدونِ بازگرداندنِ
# موجودی، تعداد را درست نشان می‌دهد ولی انبار را خراب می‌گذارد.
snapshot() {
  cat <<SNAP
Sale=$(Q 'SELECT count(*) FROM "Sale";')
SaleItem=$(Q 'SELECT count(*) FROM "SaleItem";')
Purchase=$(Q 'SELECT count(*) FROM "Purchase";')
PurchaseItem=$(Q 'SELECT count(*) FROM "PurchaseItem";')
ProductReturn=$(Q 'SELECT count(*) FROM "ProductReturn";')
Customer=$(Q 'SELECT count(*) FROM "Customer";')
Product=$(Q 'SELECT count(*) FROM "Product";')
Supplier=$(Q 'SELECT count(*) FROM "Supplier";')
JournalEntry=$(Q 'SELECT count(*) FROM "JournalEntry";')
StockMovement=$(Q 'SELECT count(*) FROM "StockMovement";')
InventoryQty=$(Q 'SELECT COALESCE(SUM(quantity),0)::bigint FROM "Inventory";')
CashBoxBalance=$(Q 'SELECT COALESCE(SUM(balance),0)::bigint FROM "CashBox";')
SNAP
}

suites=("$@")
if [ "${1:-}" = "--all" ]; then
  suites=()
  for f in backend/test/*.sh; do
    n=$(basename "$f" .sh)
    # خودِ نگهبان و مجموعه‌هایی که عمداً وضعیت می‌سازند کنار می‌مانند.
    case "$n" in leak-check|restore|bundle|apidocs|untested) continue ;; esac
    suites+=("$n")
  done
fi

[ ${#suites[@]} -eq 0 ] && { echo "کاربرد: leak-check.sh <مجموعه> | --all"; exit 2; }

pass=0; fail=0
for suite in "${suites[@]}"; do
  file="backend/test/$suite.sh"
  [ -f "$file" ] || { printf '  ?    %-18s فایلی نیست\n' "$suite"; continue; }

  before=$(snapshot)
  bash "$file" >/dev/null 2>&1
  after=$(snapshot)

  if [ "$before" = "$after" ]; then
    pass=$((pass+1))
    printf '  OK   %-18s بدون نشت\n' "$suite"
  else
    fail=$((fail+1))
    printf '  FAIL %-18s نشت دارد:\n' "$suite"
    # فقط سطرهای تغییرکرده، با اندازهٔ نشت.
    while IFS= read -r line; do
      key=${line%%=*}; b=${line#*=}
      a=$(printf '%s\n' "$after" | grep "^$key=" | cut -d= -f2)
      [ "$a" = "$b" ] && continue
      printf '         %-16s %s → %s  (%+d)\n' "$key" "$b" "$a" "$((a - b))"
    done <<< "$before"
  fi
done

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
