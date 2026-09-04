﻿# =============================================
# باز کردن دسترسی مولیدو از روی شبکهٔ محلی
#
# این فایل را **راست‌کلیک ← Run with PowerShell** کنید و در پنجرهٔ تأیید
# ویندوز «Yes» بزنید.  اگر باز نشد، PowerShell را به‌صورت Administrator
# باز کنید و مسیر همین فایل را اجرا کنید.
#
# چه می‌کند:
#   ۱. شبکهٔ Wi-Fi را از Public به Private تغییر می‌دهد
#   ۲. پورت‌های ۳۰۰۰ و ۳۰۰۲ را فقط روی شبکهٔ Private باز می‌کند
#
# چرا هر دو لازم است: قانون فایروال روی پروفایل Private نوشته می‌شود، و
# تا وقتی شبکه Public علامت خورده باشد اصلاً اعمال نمی‌شود.
#
# چرا فقط Private: روی شبکهٔ عمومی — کافی‌نت، فرودگاه، هتل — این پورت‌ها
# نباید باز باشند.
# =============================================

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '  مولیدو — باز کردن دسترسی شبکهٔ محلی' -ForegroundColor Cyan
Write-Host '  ────────────────────────────────────'
Write-Host ''

# ---------- ۱) شبکه ----------
$profiles = Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' }

foreach ($p in $profiles) {
    # تونل VPN دست‌نخورده می‌ماند؛ عوض کردن دسته‌بندی‌اش می‌تواند خود تونل
    # را قطع کند.
    if ($p.InterfaceAlias -like '*tun*' -or $p.InterfaceAlias -like '*VPN*') {
        Write-Host ("  ⏭  {0} — رد شد (تونل)" -f $p.InterfaceAlias) -ForegroundColor DarkGray
        continue
    }

    if ($p.NetworkCategory -eq 'Private') {
        Write-Host ("  ✓  {0} — از قبل Private است" -f $p.InterfaceAlias) -ForegroundColor Green
        continue
    }

    try {
        Set-NetConnectionProfile -InterfaceAlias $p.InterfaceAlias -NetworkCategory Private
        Write-Host ("  ✓  {0} — به Private تغییر کرد" -f $p.InterfaceAlias) -ForegroundColor Green
    }
    catch {
        Write-Host ("  ✗  {0} — تغییر نکرد: {1}" -f $p.InterfaceAlias, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ''

# ---------- ۲) فایروال ----------
$ruleName = 'Molido AI'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existing) {
    # قانون قدیمی حذف و دوباره ساخته می‌شود: قانونی که با پروفایل اشتباه
    # ساخته شده باشد، بی‌سروصدا بی‌اثر می‌ماند و کسی نمی‌فهمد چرا.
    Remove-NetFirewallRule -DisplayName $ruleName
    Write-Host '  ↻  قانون قبلی حذف شد' -ForegroundColor DarkGray
}

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Description 'دسترسی به پنل و API مولیدو از شبکهٔ محلی' `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 3000, 3002 `
    -Action Allow `
    -Profile Private | Out-Null

Write-Host '  ✓  پورت‌های ۳۰۰۰ و ۳۰۰۲ روی شبکهٔ Private باز شدند' -ForegroundColor Green
Write-Host ''

# ---------- ۳) نشانی ----------
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object {
           $_.IPAddress -notlike '127.*' -and
           $_.IPAddress -notlike '169.254.*' -and
           $_.InterfaceAlias -notlike '*vEthernet*' -and
           $_.InterfaceAlias -notlike '*tun*'
       } |
       Select-Object -First 1).IPAddress

Write-Host '  ────────────────────────────────────'
if ($ip) {
    Write-Host '  از موبایل یا هر دستگاه دیگری در همین شبکه:' -ForegroundColor Cyan
    Write-Host ''
    Write-Host ("     پنل مدیریت :  http://{0}:3002" -f $ip) -ForegroundColor White
    Write-Host ("     فروشگاه    :  http://{0}:3002/shop" -f $ip) -ForegroundColor White
    Write-Host ''
    Write-Host '  اگر باز نشد، یک بار VPN را قطع کنید — بعضی تونل‌ها مسیر' -ForegroundColor DarkGray
    Write-Host '  شبکهٔ محلی را هم می‌گیرند.' -ForegroundColor DarkGray
}
else {
    Write-Host '  ✗  نشانی شبکه پیدا نشد — به Wi-Fi وصل هستید؟' -ForegroundColor Red
}

Write-Host ''
Write-Host '  برای بستن این پنجره کلیدی بزنید…' -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
