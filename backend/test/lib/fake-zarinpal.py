#!/usr/bin/env python3
"""درگاهِ ساختگیِ زرین‌پال برای آزمون.

⚠️ چرا لازم شد؟

   مهم‌ترین سنجهٔ کلِ مخزن این است که «کم‌پرداختی رد شود»: درگاه فقط
   می‌گوید «تراکنش موفق بود» و اگر مبلغِ پاسخ با مبلغِ سفارش سنجیده
   نشود، سفارشِ ۵۸ میلیونی با پرداختِ ۱۰۰۰ ریال تأیید می‌شود.  همین
   ایراد یک بار واقعاً وجود داشت — `zarinpal.gateway` مبلغِ **درخواستی**
   را برمی‌گرداند، پس نگهبان عدد را با خودش می‌سنجید و همیشه برابر بود.

   ولی آن سنجه هیچ‌جا اجرا نمی‌شد: درگاهِ واقعی اعتبارنامهٔ پذیرنده
   می‌خواهد و sandbox هم همیشه در دسترس نیست.  یعنی نگهبانِ گران‌بهایی
   داشتیم که فقط روی کاغذ بود.

⚠️ این سرور عمداً می‌تواند **دروغ** بگوید.

   با `POST /__control {"underpay": true}` از این پس در تأیید مبلغی
   کمتر از آنچه گرفته برمی‌گرداند.  درگاهی که همیشه راست بگوید،
   نگهبانِ کم‌پرداختی را نمی‌آزماید — فقط مسیرِ خوش‌بینانه را.

⚠️ چرا کلید یک مسیرِ کنترلی است و نه پارامترِ نشانی؟

   نشانیِ تأیید را **بک‌اند** می‌سازد، نه آزمون.  نسخهٔ اول این فایل
   `?underpay=1` می‌خواند و هیچ‌وقت فعال نمی‌شد — یعنی سنجه‌ای که
   می‌نوشتیم همیشه سبز بود بی‌آنکه چیزی را بیازماید.  بدترین شکلِ
   آزمون: سبزی که معنا ندارد.

اجرا:  python3 fake-zarinpal.py <port>
"""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# authority ← مبلغِ تومانی که در گامِ درخواست اعلام شد.
LEDGER = {}
LOCK = threading.Lock()
STATE = {'underpay': False}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        """ساکت — وگرنه خروجیِ آزمون زیرِ لاگِ HTTP گم می‌شود."""

    def _send(self, payload, code=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(length) or b'{}')
        except ValueError:
            return {}

    def do_GET(self):
        """⚠️ فقط خواندن — کاوشِ «بالا هستی؟» نباید حالت را عوض کند.

        نسخهٔ اول فقط `POST /__control` داشت، پس کاوش مجبور بود POST
        بزند و همان کاوش `underpay` را صفر می‌کرد.  کاوشی که حالت را
        تغییر دهد، خودش منبعِ خطاست.
        """
        if self.path.split('?')[0] == '/__control':
            with LOCK:
                return self._send(dict(STATE))
        self._send({'errors': {'message': 'مسیر ناشناخته'}}, 404)

    def do_POST(self):
        path = self.path.split('?')[0]
        data = self._body()

        # مسیرِ کنترلی — پیش از بررسیِ `merchant_id`، چون درگاه نیست.
        if path == '/__control':
            with LOCK:
                STATE['underpay'] = bool(data.get('underpay'))
            return self._send({'underpay': STATE['underpay']})

        # ⚠️ نبودِ `merchant_id` باید همان‌طور رد شود که درگاهِ واقعی
        #    رد می‌کند؛ وگرنه آزمون از خطایی که در تولید رخ می‌دهد
        #    بی‌خبر می‌ماند.
        if not str(data.get('merchant_id') or '').strip():
            return self._send({'data': [], 'errors': {'code': -9,
                                                      'message': 'merchant_id لازم است'}}, 400)

        if path == '/pg/v4/payment/request.json':
            amount = int(data.get('amount') or 0)
            authority = 'A%036d' % (len(LEDGER) + 1)
            with LOCK:
                LEDGER[authority] = amount
            return self._send({'data': {'code': 100, 'authority': authority,
                                        'fee': 0}, 'errors': []})

        if path == '/pg/v4/payment/verify.json':
            authority = str(data.get('authority') or '')
            with LOCK:
                expected = LEDGER.get(authority)
            if expected is None:
                return self._send({'data': [], 'errors': {'code': -51,
                                                          'message': 'تراکنش ناموفق'}}, 400)

            # ⚠️ اینجاست که سرور می‌تواند دروغ بگوید.
            with LOCK:
                reported = 1 if STATE['underpay'] else expected
            return self._send({'data': {'code': 100, 'ref_id': 987654321,
                                        'amount': reported,
                                        'card_pan': '502229******5008'},
                               'errors': []})

        self._send({'errors': {'message': 'مسیر ناشناخته'}}, 404)


if __name__ == '__main__':
    port = int(sys.argv[1] if len(sys.argv) > 1 else 8899)
    HTTPServer(('0.0.0.0', port), Handler).serve_forever()
