#!/usr/bin/env bash
#
# دادهٔ نمونه برای تست‌درایو.
#
#   bash ops/demo-data.sh              # روی نصبِ محلی
#   bash ops/demo-data.sh mlz          # روی سرور
#   bash ops/demo-data.sh mlz resto    # روی محصولِ رستوران
#
# ⚠️ **روی نصبِ مشتری اجرا نکنید.**
#
#    ردیف‌هایی با شناسهٔ `demo-*` می‌سازد که ظاهرشان مثل دادهٔ واقعی
#    است: تأمین‌کننده، مشتری، امانی، تنخواه، یادآوری.  شش ماه بعد
#    هیچ‌کس نمی‌داند کدام نمونه بود و کدام نبود.
#
#    برای همین اسکریپت **می‌پرسد** و پیش‌فرضش «نه» است.
#
# ⚠️ هیچ سندِ حسابداری نمی‌زند.  همه‌اش تعریف است، نه تراکنش — تا دفتر
#    کل، که اظهارِ مالیاتی از آن درمی‌آید، دست‌نخورده بماند.

set -u

HOST="${1:-}"
PRODUCT="${2:-store}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"

cd "$(dirname "$0")/.." || exit 1

case "$PRODUCT" in
  store) CF="-f docker-compose.yml -f docker-compose.store.yml" ;;
  resto) CF="-p molido-resto -f docker-compose.yml -f docker-compose.resto.yml" ;;
  *) echo "  x محصولِ ناشناس: $PRODUCT (store یا resto)"; exit 1 ;;
esac

if [ -n "$HOST" ]; then
  CF="$CF -f docker-compose.vps.yml"
  TARGET="سرورِ $HOST / $PRODUCT"
else
  TARGET="نصبِ محلی / $PRODUCT"
fi

printf '\n  دادهٔ نمونه روی: %s\n\n' "$TARGET"
printf '  این کار ردیف‌هایی می‌سازد که مثل دادهٔ واقعی به نظر می‌رسند.\n'
printf '  روی نصبی که به مشتری تحویل داده‌اید اجرایش نکنید.\n\n'
printf '  ادامه؟ [y/N] '
read -r answer
case "$answer" in
  y|Y|yes) ;;
  *) echo "  لغو شد."; exit 0 ;;
esac

# ⚠️ از `dist` اجرا می‌شود، نه با `tsx`.
#
#    ایمیجِ تولید `devDependencies` را prune کرده و `tsx` ندارد؛
#    `npm run demo` آن‌جا با «command not found» می‌شکند.
RUN='node dist/database/demo.js'

if [ -n "$HOST" ]; then
  ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF exec -T backend $RUN"
else
  docker compose $CF exec -T backend $RUN
fi

status=$?
[ "$status" -eq 0 ] || { echo "  x ساختِ دادهٔ نمونه شکست خورد"; exit "$status"; }
