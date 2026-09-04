#!/usr/bin/env python3
"""منبعِ هر متن بلوچی را از روی واژه‌نامه تعیین و ثبت می‌کند.

هر عبارت پیکره در برابر واژه‌نامهٔ حرفه‌ای CC-BY-4.0 گوگل سنجیده می‌شود:

  GATITOS     سرواژه‌اش عیناً در واژه‌نامه هست و متن با آن یکی است.
  LOANWORD    متن با فارسی یکی است — عمداً فارسی مانده.
  UNVERIFIED  هیچ‌کدام؛ یعنی حدس است و آموزش با آن قفل می‌ماند.

⚠️ این ابزار **چیزی نمی‌سازد**.  فقط برچسب می‌زند.

  وسوسه‌اش هست که وقتی متن خالی است، از واژه‌نامه پرش کند.  ولی
  «اضافه کن» در واژه‌نامه «اضافه کردن → پر کنگ» است و صرفِ امری‌اش را
  من نمی‌دانم؛ گذاشتن «پر کنگ» به‌عنوان فرمان، مصدر را جای امر
  می‌نشاند.  پر کردنِ خودکار یعنی همان حدسی که این ستون قرار بود
  جلویش را بگیرد.

اجرا:
    python3 tools/voice-provenance.py --token "$TOKEN"           # گزارش
    python3 tools/voice-provenance.py --token "$TOKEN" --apply   # ثبت
"""

import argparse
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GATITOS = os.path.join(HERE, "data", "balochi", "fa-bal-gatitos.csv")


def load_dictionary():
    with io.open(GATITOS, encoding="utf-8") as handle:
        return {row["فارسی"].strip(): row["بلوچی"].strip()
                for row in csv.DictReader(handle)}


def request(api, token, path, method="GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{api}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else None


def classify(row, dictionary):
    """منبعِ متن این عبارت — یا None اگر متنی ندارد."""
    target = (row.get("textTarget") or "").strip()
    if not target:
        return None

    fa = row["textFa"].strip()

    # ترجمهٔ حرفه‌ای: سرواژه در واژه‌نامه هست و متن با آن یکی است.
    if fa in dictionary and dictionary[fa] == target:
        return "GATITOS"

    # وام‌واژه: متن بلوچی عیناً همان فارسی است.
    if target == fa:
        return "LOANWORD"

    return "UNVERIFIED"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:3000")
    parser.add_argument("--token", required=True)
    parser.add_argument("--apply", action="store_true",
                        help="بدون این فقط گزارش می‌دهد")
    args = parser.parse_args()

    dictionary = load_dictionary()
    rows = request(args.api, args.token, "/voice/phrases")
    if isinstance(rows, dict):
        rows = rows.get("data", [])

    buckets = {"GATITOS": [], "LOANWORD": [], "UNVERIFIED": [], "بدون متن": []}
    changes = []

    for row in rows:
        verdict = classify(row, dictionary)
        buckets["بدون متن" if verdict is None else verdict].append(row["textFa"])
        if verdict and row.get("source") != verdict:
            changes.append((row["id"], row["textFa"], row.get("source"), verdict))

    for name, items in buckets.items():
        print(f"  {name:<12} {len(items):>3}")
        if name in ("UNVERIFIED", "بدون متن") and items:
            for fa in items:
                print(f"                 · {fa}")

    if not changes:
        print("\n  همهٔ برچسب‌ها به‌روزند.")
        return

    print(f"\n  {len(changes)} برچسب باید عوض شود:")
    for _, fa, old, new in changes:
        print(f"    {fa:<24} {old or '—'} → {new}")

    if not args.apply:
        print("\n  برای ثبت، دوباره با --apply اجرا کنید.")
        return

    failed = []
    for phrase_id, fa, _, new in changes:
        try:
            request(args.api, args.token, f"/voice/phrases/{phrase_id}",
                    method="PATCH", body={"source": new})
        except urllib.error.HTTPError as error:
            failed.append((fa, error.code))

    if failed:
        # نیمه‌کاره ماندن باید صریح گفته شود، نه با یک «انجام شد» پوشانده.
        print(f"\n  ✗ {len(failed)} مورد ثبت نشد:")
        for fa, code in failed:
            print(f"    {fa} — HTTP {code}")
        sys.exit(1)

    print(f"\n  ✓ {len(changes)} برچسب ثبت شد.")


if __name__ == "__main__":
    main()
