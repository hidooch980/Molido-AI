# postgres:16-alpine چون pg_dump باید دقیقاً هم‌نسخهٔ سرور باشد؛ نسخهٔ
# قدیمی‌تر با خطای «server version mismatch» شکست می‌خورد.
FROM postgres:16-alpine

RUN apk add --no-cache dcron tzdata

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
