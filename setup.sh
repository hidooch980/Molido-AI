#!/usr/bin/env bash
# =============================================
# Molido AI — راه‌اندازی یک‌مرحله‌ای (لینوکس / مک)
#
#   ./setup.sh
#
# نشانی سرور در شبکهٔ محلی را خودکار پیدا می‌کند، رمزهای تصادفی می‌سازد،
# فایل .env را می‌نویسد و همه‌چیز را بالا می‌آورد.
# اجرای دوباره امن است: مقادیر موجود در .env دست‌نخورده می‌مانند.
# =============================================

set -euo pipefail
cd "$(dirname "$0")"

secret() { openssl rand -hex 32; }

lan_address() {
  # نشانی‌ای که برای رسیدن به اینترنت انتخاب می‌شود، همان نشانی قابل دسترس از
  # دیگر دستگاه‌های شبکه است — بدون آنکه بسته‌ای فرستاده شود.
  local ip=''

  if command -v ip >/dev/null 2>&1; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
  fi

  if [ -z "$ip" ] && command -v ipconfig >/dev/null 2>&1; then
    ip=$(ipconfig getifaddr en0 2>/dev/null || true)
  fi

  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi

  printf '%s' "${ip:-localhost}"
}

# پورتی که کسی اشغالش نکرده باشد؛ اگر پورت پیش‌فرض گرفته باشد، بعدی امتحان
# می‌شود.  بدون این، راه‌اندازی روی دستگاهی که سرویس دیگری دارد شکست می‌خورد.
free_port() {
  local port="$1"
  local limit=$((port + 20))

  while [ "$port" -lt "$limit" ]; do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      printf '%s' "$port"
      return
    fi
    exec 3<&- 2>/dev/null || true
    port=$((port + 1))
  done

  printf '%s' "$1"
}

printf '\n  Molido AI — راه‌اندازی\n'
printf '  ─────────────────────\n\n'

# ---------- بررسی پیش‌نیاز ----------

if ! docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  printf '  ✗ Docker در دسترس نیست. سرویس Docker را اجرا کنید.\n'
  exit 1
fi

# ---------- خواندن .env موجود ----------

declare -A settings=()
order=()

remember() {
  if [ -z "${settings[$1]+x}" ]; then order+=("$1"); fi
  settings[$1]="$2"
}

set_if_missing() {
  if [ -z "${settings[$1]+x}" ] || [ -z "${settings[$1]}" ]; then remember "$1" "$2"; fi
}

if [ -f .env ]; then
  printf '  فایل .env موجود است — مقادیر تنظیم‌شده حفظ می‌شوند.\n'
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*([A-Z0-9_]+)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      remember "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    fi
  done < .env
fi

# ---------- انتخاب محصول ----------

product="${settings[MOLIDO_PRODUCT]:-}"

if [ -z "$product" ]; then
  printf '  کدام محصول نصب شود؟
'
  printf '    1) فروشگاه و سوپرمارکت
'
  printf '    2) کافه‌رستوران
'
  printf '    3) نسخهٔ کامل (همهٔ ماژول‌ها، شامل شهرداری)
'
  printf '  شماره را وارد کنید [3]: '
  read -r choice || choice=''

  case "${choice:-3}" in
    1) product='store' ;;
    2) product='resto' ;;
    *) product='suite' ;;
  esac
else
  printf '  محصول (از .env): %s
' "$product"
fi

remember MOLIDO_PRODUCT "$product"

# هر محصول پروژهٔ داکر و دیتابیس خودش را دارد، پس چند محصول می‌توانند روی یک
# دستگاه کنار هم اجرا شوند.
compose_files=(-f docker-compose.yml)
if [ "$product" != 'suite' ]; then
  compose_files+=(-f "docker-compose.${product}.yml")
fi

# ---------- تشخیص نشانی شبکه ----------

detected=$(lan_address)
current="${settings[HOST_IP]:-}"

if [ -n "$current" ] && [ "$current" != 'localhost' ]; then
  host_ip="$current"
  printf '  نشانی سرور (از .env): %s\n' "$host_ip"
else
  printf '  نشانی سرور در شبکه: %s\n' "$detected"
  printf '  اگر درست است Enter بزنید، وگرنه نشانی صحیح را وارد کنید: '
  read -r answer || answer=''
  host_ip="${answer:-$detected}"
fi

# ---------- مقادیر ----------

remember HOST_IP "$host_ip"

set_if_missing POSTGRES_USER     'postgres'
set_if_missing POSTGRES_PASSWORD "$(secret)"
set_if_missing POSTGRES_DB       'molido_ai'

set_if_missing JWT_SECRET             "$(secret)"
set_if_missing JWT_EXPIRES_IN         '7d'
set_if_missing JWT_REFRESH_SECRET     "$(secret)"
set_if_missing JWT_REFRESH_EXPIRES_IN '30d'

set_if_missing N8N_USER           'admin'
set_if_missing N8N_PASSWORD       "$(secret | cut -c1-16)"
set_if_missing N8N_WEBHOOK_SECRET "$(secret)"

set_if_missing AI_BASE_URL   'https://api.openai.com/v1'
set_if_missing AI_API_KEY    ''
set_if_missing AI_MODEL      'gpt-4o-mini'
set_if_missing AI_TIMEOUT_MS '20000'

set_if_missing SMS_API_KEY ''
set_if_missing SMS_SENDER  '10008663'

# پورت‌ها: اگر در .env تنظیم شده‌اند حفظ می‌شوند، وگرنه اولین پورت آزاد
set_if_missing BACKEND_PORT "$(free_port 3000)"
set_if_missing WEB_PORT     "$(free_port 3001)"
set_if_missing N8N_PORT     "$(free_port 5678)"

backend_port="${settings[BACKEND_PORT]}"
web_port="${settings[WEB_PORT]}"
n8n_port="${settings[N8N_PORT]}"

if [ "$backend_port" != '3000' ] || [ "$web_port" != '3001' ] || [ "$n8n_port" != '5678' ]; then
  printf '  برخی پورت‌های پیش‌فرض اشغال بودند؛ پورت آزاد انتخاب شد.\n'
fi

# این دو همیشه از HOST_IP مشتق می‌شوند تا با تغییر شبکه جا نمانند
remember CORS_ORIGIN         "http://${host_ip}:${web_port}"
remember NEXT_PUBLIC_API_URL "http://${host_ip}:${backend_port}"

# ---------- نوشتن .env ----------

{
  printf '# ساخته‌شده توسط setup.sh — برای تغییر، همین فایل را ویرایش کنید.\n'
  printf '# نشانی سرور: %s\n\n' "$host_ip"
  for key in "${order[@]}"; do
    printf '%s=%s\n' "$key" "${settings[$key]}"
  done
} > .env

chmod 600 .env
printf '  ✓ فایل .env نوشته شد\n'

# ---------- اجرا ----------

printf '\n  در حال ساخت و اجرا — بار اول چند دقیقه طول می‌کشد…\n\n'

docker compose "${compose_files[@]}" up -d --build

# داده اولیه فقط بار اول معنا دارد؛ اجرای دوباره بی‌ضرر است چون seed
# idempotent نوشته شده.
printf '\n  در حال ثبت داده اولیه…\n'
docker compose "${compose_files[@]}" exec -T backend node dist/database/seed.js

printf '\n  ✓ آماده است\n\n'
printf '    داشبورد و صندوق   http://%s:%s\n' "$host_ip" "$web_port"
# مسیر واقعی /api-docs است.  «/api» صفحهٔ ۴۰۴ می‌دهد — و همان اولین
# چیزی است که نصب‌کننده امتحان می‌کند.
printf '    API و Swagger     http://%s:%s/api-docs\n' "$host_ip" "$backend_port"
printf '    اتوماسیون n8n     http://%s:%s\n\n' "$host_ip" "$n8n_port"
printf '    ورود:  admin@molido.ai  /  admin123\n'
printf '    ⚠️ رمز مدیر را پس از اولین ورود عوض کنید.\n\n'
printf '  صندوق‌های دیگر شبکه همین نشانی را باز کنند: http://%s:%s\n\n' "$host_ip" "$web_port"
