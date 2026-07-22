import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * سرویس ارسال پیامک (سازگار با کاوه‌نگار)
 *
 * اگر SMS_API_KEY تنظیم نشده باشد، پیامک شبیه‌سازی می‌شود
 * (در کنسول چاپ می‌شود) تا توسعه بدون پنل پیامکی ممکن باشد.
 */
@Injectable()
export class SmsService {
  constructor(private readonly configService: ConfigService) {}

  async send(to: string, message: string) {
    const apiKey = this.configService.get<string>('SMS_API_KEY');
    const sender = this.configService.get<string>('SMS_SENDER') || '10008663';

    if (!to || !message) {
      return { sent: false, error: 'شماره گیرنده و متن پیام الزامی است' };
    }

    if (!apiKey) {
      console.log(`📱 [SMS شبیه‌سازی‌شده] به ${to}: ${message}`);

      return {
        sent: false,
        simulated: true,
        to,
        message,
        hint: 'برای ارسال واقعی، SMS_API_KEY را در .env تنظیم کنید',
      };
    }

    try {
      const g = globalThis as never as {
        fetch: (url: string, init?: unknown) => Promise<{
          ok: boolean;
          json: () => Promise<unknown>;
        }>;
      };

      const params = [
        `receptor=${encodeURIComponent(to)}`,
        `sender=${encodeURIComponent(sender)}`,
        `message=${encodeURIComponent(message)}`,
      ].join('&');

      const response = await g.fetch(
        `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params,
        },
      );

      const data = await response.json().catch(() => null);

      return { sent: response.ok, provider: 'kavenegar', response: data };
    } catch (error) {
      return {
        sent: false,
        error: `خطا در ارسال پیامک: ${String(error)}`,
      };
    }
  }

  /**
   * ارسال گروهی
   */
  async sendBulk(recipients: Array<string>, message: string) {
    const results = [];

    for (const to of recipients) {
      results.push(await this.send(to, message));
    }

    return {
      total: recipients.length,
      sent: results.filter((r: any) => r.sent).length,
      results,
    };
  }
}
