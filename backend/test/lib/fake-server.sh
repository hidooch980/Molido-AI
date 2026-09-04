#!/usr/bin/env bash
#
# راه‌اندازیِ سرورهای ساختگیِ آزمون.
#
# ⚠️ سومین نسخهٔ همین کد بود که نوشته می‌شد.
#
#    `site-sales.sh` درگاهِ زرین‌پال را بالا می‌آورد، `shahkar.sh`
#    سامانهٔ شاهکار را، و حالا `ration.sh` هم به شاهکار نیاز پیدا کرد.
#    هر سه یک کار می‌کردند با کدِ کپی‌شده — و آن یعنی اصلاحِ فردا در
#    یکی انجام می‌شود و در دوتای دیگر نه.
#
# استفاده:
#     . "$(dirname "$0")/lib/fake-server.sh"
#     fake_up shahkar          # درگاه را از .env می‌خواند
#     fake_up zarinpal
#
# خروجی: `FAKE_PORT` را تنظیم می‌کند، یا اگر پیکربندی نشده باشد ۱
# برمی‌گرداند تا فراخوان خودش تصمیم بگیرد (رد شدن یا شکست).

# پیش از خروج، هرچه را خودمان بالا آورده‌ایم می‌خوابانیم.
_FAKE_PIDS=""
fake_down() {
  for pid in $_FAKE_PIDS; do kill "$pid" 2>/dev/null; done
  _FAKE_PIDS=""
}

# $1 = shahkar | zarinpal
fake_up() {
  local kind="$1" url script probe port

  case "$kind" in
    shahkar)
      # ⚠️ نشانی از `.env` خوانده می‌شود — همان چیزی که بک‌اند می‌بیند.
      #    پرسیدنش از محیطِ پوسته گمراه‌کننده است: آنجا معمولاً نیست.
      url="${SHAHKAR_URL:-$(grep -E '^SHAHKAR_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')}"
      script="backend/test/lib/fake-shahkar.py"
      probe="__control"
      ;;
    zarinpal)
      url="${ZARINPAL_BASE_URL:-$(grep -E '^ZARINPAL_BASE_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')}"
      script="backend/test/lib/fake-zarinpal.py"
      probe="__control"
      ;;
    *)
      echo "  fake_up: نوعِ ناشناخته «$kind»" >&2
      return 1 ;;
  esac

  # درگاه از خودِ نشانی درمی‌آید؛ نگه داشتنِ آن در دو جا یعنی روزی
  # یکی عوض می‌شود و دیگری نه.
  port=$(printf '%s' "$url" | grep -oE ':[0-9]+' | head -1 | tr -d ':')
  [ -n "$port" ] || return 1

  FAKE_PORT="$port"
  local ctl="http://localhost:$port/$probe"

  # بالاست؟
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$ctl")" = "200" ]; then
    return 0
  fi

  python3 "$script" "$port" >/dev/null 2>&1 &
  _FAKE_PIDS="$_FAKE_PIDS $!"

  for _ in 1 2 3 4 5; do
    sleep 1
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$ctl")" = "200" ] && return 0
  done

  return 1
}
