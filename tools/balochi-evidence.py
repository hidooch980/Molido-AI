#!/usr/bin/env python3
"""شواهدِ واژه‌نامه برای عبارت‌های بلوچیِ تأییدنشده.

هر واژهٔ عبارت‌های واردشده در برابر واژه‌نامهٔ CC-BY-4.0 گوگل (۳۲۸۲ جفت)
سنجیده می‌شود تا معلوم شود کدام سطر شاهد دارد و کدام حدسِ خالص است.

⚠️ **تطبیق فقط دقیق است، نه فازی.**

نسخهٔ اول این اسکریپت ریشه‌ها را با شباهت رشته‌ای حدس می‌زد.  نتیجه‌اش
شاهدِ جعلی بود:

    قبول ← قبض        (هیچ ربطی ندارند)
    سپارش ← سپر       (هیچ ربطی ندارند)
    گران ← گرگ        (هیچ ربطی ندارند)
    پنسد ← پنچ        (شباهت حرفی، نه اشتقاق)

و «۱۲ عبارت محکم» گزارش می‌داد که دروغ بود.  شاهدی که ماشین ساخته و
آدمی ندیده از نبودِ شاهد بدتر است: نبودِ شاهد را کسی بررسی می‌کند، و
شاهدِ جعلی را کسی بازبینی نمی‌کند.

پس صرف‌ها فقط از فهرست دستیِ زیر می‌آیند — هرکدام با نگاه کردن به
مدخل واقعی واژه‌نامه تأیید شده‌اند.
"""

import csv
import io
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GATITOS = os.path.join(HERE, "data", "balochi", "fa-bal-gatitos.csv")
PURCHASING = os.path.join(HERE, "data", "balochi", "fa-bal-purchasing.csv")

# صرف‌هایی که دستی بررسی شده‌اند: واژهٔ صرف‌شده → مدخل واژه‌نامه.
#
# هرکدام با دیدن خودِ مدخل تأیید شده، نه با شباهت رشته‌ای.
CHECKED_INFLECTIONS = {
    "لوٹاں": "لوٹ",        # خواستن → لوٹ
    # مدخل واژه‌نامه «بها زورگ ء» است؛ توکنِ فعلی‌اش «زورگ» است، نه کل
    # عبارت — نگاشت به عبارت چندواژه‌ای هیچ‌وقت تطبیق نمی‌خورد.
    "زوریں": "زورگ",       # خریدن → بها زورگ ء
    "سپارش": "سپارشست",    # سفارش → سپارشست
    "دئے": "دیگ",          # دادن → دیگ
    "بیت": "بوگ",          # بودن → بوگ
    "بوت": "بوگ",          # بودن → بوگ
}


def load_dictionary():
    """توکن‌های بلوچی → معنی‌های فارسی‌ای که در آن مدخل آمده‌اند."""
    tokens = {}
    with io.open(GATITOS, encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            for token in re.split(r"[\s،]+", row["بلوچی"].strip()):
                token = token.strip("ء")
                if len(token) >= 2:
                    tokens.setdefault(token, set()).add(row["فارسی"])
    return tokens


def classify(text, tokens):
    """هر واژه: مستقیم در واژه‌نامه، صرفِ بررسی‌شده، یا بی‌شاهد."""
    direct, inflected, missing = [], [], []
    for token in re.split(r"[\s،]+", text.strip()):
        token = token.strip("ء")
        if len(token) < 2:
            continue
        if token in tokens:
            direct.append(token)
        elif token in CHECKED_INFLECTIONS and CHECKED_INFLECTIONS[token] in tokens:
            inflected.append(f"{token}←{CHECKED_INFLECTIONS[token]}")
        elif token in CHECKED_INFLECTIONS:
            # ریشه هم در واژه‌نامه نیست — پس شاهدی در کار نیست.
            missing.append(token)
        else:
            missing.append(token)
    return direct, inflected, missing


def main():
    tokens = load_dictionary()

    with io.open(PURCHASING, encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    counts = {"محکم": 0, "نسبی": 0, "بی‌شاهد": 0}
    print(f"{'حکم':<9}{'فارسی':<17}{'بلوچیِ واردشده':<21}جزئیات")
    print("─" * 88)

    for row in rows:
        direct, inflected, missing = classify(row["بلوچی"], tokens)
        total = len(direct) + len(inflected) + len(missing)

        if not missing:
            verdict = "محکم"
        elif len(missing) < total:
            verdict = "نسبی"
        else:
            verdict = "بی‌شاهد"
        counts[verdict] += 1

        detail = []
        if inflected:
            detail.append("صرف: " + "، ".join(inflected))
        if missing:
            detail.append("بی‌شاهد: " + "، ".join(missing))

        print(f"{verdict:<9}{row['فارسی']:<16}{row['بلوچی']:<21}{'  ·  '.join(detail)}")

    print()
    print(
        f"  محکم {counts['محکم']}  ·  نسبی {counts['نسبی']}  ·  بی‌شاهد {counts['بی‌شاهد']}"
    )
    print()
    print("  «محکم» یعنی هر واژه در واژه‌نامه هست — نه اینکه جمله درست است.")
    print("  ترتیب واژه‌ها، صرف فعل و اصطلاح‌بودن را فقط بلوچ‌زبان می‌داند.")


if __name__ == "__main__":
    main()
