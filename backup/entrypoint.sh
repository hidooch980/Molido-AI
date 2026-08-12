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
} > "$ENV_FILE"

# رمز دیتابیس داخلش است؛ فقط root بخواند.
chmod 600 "$ENV_FILE"

echo "$CRON . $ENV_FILE; /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" \
  > /etc/crontabs/root

touch /var/log/backup.log

echo "[backup] زمان‌بندی: $CRON  —  نگهداری: ${BACKUP_KEEP_DAYS:-14} روز"

# یک پشتیبان در لحظهٔ راه‌اندازی: اگر تنظیمات غلط باشد همان اول معلوم
# می‌شود، نه شبِ اولِ نیازِ واقعی.
if /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1; then
  echo "[backup] ✓ پشتیبان اولیه ساخته شد"
else
  echo "[backup] ⚠️ پشتیبان اولیه شکست خورد — تنظیمات را بررسی کنید"
fi

crond -f -l 8 &
exec tail -f /var/log/backup.log
