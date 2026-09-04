# =============================================
# Molido AI — راه‌اندازی یک‌مرحله‌ای (ویندوز)
#
#   .\setup.ps1
#
# نشانی سرور در شبکهٔ محلی را خودکار پیدا می‌کند، رمزهای تصادفی می‌سازد،
# فایل .env را می‌نویسد و همه‌چیز را بالا می‌آورد.
# اجرای دوباره امن است: مقادیر موجود در .env دست‌نخورده می‌مانند.
# =============================================

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function New-Secret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Get-FreePort {
    # پورتی که کسی اشغالش نکرده باشد؛ اگر پورت پیش‌فرض گرفته باشد، بعدی امتحان
    # می‌شود.  بدون این، راه‌اندازی روی دستگاهی که سرویس دیگری دارد شکست می‌خورد.
    param([int]$Start)

    for ($port = $Start; $port -lt ($Start + 20); $port++) {
        $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (-not $inUse) { return $port }
    }

    return $Start
}

function Get-LanAddress {
    # نشانی‌ای که برای رسیدن به اینترنت استفاده می‌شود، همان نشانی قابل
    # دسترس از دیگر دستگاه‌های شبکه است.  APIPA و loopback کنار گذاشته می‌شوند.
    $candidates = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Sort-Object -Property SkipAsSource, InterfaceMetric

    if ($candidates) { return $candidates[0].IPAddress }
    return 'localhost'
}

Write-Host ''
Write-Host '  Molido AI — راه‌اندازی' -ForegroundColor Cyan
Write-Host '  ─────────────────────' -ForegroundColor Cyan
Write-Host ''

# ---------- بررسی پیش‌نیاز ----------

try {
    docker version --format '{{.Server.Version}}' | Out-Null
} catch {
    Write-Host '  ✗ Docker در دسترس نیست. Docker Desktop را اجرا کنید.' -ForegroundColor Red
    exit 1
}

# ---------- خواندن .env موجود ----------

$settings = [ordered]@{}

if (Test-Path '.env') {
    Write-Host '  فایل .env موجود است — مقادیر تنظیم‌شده حفظ می‌شوند.' -ForegroundColor Yellow
    foreach ($line in Get-Content '.env') {
        if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
            $settings[$Matches[1]] = $Matches[2]
        }
    }
}

# ---------- انتخاب محصول ----------

$product = $settings['MOLIDO_PRODUCT']

if (-not $product) {
    Write-Host '  کدام محصول نصب شود؟'
    Write-Host '    1) فروشگاه و سوپرمارکت'
    Write-Host '    2) کافه‌رستوران'
    Write-Host '    3) نسخهٔ کامل (همهٔ ماژول‌ها، شامل شهرداری)'
    $choice = Read-Host '  شماره را وارد کنید [3]'

    $product = switch ($choice) {
        '1' { 'store' }
        '2' { 'resto' }
        default { 'suite' }
    }
} else {
    Write-Host "  محصول (از .env): $product"
}

$settings['MOLIDO_PRODUCT'] = $product

# هر محصول پروژهٔ داکر و دیتابیس خودش را دارد، پس چند محصول می‌توانند روی یک
# دستگاه کنار هم اجرا شوند.
$composeFiles = @('-f', 'docker-compose.yml')
if ($product -ne 'suite') {
    $composeFiles += @('-f', "docker-compose.$product.yml")
}

# ---------- تشخیص نشانی شبکه ----------

$detected = Get-LanAddress
$current = $settings['HOST_IP']

if ($current -and $current -ne 'localhost') {
    $hostIp = $current
    Write-Host "  نشانی سرور (از .env): $hostIp"
} else {
    Write-Host "  نشانی سرور در شبکه: $detected"
    $answer = Read-Host '  اگر درست است Enter بزنید، وگرنه نشانی صحیح را وارد کنید'
    $hostIp = if ([string]::IsNullOrWhiteSpace($answer)) { $detected } else { $answer.Trim() }
}

# ---------- مقادیر ----------

function Set-IfMissing($key, $value) {
    if (-not $settings[$key]) { $settings[$key] = $value }
}

$settings['HOST_IP'] = $hostIp

Set-IfMissing 'POSTGRES_USER'     'postgres'
Set-IfMissing 'POSTGRES_PASSWORD' (New-Secret)
Set-IfMissing 'POSTGRES_DB'       'molido_ai'

Set-IfMissing 'JWT_SECRET'             (New-Secret)
Set-IfMissing 'JWT_EXPIRES_IN'         '7d'
Set-IfMissing 'JWT_REFRESH_SECRET'     (New-Secret)
Set-IfMissing 'JWT_REFRESH_EXPIRES_IN' '30d'

Set-IfMissing 'N8N_USER'           'admin'
Set-IfMissing 'N8N_PASSWORD'       (New-Secret).Substring(0, 16)
Set-IfMissing 'N8N_WEBHOOK_SECRET' (New-Secret)

Set-IfMissing 'AI_BASE_URL'   'https://api.openai.com/v1'
Set-IfMissing 'AI_API_KEY'    ''
Set-IfMissing 'AI_MODEL'      'gpt-4o-mini'
Set-IfMissing 'AI_TIMEOUT_MS' '20000'

Set-IfMissing 'SMS_API_KEY' ''
Set-IfMissing 'SMS_SENDER'  '10008663'

# پورت‌ها: اگر در .env تنظیم شده‌اند حفظ می‌شوند، وگرنه اولین پورت آزاد
Set-IfMissing 'BACKEND_PORT' (Get-FreePort 3000)
Set-IfMissing 'WEB_PORT'     (Get-FreePort 3001)
Set-IfMissing 'N8N_PORT'     (Get-FreePort 5678)

$backendPort = $settings['BACKEND_PORT']
$webPort     = $settings['WEB_PORT']
$n8nPort     = $settings['N8N_PORT']

if ($backendPort -ne 3000 -or $webPort -ne 3001 -or $n8nPort -ne 5678) {
    Write-Host '  برخی پورت‌های پیش‌فرض اشغال بودند؛ پورت آزاد انتخاب شد.' -ForegroundColor Yellow
}

# این دو همیشه از HOST_IP مشتق می‌شوند تا با تغییر شبکه جا نمانند
$settings['CORS_ORIGIN']         = "http://${hostIp}:${webPort}"
$settings['NEXT_PUBLIC_API_URL'] = "http://${hostIp}:${backendPort}"

# ---------- نوشتن .env ----------

$lines = @(
    '# ساخته‌شده توسط setup.ps1 — برای تغییر، همین فایل را ویرایش کنید.',
    "# نشانی سرور: $hostIp",
    ''
)
foreach ($key in $settings.Keys) { $lines += "$key=$($settings[$key])" }

Set-Content -Path '.env' -Value $lines -Encoding utf8
Write-Host '  ✓ فایل .env نوشته شد' -ForegroundColor Green

# ---------- اجرا ----------

Write-Host ''
Write-Host '  در حال ساخت و اجرا — بار اول چند دقیقه طول می‌کشد…'
Write-Host ''

docker compose @composeFiles up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ✗ اجرا ناموفق بود. خروجی بالا را بررسی کنید.' -ForegroundColor Red
    exit 1
}

# داده اولیه فقط بار اول معنا دارد؛ اجرای دوباره بی‌ضرر است چون seed
# idempotent نوشته شده.
Write-Host ''
Write-Host '  در حال ثبت داده اولیه…'
docker compose @composeFiles exec -T backend node dist/database/seed.js

Write-Host ''
Write-Host '  ✓ آماده است' -ForegroundColor Green
Write-Host ''
Write-Host "    داشبورد و صندوق   http://${hostIp}:${webPort}"
Write-Host "    API و Swagger     http://${hostIp}:${backendPort}/api"
Write-Host "    اتوماسیون n8n     http://${hostIp}:${n8nPort}"
Write-Host ''
Write-Host '    ورود:  admin@molido.ai  /  admin123' -ForegroundColor Yellow
Write-Host '    ⚠️ رمز مدیر را پس از اولین ورود عوض کنید.' -ForegroundColor Yellow
Write-Host ''
Write-Host "  صندوق‌های دیگر شبکه همین نشانی را باز کنند: http://${hostIp}:${webPort}"
Write-Host ''
