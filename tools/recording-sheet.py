#!/usr/bin/env python3
"""برگهٔ جلسهٔ ضبط پیکرهٔ صوتی.

خروجی HTML چاپ‌شدنی که گوینده جلوی خودش می‌گذارد.

چرا کاغذ، وقتی صفحهٔ ضبط هست: گوینده هم‌زمان نمی‌تواند صفحه را بخواند و
میکروفن را نگاه کند.  با برگه، جمله‌ها را یک بار مرور می‌کند، بعد فقط
دکمه می‌زند و می‌گوید — و پانزده دقیقه صرفِ ضبط می‌شود نه خواندن.

عبارت‌های بدون متن بلوچی اصلاً نمی‌آیند: گوینده نمی‌داند چه بگوید و
دیدنشان فقط سردرگمی است.  فهرستشان جدا در انتهای برگه می‌آید تا اگر
گوینده معادلی بلد بود، همان‌جا بنویسد.

اجرا:
    python3 tools/recording-sheet.py --api http://localhost:3000 \\
        --token "$TOKEN" > sheet.html
"""

import argparse
import html
import io
import json
import sys
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

KIND_FA = {"COMMAND": "فرمان", "NUMBER": "عدد", "PRODUCT": "نام کالا"}


def fetch(api, token, path):
    request = urllib.request.Request(
        f"{api}{path}", headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def build(rows, dialect_label):
    ready = [r for r in rows if r.get("textTarget")]
    blank = [r for r in rows if not r.get("textTarget")]

    # ترتیب: مثل صفحهٔ ضبط، کم‌ضبط‌ترها اول — تا جلسه شکاف‌ها را ببندد.
    ready.sort(key=lambda r: float(r.get("approved") or 0))

    parts = [
        "<!-- برگهٔ ضبط — چاپ کنید -->",
        "<style>",
        "  @page { size: A4; margin: 14mm }",
        "  body { font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl;",
        "         color: #111; line-height: 1.5 }",
        "  h1 { font-size: 20px; margin: 0 0 4px }",
        "  .sub { color: #555; font-size: 13px; margin-bottom: 14px }",
        "  table { width: 100%; border-collapse: collapse }",
        "  th { text-align: right; font-size: 12px; color: #555;",
        "       border-bottom: 1px solid #bbb; padding: 6px 8px }",
        "  td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: middle }",
        # متن بلوچی بزرگ است: گوینده از فاصلهٔ میز می‌خواندش، نه از نزدیک.
        "  .bal { font-size: 21px; font-weight: 700 }",
        "  .fa { color: #555; font-size: 14px }",
        "  .n { color: #888; font-size: 12px; width: 26px }",
        "  .box { width: 74px }",
        "  .box span { display:inline-block; width:16px; height:16px;",
        "              border:1px solid #999; margin-inline-end:3px; border-radius:3px }",
        "  .note { margin-top: 18px; padding: 10px 12px; background: #f6f6f6;",
        "          border-radius: 8px; font-size: 13px }",
        "  .blank td { color: #999 }",
        "</style>",
        f"<h1>برگهٔ ضبط — گویش {html.escape(dialect_label)}</h1>",
        '<div class="sub">',
        f"{len(ready)} عبارت آمادهٔ ضبط · هر عبارت ۵ بار از ۳ گوینده لازم دارد ·",
        " مربع‌ها را بعد از هر ضبط علامت بزنید",
        "</div>",
        "<table><thead><tr>",
        '<th class="n">#</th><th>بلوچی — این را بگویید</th>',
        "<th>فارسی</th><th>نوع</th><th>ضبط</th>",
        "</tr></thead><tbody>",
    ]

    for index, row in enumerate(ready, 1):
        parts.append(
            "<tr>"
            f'<td class="n">{index}</td>'
            f'<td class="bal">{html.escape(row["textTarget"])}</td>'
            f'<td class="fa">{html.escape(row["textFa"])}</td>'
            f'<td class="fa">{KIND_FA.get(row.get("kind"), row.get("kind") or "")}</td>'
            '<td class="box">'
            "<span></span><span></span><span></span><span></span><span></span>"
            "</td></tr>"
        )

    parts.append("</tbody></table>")

    if blank:
        parts.append(
            '<div class="note"><strong>این‌ها هنوز متن بلوچی ندارند</strong> و '
            "ضبط نمی‌شوند.  اگر معادلش را می‌دانید، روبه‌رویش بنویسید:</div>"
        )
        parts.append('<table class="blank"><tbody>')
        for row in blank:
            parts.append(
                "<tr>"
                f'<td class="fa">{html.escape(row["textFa"])}</td>'
                '<td style="border-bottom:1px solid #999">&nbsp;</td>'
                "</tr>"
            )
        parts.append("</tbody></table>")

    parts.append(
        '<div class="note">'
        "<strong>راهنمای ضبط:</strong> با صدای عادی و سرعت معمولی بگویید — نه "
        "شمرده، نه بلند.  اگر اشتباه گفتید همان را دوباره ضبط کنید؛ ضبط بد را "
        "بازبین رد می‌کند و به صف برمی‌گردد.  محیط ساکت لازم است ولی استودیو نه: "
        "صندوق واقعی هم ساکت نیست."
        "</div>"
    )
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:3000")
    parser.add_argument("--token", required=True)
    parser.add_argument("--dialect", default="")
    args = parser.parse_args()

    query = f"?dialect={args.dialect}" if args.dialect else ""
    rows = fetch(args.api, args.token, f"/voice/phrases{query}")
    if isinstance(rows, dict):
        rows = rows.get("data", [])

    status = fetch(args.api, args.token, "/voice/status")
    label = status.get("dialectLabel") or args.dialect or "—"

    print(build(rows, label))


if __name__ == "__main__":
    main()
