#!/usr/bin/env bash
#
# آزمون نگهبانِ بستهٔ استقرار.
#
# `bundle.sh` قرار است جلوی همان خطایی را بگیرد که یک بار پروژه را روی
# سرور شکست: فایلی که در بسته نیست و کسی تا وسط ساخت نمی‌فهمد.
#
# ولی نگهبانی که خطا را نگیرد، بدتر از نبودنش است — چون به آدم اطمینان
# کاذب می‌دهد.  پس اینجا نگهبان را با خرابیِ ساختگی می‌آزماییم، نه با
# حالت سالم.

cd "$(dirname "$0")/../.." || exit 1

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
OUT="$WORK/b.tar.gz"

echo '--- ۱) حالت سالم ---'
bash bundle.sh "$OUT" >"$WORK/ok.log" 2>&1
chk "بسته ساخته می‌شود" "$?" "0"
chk "فایل خروجی وجود دارد" "$([ -f "$OUT" ] && echo yes || echo no)" "yes"

echo '--- ۲) ماژول uploads جا نمی‌ماند ---'
# همان فایلی که یک بار جا ماند و ساخت را با «Cannot find module» کشت.
chk "backend/src/uploads در بسته هست" \
  "$(tar -tzf "$OUT" | grep -c '^backend/src/uploads/uploads.module.ts$')" "1"

echo '--- ۳) دادهٔ آپلودشده در بسته نیست ---'
# ولی پوشهٔ دادهٔ ریشه نباید برود — الگو باید این دو را از هم جدا کند.
chk "uploads ریشه نیست" "$(tar -tzf "$OUT" | grep -c '^uploads/')" "0"

echo '--- ۴) رمز و وابستگی‌ها نمی‌روند ---'
chk ".env نیست" "$(tar -tzf "$OUT" | grep -cE '^\.env')" "0"
chk "node_modules نیست" "$(tar -tzf "$OUT" | grep -cE '(^|/)node_modules/')" "0"
chk ".mcp.json نیست" "$(tar -tzf "$OUT" | grep -cE '^\.mcp\.json$')" "0"

echo '--- ۵) فایل کلیدیِ جامانده گرفته می‌شود ---'
# نگهبان را با خرابی ساختگی می‌آزماییم: فایلی که هست را موقتاً
# کنار می‌گذاریم و انتظار داریم اسکریپت شکست بخورد.
HIDE=data/balochi/fa-bal-gatitos.csv
mv "$HIDE" "$WORK/hidden.csv"
bash bundle.sh "$WORK/broken.tar.gz" >"$WORK/broken.log" 2>&1
code=$?
mv "$WORK/hidden.csv" "$HIDE"
chk "با فایل جامانده شکست می‌خورد" "$code" "1"
chk "بستهٔ ناقص باقی نمی‌ماند" \
  "$([ -f "$WORK/broken.tar.gz" ] && echo yes || echo no)" "no"

echo '--- ۶) پیام خطا می‌گوید کدام فایل ---'
# «بسته ناقص است» به کسی نمی‌گوید چه کار کند.
chk "نام فایل در پیام هست" \
  "$(grep -c 'fa-bal-gatitos' "$WORK/broken.log")" "1"

echo
echo "PASS: $pass  FAIL: $fail"
[ $fail -eq 0 ]
