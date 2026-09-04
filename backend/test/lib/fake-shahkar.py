#!/usr/bin/env python3
"""سامانهٔ ساختگیِ شاهکار برای آزمون.

⚠️ چرا لازم است؟

   شاهکار API عمومی ندارد و اعتبارنامه‌اش را هر کسی نمی‌گیرد.  بدونِ
   بدل، مسیرِ احرازِ هویت روی هیچ ماشینی اجرا نمی‌شد — همان دامی که
   درگاهِ پرداخت در آن افتاده بود: نگهبانی که فقط روی کاغذ است.

⚠️ این سرور عمداً می‌تواند **خراب** باشد.

   مهم‌ترین سنجهٔ شاهکار این نیست که تطبیقِ درست را تأیید کند؛ این است
   که **در دسترس نبودنِ سرویس به «کد ملی جعلی است» ترجمه نشود**.
   سه حالت هست و بدلی که فقط دو حالت بدهد، آن اشتباه را نمی‌گیرد.

   با `POST /__control`:
     {"mode": "ok"}       تطبیق بر پایهٔ نگاشتِ زیر
     {"mode": "down"}     خطای ۵۰۳ — «نمی‌دانیم»
     {"mode": "slow"}     پاسخِ کند، برای سنجشِ مهلت
     {"mode": "garbage"}  پاسخِ ۲۰۰ ولی بی‌فیلدِ نتیجه

اجرا:  python3 fake-shahkar.py <port>
"""

import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

# کد ملی ← شماره‌ای که واقعاً به نامش است.
OWNERS = {
    '0499370899': '09121234567',
    '0790419904': '09129998877',
}

STATE = {'mode': 'ok', 'calls': 0}
LOCK = threading.Lock()


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
        if self.path.split('?')[0] == '/__control':
            with LOCK:
                return self._send(dict(STATE))
        self._send({'error': 'مسیر ناشناخته'}, 404)

    def do_POST(self):
        path = self.path.split('?')[0]
        data = self._body()

        if path == '/__control':
            with LOCK:
                if 'mode' in data:
                    STATE['mode'] = str(data['mode'])
                if data.get('reset'):
                    STATE['calls'] = 0
                return self._send(dict(STATE))

        if path != '/shahkar/verify':
            return self._send({'error': 'مسیر ناشناخته'}, 404)

        # ⚠️ نبودِ توکن همان‌طور رد می‌شود که سرویسِ واقعی رد می‌کند.
        auth = self.headers.get('Authorization') or ''
        if not auth.strip():
            return self._send({'error': 'توکن لازم است'}, 401)

        with LOCK:
            STATE['calls'] += 1
            mode = STATE['mode']

        if mode == 'down':
            return self._send({'error': 'سرویس در دسترس نیست'}, 503)

        if mode == 'slow':
            time.sleep(5)

        if mode == 'garbage':
            # ۲۰۰ ولی بدونِ فیلدِ نتیجه — دقیقاً همان چیزی که یک مسیرِ
            # پیکربندیِ اشتباه می‌سازد.
            return self._send({'status': 'unexpected shape'})

        nid = str(data.get('nationalCode') or '')
        mobile = str(data.get('mobile') or '')

        return self._send({
            'result': {
                'matched': OWNERS.get(nid) == mobile,
                'trackId': 'FAKE-%s' % nid[-4:],
            },
        })


if __name__ == '__main__':
    port = int(sys.argv[1] if len(sys.argv) > 1 else 8898)
    HTTPServer(('0.0.0.0', port), Handler).serve_forever()
