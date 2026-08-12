#!/usr/bin/env sh
# =============================================
# پشتیبان‌گیری خودکار از دیتابیس
#
# داخل کانتینر `backup` اجرا می‌شود و طبق زمان‌بندی BACKUP_CRON کار می‌کند.
# فایل‌ها در حجم داکری `backup_data` می‌مانند تا با حذف کانتینر از بین نروند.
#
# سه اصلی که رعایت شده‌اند:
#   ۱. نوشتن در فایل موقت و تغییر نام در پایان — پشتیبانِ نیمه‌نوشته هرگز
#      نامِ نهایی نمی‌گیرد، پس بازیابی از فایل ناقص ممکن نیست.
#   ۲. تأیید سلامت با gzip -t پیش از پذیرفتن فایل.
#   ۳. حذف نسخه‌های قدیمی فقط پس از موفقیت نسخهٔ تازه.
# =============================================
set -eu

DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$DIR/.partial-$STAMP.sql.gz"
OUT="$DIR/molido-$STAMP.sql.gz"

mkdir -p "$DIR"

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $1"; }

log "شروع پشتیبان‌گیری از $PGDATABASE"

# --clean --if-exists تا فایل روی دیتابیسِ موجود هم قابل بازیابی باشد.
if ! pg_dump \
      --host="$PGHOST" --port="${PGPORT:-5432}" \
      --username="$PGUSER" --dbname="$PGDATABASE" \
      --clean --if-exists --no-owner --no-privileges \
    | gzip -9 > "$TMP"; then
  log "✗ pg_dump شکست خورد"
  rm -f "$TMP"
  exit 1
fi

# فایل خراب بدتر از نبودِ فایل است: تا وقتی صحتش تأیید نشود نام نهایی نمی‌گیرد.
if ! gzip -t "$TMP" 2>/dev/null; then
  log "✗ فایل پشتیبان سالم نیست — دور انداخته شد"
  rm -f "$TMP"
  exit 1
fi

SIZE="$(wc -c < "$TMP")"
if [ "$SIZE" -lt 1024 ]; then
  log "✗ پشتیبان مشکوک به خالی بودن ($SIZE بایت) — دور انداخته شد"
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"
log "✓ ساخته شد: $(basename "$OUT") — $((SIZE / 1024)) کیلوبایت"

# پاکسازی فقط پس از موفقیت؛ وگرنه یک شبِ خراب می‌تواند همهٔ نسخه‌های سالم
# را هم ببرد.
DELETED="$(find "$DIR" -name 'molido-*.sql.gz' -type f -mtime "+$KEEP" -print -delete | wc -l)"
[ "$DELETED" -gt 0 ] && log "$DELETED نسخهٔ قدیمی‌تر از $KEEP روز حذف شد"

# فایل‌های نیمه‌کارهٔ جامانده از اجراهای شکست‌خوردهٔ قبلی
find "$DIR" -name '.partial-*' -type f -mmin +120 -delete 2>/dev/null || true

log "پایان — مجموع نسخه‌ها: $(find "$DIR" -name 'molido-*.sql.gz' | wc -l)"
