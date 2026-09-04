#!/usr/bin/env sh
# زمان‌بند پشتیبان‌گیری.
#
# dcron آلپاین — برخلاف Vixie cron — خطوط `VAR=value` را در crontab نمی‌پذیرد
# و کل فایل را رد می‌کند.  پس متغیرها در یک فایل env نوشته و در خودِ دستور
# source می‌شوند.
set -eu

CRON="${BACKUP_CRON:-17 2 * * *}"
ENV_FILE=/etc/backup.env

{
  echo "export PGHOST='${PGHOST:-postgres}'"
  echo "export PGPORT='${PGPORT:-5432}'"
  echo "export PGUSER='${PGUSER:-postgres}'"
  echo "export PGPASSWORD='${PGPASSWORD:-}'"
  echo "export PGDATABASE='${PGDATABASE:-molido_ai}'"
  echo "export BACKUP_DIR='${BACKUP_DIR:-/backups}'"
  echo "export BACKUP_KEEP_DAYS='${BACKUP_KEEP_DAYS:-14}'"
  echo "export BACKUP_KEEP_WEEKS='${BACKUP_KEEP_WEEKS:-8}'"
  echo "export BACKUP_KEEP_MONTHS='${BACKUP_KEEP_MONTHS:-12}'"
} > "$ENV_FILE"

# رمز دیتابیس داخلش است؛ فقط root بخواند.
chmod 600 "$ENV_FILE"

echo "$CRON . $ENV_FILE; /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" \
  > /etc/crontabs/root

touch /var/log/backup.log

echo "[backup] زمان‌بندی: $CRON"
echo "[backup] نگهداشت: ${BACKUP_KEEP_DAYS:-14} روزانه، ${BACKUP_KEEP_WEEKS:-8} هفتگی، ${BACKUP_KEEP_MONTHS:-12} ماهانه"

# انتظار تا پستگرس واقعاً روی TCP پاسخ بدهد.
#
# `depends_on: service_healthy` کافی نیست: هنگام راه‌اندازی اولیه،
# پستگرس یک نمونهٔ موقت بالا می‌آورد که فقط روی سوکت یونیکس گوش می‌دهد.
# `pg_isready` داخل همان کانتینر موفق می‌شود و داکر «سالم» اعلام می‌کند،
# ولی اتصال TCP از بیرون هنوز رد می‌شود.
#
# نتیجهٔ نبودِ این انتظار روی سرور واقعی دیده شد: پشتیبان اولیه با
# «Connection refused» شکست خورد و نصب تا فردا ساعت ۲:۱۷ بی‌پشتیبان
# ماند — بی‌آنکه کسی متوجه شود.
. "$ENV_FILE"
i=0
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[backup] ⚠️ پستگرس پس از ۲ دقیقه پاسخ نداد — پشتیبان اولیه رد شد"
    break
  fi
  sleep 2
done

# یک پشتیبان در لحظهٔ راه‌اندازی: اگر تنظیمات غلط باشد همان اول معلوم
# می‌شود، نه شبِ اولِ نیازِ واقعی.
if /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1; then
  echo "[backup] ✓ پشتیبان اولیه ساخته شد"
else
  echo "[backup] ⚠️ پشتیبان اولیه شکست خورد — تنظیمات را بررسی کنید"
fi

crond -f -l 8 &
exec tail -f /var/log/backup.log
