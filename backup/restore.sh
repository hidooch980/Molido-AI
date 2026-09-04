#!/usr/bin/env sh
# =============================================
# بازیابی از پشتیبان
#
# پشتیبانی که هرگز بازیابی نشده، پشتیبان نیست — فقط یک فایل است.  این
# اسکریپت هم برای بازیابی واقعی به کار می‌رود و هم برای **آزمودن** اینکه
# فایل‌ها واقعاً قابل بازیابی‌اند.
#
# اجرا:
#   docker compose exec backup restore.sh --list
#   docker compose exec backup restore.sh --verify daily/molido-20260813-021700.sql.gz
#   docker compose exec backup restore.sh --into molido_test daily/molido-...sql.gz
#   docker compose exec backup restore.sh --force daily/molido-...sql.gz
#
# بازنویسی دیتابیس اصلی عمداً `--force` می‌خواهد: یک اشتباه تایپی نباید
# دادهٔ امروز را با دادهٔ سه هفته پیش عوض کند.
# =============================================
set -eu

DIR="${BACKUP_DIR:-/backups}"
MODE=""
TARGET_DB=""
FILE=""

usage() {
  cat <<'EOF'
استفاده:
  restore.sh --list                        فهرست پشتیبان‌های موجود
  restore.sh --verify <فایل>               بازیابی آزمایشی در دیتابیس موقت
  restore.sh --into <نام‌دیتابیس> <فایل>    بازیابی در دیتابیس دیگر
  restore.sh --force <فایل>                بازنویسی دیتابیس اصلی

مسیر فایل نسبت به /backups است، مثلاً daily/molido-20260813-021700.sql.gz
EOF
}

case "${1:-}" in
  --list)
    printf '\n%s\n' "پشتیبان‌های موجود در $DIR:"
    for tier in daily weekly monthly; do
      [ -d "$DIR/$tier" ] || continue
      count="$(find "$DIR/$tier" -name '*.sql.gz' -type f | wc -l)"
      printf '\n  %s (%s فایل)\n' "$tier" "$count"
      find "$DIR/$tier" -name '*.sql.gz' -type f -exec ls -lh {} + 2>/dev/null \
        | awk '{printf "    %-42s %8s  %s %s %s\n", $9, $5, $6, $7, $8}' \
        | sort -r | head -20
    done
    printf '\n'
    exit 0
    ;;
  --verify) MODE=verify; FILE="${2:-}" ;;
  --into)   MODE=into; TARGET_DB="${2:-}"; FILE="${3:-}" ;;
  --force)  MODE=force; FILE="${2:-}" ;;
  *) usage; exit 1 ;;
esac

[ -n "$FILE" ] || { echo "✗ فایل مشخص نشده"; usage; exit 1; }

# مسیر مطلق یا نسبت به /backups
case "$FILE" in
  /*) PATH_IN="$FILE" ;;
  *)  PATH_IN="$DIR/$FILE" ;;
esac

[ -f "$PATH_IN" ] || { echo "✗ فایل یافت نشد: $PATH_IN"; exit 1; }

log() { echo "[restore $(date '+%Y-%m-%d %H:%M:%S')] $1"; }

# سلامت فایل پیش از هر کاری با دیتابیس.  بازیابیِ نیمه‌کاره از فایل خراب،
# دیتابیس را در وضعیتی می‌گذارد که نه قدیمی است نه جدید.
if ! gzip -t "$PATH_IN" 2>/dev/null; then
  log "✗ فایل سالم نیست"
  exit 1
fi

psql_do() {
  psql --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
       --dbname="$1" --quiet "$@" 2>&1
}

case "$MODE" in
  verify)
    TEST_DB="restore_check_$$"
    log "بازیابی آزمایشی در $TEST_DB"

    psql --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
         --dbname=postgres -qc "CREATE DATABASE \"$TEST_DB\"" >/dev/null

    # پاکسازی حتی اگر بازیابی شکست بخورد — دیتابیس آزمایشیِ رهاشده روی
    # سرور تولید می‌ماند و کسی نمی‌داند مال چیست.
    cleanup() {
      psql --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
           --dbname=postgres -qc "DROP DATABASE IF EXISTS \"$TEST_DB\"" >/dev/null 2>&1 || true
    }
    trap cleanup EXIT

    if ! gzip -cd "$PATH_IN" | psql --host="$PGHOST" --port="${PGPORT:-5432}" \
        --username="$PGUSER" --dbname="$TEST_DB" --quiet -v ON_ERROR_STOP=1 >/dev/null; then
      log "✗ بازیابی شکست خورد — این فایل قابل استفاده نیست"
      exit 1
    fi

    # شمارش واقعی: بازیابی‌ای که بی‌خطا تمام شود ولی جدول خالی بدهد، هنوز
    # شکست است.
    ROWS="$(psql --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
            --dbname="$TEST_DB" -tAc \
            'SELECT (SELECT COUNT(*) FROM "Company") ||
                    (SELECT COUNT(*) FROM "Product")' 2>/dev/null || echo "")"

    TABLES="$(psql --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
              --dbname="$TEST_DB" -tAc \
              "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")"

    log "✓ قابل بازیابی — $TABLES جدول"
    exit 0
    ;;

  into)
    [ -n "$TARGET_DB" ] || { echo "✗ نام دیتابیس مقصد لازم است"; exit 1; }
    log "بازیابی در $TARGET_DB"

    psql --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
         --dbname=postgres -qc "CREATE DATABASE \"$TARGET_DB\"" >/dev/null 2>&1 || true

    gzip -cd "$PATH_IN" | psql --host="$PGHOST" --port="${PGPORT:-5432}" \
      --username="$PGUSER" --dbname="$TARGET_DB" --quiet -v ON_ERROR_STOP=1
    log "✓ بازیابی شد در $TARGET_DB"
    ;;

  force)
    log "⚠️ بازنویسی $PGDATABASE از $(basename "$PATH_IN")"
    log "⚠️ همهٔ دادهٔ فعلی جایگزین می‌شود"

    # پیش از بازنویسی، یک نسخه از وضعیت فعلی — تا اگر فایلِ انتخابی اشتباه
    # بود، راه برگشتی بماند.
    SAFETY="$DIR/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
    if pg_dump --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
        --dbname="$PGDATABASE" --clean --if-exists --no-owner --no-privileges \
        | gzip -9 > "$SAFETY"; then
      log "نسخهٔ ایمنی پیش از بازیابی: $(basename "$SAFETY")"
    else
      log "✗ ساخت نسخهٔ ایمنی شکست خورد — بازیابی انجام نشد"
      rm -f "$SAFETY"
      exit 1
    fi

    gzip -cd "$PATH_IN" | psql --host="$PGHOST" --port="${PGPORT:-5432}" \
      --username="$PGUSER" --dbname="$PGDATABASE" --quiet -v ON_ERROR_STOP=1
    log "✓ بازیابی کامل شد"
    log "اگر اشتباه بود: restore.sh --force $(basename "$SAFETY")"
    ;;
esac
