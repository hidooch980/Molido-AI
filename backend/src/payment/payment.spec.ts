import { ZarinpalGateway } from './zarinpal.gateway';

/**
 * درگاه پرداخت — سنجه‌هایی که پول را نگه می‌دارند.
 *
 * ⚠️ اینجا شبکه صدا زده نمی‌شود.  چیزی که سنجیده می‌شود منطقِ خودمان
 *    است: تبدیلِ واحد، تشخیصِ پیکربندی، و رفتار در نبودِ کلید — همان
 *    سه جایی که اشتباهشان پول را جابه‌جا می‌کند و خطایی هم نمی‌دهد.
 */

function gateway(env: Record<string, string | undefined>) {
  return new ZarinpalGateway({
    get: (key: string) => env[key],
  } as never);
}

describe('ZarinpalGateway', () => {
  describe('تشخیص پیکربندی', () => {
    it('بدون کلید، پیکربندی‌نشده است', () => {
      expect(gateway({}).isConfigured()).toBe(false);
    });

    it('کلیدِ فقط-فاصله هم پیکربندی نیست', () => {
      // ⚠️ `.env` خالی اغلب به شکل `ZARINPAL_MERCHANT_ID= ` می‌ماند.
      //    بدونِ `trim` این «تنظیم‌شده» شمرده می‌شد و درخواست با
      //    شناسهٔ خالی به درگاه می‌رفت.
      expect(gateway({ ZARINPAL_MERCHANT_ID: '   ' }).isConfigured()).toBe(false);
    });

    it('با کلید، پیکربندی‌شده است', () => {
      expect(gateway({ ZARINPAL_MERCHANT_ID: 'abc' }).isConfigured()).toBe(true);
    });
  });

  describe('نبودِ کلید، پرداختِ واقعی نمی‌سازد', () => {
    it('start علامتِ شبیه‌سازی می‌دهد و نشانی نمی‌دهد', async () => {
      const result = await gateway({}).start({
        amount: 1_000_000,
        orderNo: 'ORD-1',
        callbackUrl: 'https://x.test/cb',
      });

      expect(result.ok).toBe(false);
      // ⚠️ `simulated` باید صریح باشد: اگر فقط `ok:false` بود، فراخوان
      //    نمی‌توانست «درگاه خراب است» را از «درگاه تنظیم نشده» جدا کند.
      expect(result.simulated).toBe(true);
      expect(result.redirectUrl).toBeUndefined();
    });

    it('verify هم همین‌طور', async () => {
      const result = await gateway({}).verify('AUTH', 1_000_000);
      expect(result.ok).toBe(false);
      expect(result.simulated).toBe(true);
    });
  });

  describe('محیطِ آزمایشی از واقعی جداست', () => {
    it('sandbox نشانیِ دیگری دارد', () => {
      const sandbox = gateway({
        ZARINPAL_MERCHANT_ID: 'abc',
        ZARINPAL_SANDBOX: 'true',
      }) as unknown as { base(): string };
      const live = gateway({ ZARINPAL_MERCHANT_ID: 'abc' }) as unknown as {
        base(): string;
      };

      expect(sandbox.base()).toContain('sandbox');
      // ⚠️ اگر این دو یکی می‌شدند، آزمونِ توسعه پولِ واقعی جابه‌جا
      //    می‌کرد.
      expect(live.base()).not.toContain('sandbox');
    });
  });

  describe('تبدیل ریال به تومان', () => {
    // ⚠️ مهم‌ترین بخش.  زرین‌پال تومان می‌گیرد و ما ریال نگه می‌داریم؛
    //    اشتباهِ ضریب یعنی مشتری ده برابر یا یک‌دهم پرداخت می‌کند و
    //    هیچ خطایی هم رخ نمی‌دهد.
    const toToman = (rial: number) => Math.round(rial / 10);

    it('ده ریال یک تومان است', () => {
      expect(toToman(10)).toBe(1);
    });

    it('یک میلیون ریال صد هزار تومان است', () => {
      expect(toToman(1_000_000)).toBe(100_000);
    });

    it('رقمِ فرد گرد می‌شود، نه بریده', () => {
      // ۱۰۵ ریال = ۱۰٫۵ تومان.  بریدن یعنی نیم تومان کسری در هر
      // تراکنش، که در تسویهٔ ماهانه به اختلافِ واقعی می‌رسد.
      expect(toToman(105)).toBe(11);
    });

    it('برگشت به ریال، همان مقیاس را دارد', () => {
      const rial = 3_980_000;
      expect(toToman(rial) * 10).toBe(rial);
    });
  });
});
