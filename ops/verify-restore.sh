#!/usr/bin/env bash
#
# آزمونِ **بازیابیِ** پشتیبان — نه فقط سلامتِ فایل.
#
#   bash ops/verify-restore.sh [میزبان]
#
# ⚠️ پشتیبانی که بازیابی نشده، پشتیبان نیست — فقط یک فایل است.
#
#    `backup.sh` سه چیز را می‌سنجد: gzip سالم، اندازهٔ معقول، و
#    شمارشِ جدول‌ها برابر با پایگاه‌داده.  هر سه لازم‌اند و هیچ‌کدام
#    کافی نیست: فایلی که همهٔ `CREATE TABLE`ها را دارد هم می‌تواند
#    وسطِ یک `COPY` بریده باشد، یا وابستگیِ کلیدِ خارجی‌اش به‌هم
#    بخورد، یا افزونه‌ای بخواهد که در سرورِ مقصد نیست.
#
#    تنها راهِ دانستن، **واقعاً بازیابی کردن** است.
#
# ⚠️ روی پایگاه‌دادهٔ **موقت** بازیابی می‌شود، نه روی داده‌ی زنده.
#
#    وسوسه‌اش هست که برای سادگی روی همان پایگاه‌داده امتحان شود.  آن
#    یعنی یک اشتباهِ تایپی، داده‌ی مشتری را پاک کند — و چون
#    `pg_dump --clean` است، `DROP TABLE`ها واقعاً اجرا می‌شوند.
#
#    اینجا پایگاه‌دادهٔ تازه‌ای ساخته می‌شود، سنجیده می‌شود، و در هر
#    حالت — حتی با خطا — پاک می‌شود.

set -u

HOST="${1:-mlz}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"
PROBE_DB="molido_restore_probe"

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

step "۰) دسترسی به $HOST"
ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" 'echo "  متصل: $(hostname)"' \
  || die "به $HOST وصل نشد"

# ⚠️ کلِ کار روی سرور انجام می‌شود، نه اینجا.
#
#    آوردنِ فایلِ پشتیبان به این ماشین یعنی داده‌ی مشتری روی لپ‌تاپِ
#    توسعه‌دهنده بنشیند.  و بی‌فایده هم هست: چیزی که می‌خواهیم بدانیم
#    این است که روی **همان سرور** بازیابی می‌شود.
#
# ⚠️ اسکریپت از **ورودی استاندارد** می‌رود، نه در آرگومانِ ssh.
#
#    نسخهٔ اول کلِ متن را در یک رشتهٔ دولک‌ای گذاشته بود و چهار لایه
#    گریز داشت (اینجا ← ssh ← پوستهٔ راه دور ← psql).  یک سنجه‌اش
#    **خطای نحوی** داشت و هرگز اجرا نمی‌شد — و دیده هم نمی‌شد، چون
#    `bash -n` فقط لایهٔ بیرونی را می‌سنجد و لایهٔ بیرونی سالم بود.
#
#    با `bash -s` متن دست‌نخورده می‌رود: صفر لایه گریز، و `bash -n`
#    همین فایل واقعاً همان چیزی را می‌سنجد که اجرا می‌شود.

ssh -o BatchMode=yes "$HOST" bash -s -- "$REMOTE" "$PROBE_DB" <<'REMOTE_SCRIPT'
set -u
REMOTE_DIR="$1"
PROBE_DB="$2"
cd "$REMOTE_DIR" || exit 1
C='docker compose -f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml'

pass=0; fail=0
chk() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s
' "$1"
  else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)
' "$1" "$2" "$3"; fi
}
# ⚠️ `</dev/null` **اجباری** است، و نبودش اسکریپت را بی‌صدا نصفه می‌کرد.
#
#    این متن از راهِ `ssh ... bash -s` روی **ورودی استاندارد** می‌آید،
#    و `docker compose exec -T` هم stdin می‌خواند — پس اولین فراخوانی
#    بقیهٔ اسکریپت را می‌بلعید.
#
#    نتیجه: اجرا بعد از گامِ ۱ می‌ایستاد و کدِ خروج **صفر** بود.  یعنی
#    آزمونِ بازیابی «موفق» گزارش می‌شد بی‌آنکه چیزی بازیابی کرده باشد —
#    بدترین حالتِ ممکن برای ابزاری که کارش سنجیدنِ پشتیبان است.
psql_live()  { $C exec -T postgres psql -U postgres -d molido_ai  -tAq -c "$1" </dev/null 2>/dev/null | tr -d ' 
'; }
psql_probe() { $C exec -T postgres psql -U postgres -d "$PROBE_DB" -tAq -c "$1" </dev/null 2>/dev/null | tr -d ' 
'; }

printf '
── ۱) تازه‌ترین پشتیبان
'
F=$(docker exec molido-store-backup-1 sh -c 'ls -t /backups/daily/*.sql.gz 2>/dev/null | head -1')
[ -n "$F" ] || { echo '  ✗ هیچ پشتیبانی پیدا نشد'; exit 1; }
echo "  $(basename "$F")"

SRC_TABLES=$(psql_live "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
echo "  جدول در پایگاه‌دادهٔ زنده: $SRC_TABLES"

printf '
── ۲) بازیابی در پایگاه‌دادهٔ موقت
'

# ⚠️ پاک‌سازی در هر حالت — حتی اگر بازیابی وسطِ کار بشکند.
cleanup() {
  $C exec -T postgres psql -U postgres -d postgres -q     -c "DROP DATABASE IF EXISTS \"$PROBE_DB\"" </dev/null >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
$C exec -T postgres psql -U postgres -d postgres -q -c "CREATE DATABASE \"$PROBE_DB\"" </dev/null   || { echo '  ✗ ساختِ پایگاه‌دادهٔ موقت شکست'; exit 1; }

# ⚠️ خروجیِ psql دور ریخته می‌شود ولی **کدِ خروجش نه**.
#
#    dump با --clean --if-exists روی پایگاه‌دادهٔ خالی ده‌ها NOTICE
#    می‌دهد ("table does not exist, skipping") که خطا نیستند.  ولی
#    خطای واقعی هم همان‌جا گم می‌شود، پس ON_ERROR_STOP لازم است تا
#    شکست واقعاً شکست شمرده شود.
if docker exec molido-store-backup-1 sh -c "zcat $F"    | $C exec -T postgres psql -U postgres -d "$PROBE_DB" -v ON_ERROR_STOP=1 -q        >/dev/null 2>/tmp/restore-err.txt; then
  echo '  OK   بازیابی بدون خطا تمام شد'
  pass=$((pass+1))
else
  echo '  FAIL بازیابی شکست خورد:'
  tail -5 /tmp/restore-err.txt | sed 's/^/      /'
  fail=$((fail+1))
fi

printf '
── ۳) آنچه بازیابی شد
'

DST_TABLES=$(psql_probe "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
# ⚠️ جدولِ **کمتر** همیشه اشکال نیست.
#
#    پشتیبان از دیشب است؛ اگر امروز مهاجرتی جدول ساخته باشد، نسخهٔ
#    بازیابی‌شده آن را ندارد و این کاملاً درست است.  شکست دادنش یعنی
#    قرمزیِ دائمی پس از هر مهاجرت تا پشتیبانِ بعدی — و قرمزی‌ای که
#    کسی نمی‌تواند سبزش کند، نگهبانی است که کسی نگاهش نمی‌کند.
#
#    آنچه **واقعاً** اشکال است: جدولی که در پشتیبان بود و بازیابی
#    نشد.  آن را شمارشِ سطرها می‌گیرد، نه شمارشِ جدول.
#
#    سنجیده شد: پشتیبانِ ۰۲:۱۷ صد‌وسی‌وهشت جدول داشت و زنده صدوچهل —
#    چون مهاجرت‌های ۰۶۸ و ۰۶۹ همان روز اجرا شدند.  همهٔ سطرها درست
#    بازیابی شدند و دفتر متراز بود.
if [ "$DST_TABLES" = "$SRC_TABLES" ]; then
  chk 'شمارشِ جدول برابرِ زنده است' "$DST_TABLES" "$SRC_TABLES"
elif [ "${DST_TABLES:-0}" -lt "${SRC_TABLES:-0}" ]; then
  printf '  !    پشتیبان %s جدول دارد و زنده %s — احتمالاً مهاجرتی پس از پشتیبان اجرا شده\n' \
    "$DST_TABLES" "$SRC_TABLES"
  printf '       (سطرها جداگانه سنجیده می‌شوند؛ اشکالِ واقعی را آن‌ها می‌گیرند)\n'
else
  # ⚠️ جدولِ **بیشتر** یعنی چیزی در نسخهٔ بازیابی‌شده هست که در زنده
  #    نیست — نشانهٔ پشتیبانِ اشتباه یا پایگاه‌دادهٔ ناهمخوان.
  chk 'نسخهٔ بازیابی‌شده جدولِ اضافه ندارد' "$DST_TABLES" "$SRC_TABLES"
fi

# ⚠️ جدول‌ها که باشند یعنی شِما آمده، نه اینکه **داده** آمده.
#    یک dump که وسطِ COPY بریده باشد هم همهٔ CREATE TABLEها را دارد.
#    JournalLine عمداً در فهرست است: بریدگیِ وسطِ COPY معمولاً در
#    بزرگ‌ترین جدول رخ می‌دهد و اینجا همان است.
for t in Company Product Customer User Account JournalLine; do
  SRC=$(psql_live  "SELECT count(*) FROM \"$t\"")
  DST=$(psql_probe "SELECT count(*) FROM \"$t\"")
  chk "سطرهای $t" "$DST" "$SRC"
done

# ⚠️ و اینکه دفترِ بازیابی‌شده **متراز** است.
#    داده‌ی ناقص می‌تواند شمارشِ درست بدهد ولی جمعِ غلط.
BAL=$(psql_probe "SELECT CASE WHEN round(COALESCE(sum(debit),0) - COALESCE(sum(credit),0)) = 0 THEN 'ok' ELSE 'off' END FROM \"JournalLine\"")
chk 'دفترِ بازیابی‌شده متراز است' "$BAL" 'ok'

printf '
   PASS: %s   FAIL: %s
' "$pass" "$fail"
[ "$fail" -eq 0 ]
REMOTE_SCRIPT
