import { SmsService } from './sms.service';

/**
 * انتخابِ ارائه‌دهنده و قراردادِ هر کدام — بدونِ تماس با درگاهِ واقعی.
 *
 * ⚠️ قراردادِ sms.ir از **OpenAPI رسمیِ خودشان** گرفته شده، نه از
 *    حافظه:  `https://api.sms.ir/swagger/v1/swagger.json`
 *
 *      POST /v1/send/bulk    { lineNumber:int, messageText, mobiles[] }
 *      POST /v1/send/verify  { mobile, templateId:int, parameters[] }
 *      سرآیند: X-API-KEY
 *
 *    و با کلیدِ نامعتبر روی درگاهِ واقعی سنجیده شد: هر دو مسیر ۴۰۱ با
 *    `{"status":10,"message":"کلید وب سرویس نامعتبر است"}` می‌دهند.
 *
 * ⚠️ سنجهٔ اصلی «پیامک رفت» نیست — آن را فقط درگاهِ واقعی می‌گوید.
 *
 *    آنچه اینجا اهمیت دارد این است که **درخواستِ درست ساخته شود**:
 *    مسیرِ درست، سرآیندِ درست، و میدان‌هایی با نام و نوعِ درست.  یک
 *    `lineNumber` رشته‌ای به‌جای عدد، خطایی می‌دهد که فقط سرِ نخستین
 *    پیامکِ واقعی دیده می‌شود.
 */

type Captured = { url: string; init: Record<string, unknown> };

function withFetch(
  status: number,
  body: unknown,
): { calls: Captured[]; restore: () => void } {
  const calls: Captured[] = [];
  const g = globalThis as unknown as { fetch: unknown };
  const original = g.fetch;

  g.fetch = (url: string, init: Record<string, unknown>) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  };

  return { calls, restore: () => { g.fetch = original; } };
}

function service(env: Record<string, string>): SmsService {
  return new SmsService({
    get: (key: string) => env[key],
  } as never);
}

describe('انتخابِ ارائه‌دهندهٔ پیامک', () => {
  it('بدونِ کلید، شبیه‌سازی می‌کند و ارسال نمی‌کند', async () => {
    const f = withFetch(200, {});
    try {
      const r = await service({}).send('09120000000', 'کد: 1234');
      expect(r.sent).toBe(false);
      expect(r.simulated).toBe(true);
      // ⚠️ مهم‌تر از پرچم: هیچ تماسی نرفته باشد.
      expect(f.calls).toHaveLength(0);
    } finally {
      f.restore();
    }
  });

  it('پیش‌فرض کاوه‌نگار است — نصب‌های موجود نباید بشکنند', async () => {
    const f = withFetch(200, { return: { status: 200 } });
    try {
      await service({ SMS_API_KEY: 'k' }).send('09120000000', 'سلام');
      expect(f.calls[0].url).toContain('api.kavenegar.com');
    } finally {
      f.restore();
    }
  });

  it('sms.ir بدونِ قالب، متنِ آزاد را به /send/bulk می‌فرستد', async () => {
    const f = withFetch(200, { status: 1, message: 'موفق' });
    try {
      const r = await service({
        SMS_API_KEY: 'k',
        SMS_PROVIDER: 'sms.ir',
        SMS_SENDER: '30007',
      }).send('09120000000', 'سلام');

      expect(r.sent).toBe(true);
      expect(f.calls[0].url).toBe('https://api.sms.ir/v1/send/bulk');

      const headers = f.calls[0].init.headers as Record<string, string>;
      expect(headers['X-API-KEY']).toBe('k');

      const body = JSON.parse(f.calls[0].init.body as string);
      // ⚠️ **عدد**، نه رشته — قرارداد `integer` می‌خواهد.
      expect(typeof body.lineNumber).toBe('number');
      expect(body.lineNumber).toBe(30007);
      expect(body.mobiles).toEqual(['09120000000']);
      expect(body.messageText).toBe('سلام');
    } finally {
      f.restore();
    }
  });

  it('با قالب، کد را بیرون می‌کشد و به /send/verify می‌فرستد', async () => {
    const f = withFetch(200, { status: 1 });
    try {
      const r = await service({
        SMS_API_KEY: 'k',
        SMS_PROVIDER: 'sms.ir',
        SMSIR_TEMPLATE_ID: '77',
      }).send('09120000000', 'کد تأیید مولیدو: 45219');

      expect(r.mode).toBe('verify');
      expect(f.calls[0].url).toBe('https://api.sms.ir/v1/send/verify');

      const body = JSON.parse(f.calls[0].init.body as string);
      expect(body.templateId).toBe(77);
      // ⚠️ فقط کد می‌رود، نه کلِ جمله — قالب جای کد را خودش دارد.
      expect(body.parameters).toEqual([{ name: 'CODE', value: '45219' }]);
    } finally {
      f.restore();
    }
  });

  it('رقمِ فارسیِ شماره به لاتین تبدیل می‌شود', async () => {
    // ⚠️ شمارهٔ فارسی را درگاه نمی‌شناسد و خطایش «شمارهٔ نامعتبر» است —
    //    که به نظر اشکالِ داده می‌آید نه اشکالِ تبدیل.
    const f = withFetch(200, { status: 1 });
    try {
      await service({ SMS_API_KEY: 'k', SMS_PROVIDER: 'sms.ir' }).send(
        '۰۹۱۲۰۰۰۰۰۰۰',
        'سلام',
      );
      const body = JSON.parse(f.calls[0].init.body as string);
      expect(body.mobiles).toEqual(['09120000000']);
    } finally {
      f.restore();
    }
  });

  it('۲۰۰ با statusِ خطا، موفق شمرده نمی‌شود', async () => {
    // ⚠️ **مهم‌ترین سنجهٔ فایل.**
    //
    //    sms.ir برای خطاهای کاربردی هم ۲۰۰ برمی‌گرداند و علت را در
    //    `status` می‌گذارد.  اگر فقط `response.ok` سنجیده می‌شد،
    //    «اعتبار کافی نیست» موفق شمرده می‌شد و مشتری پشتِ صفحه منتظرِ
    //    کدی می‌ماند که هرگز نرفته.
    const f = withFetch(200, { status: 20, message: 'اعتبار کافی نیست' });
    try {
      const r = await service({ SMS_API_KEY: 'k', SMS_PROVIDER: 'sms.ir' }).send(
        '09120000000',
        'سلام',
      );
      expect(r.sent).toBe(false);
      expect(r.error).toBe('اعتبار کافی نیست');
    } finally {
      f.restore();
    }
  });

  it('کلیدِ نامعتبر (۴۰۱ با status 10) شکست است', async () => {
    const f = withFetch(401, { status: 10, message: 'کلید وب سرویس نامعتبر است' });
    try {
      const r = await service({ SMS_API_KEY: 'bad', SMS_PROVIDER: 'sms.ir' }).send(
        '09120000000',
        'سلام',
      );
      expect(r.sent).toBe(false);
      expect(r.error).toBe('کلید وب سرویس نامعتبر است');
    } finally {
      f.restore();
    }
  });
});
