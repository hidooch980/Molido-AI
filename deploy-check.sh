#!/usr/bin/env bash
#
# آزمون استقرار — همان مسیری که یک نصب تازه طی می‌کند.
#
# چرا اسکریپت و نه چند دستور دستی: نصب بعدی روی سرور مشتری انجام می‌شود،
# و آنجا کسی نیست که یادش باشد کدام مرحله را چطور بررسی کند.  اگر این
# اسکریپت سبز شد، نصب سالم است.
#
# اجرا:  bash deploy-check.sh
#        bash deploy-check.sh --rebuild    (ساخت کامل از صفر)

cd "$(dirname "$0")" || exit 1

# قابل تنظیم تا همین بررسی روی یک نصب تازه هم اجرا شود:
#   MOLIDO_COMPOSE="docker compose -p molido-fresh -f ... -f docker-compose.fresh.yml" #   MOLIDO_API=http://localhost:3100 MOLIDO_WEB=http://localhost:3102 bash deploy-check.sh
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
A=${MOLIDO_API:-http://localhost:3000}
W=${MOLIDO_WEB:-http://localhost:3002}

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ✓  %s\n' "$1"; else fail=$((fail+1)); printf '  ✗  %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---------- ۱) ساخت ----------
if [ "$1" = "--rebuild" ]; then
  step "۱) ساخت تصویرها از صفر"
  $C build --no-cache 2>&1 | tail -3
else
  step "۱) ساخت تصویرها"
  $C build 2>&1 | tail -2
fi

# ---------- ۲) دیتابیس ----------
step "۲) دیتابیس"
$C up -d postgres 2>&1 | tail -1

# سلامت را باید **صبر کرد**، نه فرض.  مهاجرت روی دیتابیسی که هنوز بالا
# نیامده، با خطای اتصال می‌شکند و آدم فکر می‌کند مهاجرت خراب است.
for i in $(seq 1 30); do
  $C exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
chk "پستگرس آماده" "$($C exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && echo yes || echo no)" "yes"

# ---------- ۳) مهاجرت ----------
step "۳) مهاجرت‌ها"
$C run --rm migrate 2>&1 | tail -2

FILES=$(ls backend/sql/migrations/*.sql | wc -l)
APPLIED=$($C exec -T postgres psql -U postgres -d molido_ai -tAc "SELECT COUNT(*) FROM schema_migrations" 2>/dev/null | tr -d '\r')
chk "همهٔ مهاجرت‌ها اعمال شد" "$APPLIED" "$FILES"

# نقش برنامه باید غیرمالک باشد، وگرنه RLS اصلاً اعمال نمی‌شود — و این
# دقیقاً همان خطایی است که هیچ آزمونی نمی‌گیردش چون همه‌چیز کار می‌کند،
# فقط جداسازی شرکت‌ها وجود ندارد.
chk "نقش برنامه غیرمالک است" \
  "$($C exec -T postgres psql -U postgres -d molido_ai -tAc "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='molido_app'" 2>/dev/null | tr -d '\r')" "f"

RLS=$($C exec -T postgres psql -U postgres -d molido_ai -tAc \
  "SELECT COUNT(*) FROM pg_policies WHERE policyname='company_isolation'" 2>/dev/null | tr -d '\r')
chk "سیاست‌های RLS برقرارند" "$([ "${RLS:-0}" -gt 50 ] && echo yes || echo no)" "yes"

# ---------- ۴) سرویس‌ها ----------
step "۴) سرویس‌ها"
$C up -d 2>&1 | tail -3

for i in $(seq 1 40); do
  curl -s -o /dev/null -w '%{http_code}' -X POST $A/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@molido.ai","password":"admin123"}' 2>/dev/null | grep -q 200 && break
  sleep 3
done

chk "ورود به API" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"admin123"}')" "200"

T=$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])" 2>/dev/null)
AU="Authorization: Bearer $T"

# ---------- ۵) صفحه‌ها ----------
step "۵) صفحه‌های وب"
for page in / /dashboard /pos /sales /sales/new /products /inventory /stock-count \
            /purchases /purchases/new /reports /treasury /returns /assets \
            /fiscal-year /crm /customers /sales-agents /sales-chain /labels \
            /accounting /pricing /loyalty /online-orders /tax /import \
            /definitions /operations /settings /catalogue /users /sms /quick-keys \
            /shop /shop/cart /shop/login /shop/account; do
  chk "صفحهٔ $page" "$(curl -s -o /dev/null -w '%{http_code}' "$W$page")" "200"
done

# ---------- ۶) مسیرهای اصلی API ----------
step "۶) مسیرهای API"
for path in /products /sales /warehouses /cashbox /customers /treasury/accounts \
            /pricing/levels /loyalty/segments /tax/stats /operations/health \
            /retail/parked /company; do
  chk "API $path" "$(curl -s -o /dev/null -w '%{http_code}' "$A$path" -H "$AU")" "200"
done

# ---------- ۷) فروشگاه اینترنتی بدون توکن ----------
step "۷) فروشگاه اینترنتی (عمومی)"
chk "کاتالوگ عمومی" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/products")" "200"
chk "تنظیمات فروشگاه" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/settings")" "200"
# مسیر خصوصی بدون توکن باید ۴۰۱ بدهد، نه ۲۰۰
chk "سفارش‌های مشتری محافظت‌شده" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/my-orders")" "401"

# ---------- ۷b) n8n ----------
step "۷b) موتور گردش‌کار"
# پورتش قابل تنظیم است چون ممکن است نصب n8n دیگری روی همان ماشین باشد —
# و اگر باشد، سرویس بی‌سروصدا بالا نمی‌آید و کسی متوجه نمی‌شود.
N8N_PORT=$(grep -E '^N8N_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '
')
chk "n8n بالاست"   "$($C ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -c 'n8n running')" "1"
chk "n8n پاسخ می‌دهد"   "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${N8N_PORT:-5678}/healthz" 2>/dev/null)" "200"

# ---------- ۸) پشتیبان‌گیری ----------
step "۸) پشتیبان‌گیری"
chk "سرویس پشتیبان بالاست" \
  "$($C ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -c 'backup running')" "1"

BK=$($C exec -T backup sh -lc 'ls /backups/daily/*.sql.gz 2>/dev/null | wc -l' 2>/dev/null | tr -d '\r')
chk "پشتیبان روزانه موجود است" "$([ "${BK:-0}" -gt 0 ] && echo yes || echo no)" "yes"

# ---------- ۹) امنیت ----------
step "۹) بررسی‌های امنیتی"
# API بدون توکن نباید داده بدهد
chk "API بدون توکن بسته است" "$(curl -s -o /dev/null -w '%{http_code}' "$A/products")" "401"
# رمز پیش‌فرض هنوز فعال است؟  در نصب واقعی باید عوض شود.
if curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"admin@molido.ai","password":"admin123"}' | grep -q accessToken; then
  printf '  ⚠  رمز پیش‌فرض admin123 هنوز فعال است — پیش از تحویل عوضش کنید\n'
fi

echo
printf '\033[1m   موفق: %s   ناموفق: %s\033[0m\n' "$pass" "$fail"

if [ "$fail" -eq 0 ]; then
  IP=$(python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('8.8.8.8', 80)); print(s.getsockname()[0])
except Exception:
    print('localhost')
finally:
    s.close()
" 2>/dev/null || echo localhost)

  printf '\n   پنل     : http://%s:3002\n' "$IP"
  printf '   فروشگاه : http://%s:3002/shop\n' "$IP"
  printf '   API     : http://%s:3000/api-docs\n\n' "$IP"
fi

exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
