import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LlmMessage = { role: 'system' | 'user'; content: string };

/**
 * دروازهٔ مدل زبانی
 *
 * سامانه باید بدون اینترنت هم کامل کار کند، بنابراین مدل زبانی یک افزودنی
 * اختیاری است نه وابستگی.  هر جا در دسترس نباشد، صدا زننده به تحلیل محلی
 * برمی‌گردد.
 *
 * تنها یک واسط استاندارد پشتیبانی می‌شود — سازگار با OpenAI Chat Completions —
 * چون سرویس‌های داخلی و مدل‌های محلی (Ollama، vLLM، LM Studio و سرویس‌های
 * ایرانی) همگی همین واسط را ارائه می‌کنند.  بنابراین تعویض ارائه‌دهنده فقط
 * تغییر دو متغیر محیطی است، نه تغییر کد:
 *
 *   AI_BASE_URL   پیش‌فرض https://api.openai.com/v1
 *   AI_API_KEY    خالی یعنی مدل زبانی غیرفعال است
 *   AI_MODEL      پیش‌فرض gpt-4o-mini
 *   AI_TIMEOUT_MS پیش‌فرض ۲۰۰۰۰
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('AI_BASE_URL') ?? 'https://api.openai.com/v1'
    ).replace(/\/+$/, '');
    this.apiKey = this.config.get<string>('AI_API_KEY') ?? '';
    this.model = this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini';
    this.timeoutMs = Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 20_000);
  }

  /** آیا مدل زبانی پیکربندی شده است؟ */
  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  /** نامی که در پاسخ برگردانده می‌شود، تا منبع گزارش شفاف باشد. */
  get providerName(): string {
    return this.enabled ? `${this.model}` : 'internal';
  }

  /**
   * یک درخواست تکمیل متن.  در هر خطا — کلید نبودن، قطعی شبکه، مهلت تمام‌شده —
   * `null` برمی‌گرداند و هرگز استثنا پرتاب نمی‌کند؛ گزارش‌گیری نباید به‌خاطر
   * در دسترس نبودن مدل شکست بخورد.
   */
  async complete(messages: LlmMessage[], maxTokens = 500): Promise<string | null> {
    const data = await this.request({ messages, max_tokens: maxTokens });
    return data?.choices?.[0]?.message?.content?.trim() || null;
  }

  /**
   * انتخاب ابزار توسط مدل.
   *
   * به‌جای تکیه بر function-calling — که همهٔ سرویس‌های سازگار با OpenAI
   * پشتیبانی نمی‌کنند و شکل پاسخش یکسان نیست — از مدل خواسته می‌شود یک JSON
   * ساده برگرداند.  این کار سازگاری با مدل‌های محلی را حفظ می‌کند.
   */
  async chooseTool(
    question: string,
    catalogue: string,
  ): Promise<{ tool: string; args: Record<string, number | string> } | null> {
    const data = await this.request({
      messages: [
        {
          role: 'system',
          content:
            'تو یک مسیریاب هستی. بر اساس پرسش کاربر، از فهرست ابزارها دقیقاً یکی را ' +
            'انتخاب کن و فقط یک JSON بدون توضیح برگردان، با این شکل: ' +
            '{"tool":"نام_ابزار","args":{}}. ' +
            'اگر پرسش به هیچ ابزاری مربوط نیست، {"tool":"none","args":{}} برگردان.\n\n' +
            `فهرست ابزارها:\n${catalogue}`,
        },
        { role: 'user', content: question },
      ],
      max_tokens: 200,
      temperature: 0,
    });

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    // مدل‌های کوچک گاهی JSON را داخل ```json می‌پیچند
    const json = /\{[\s\S]*\}/.exec(text)?.[0];
    if (!json) return null;

    try {
      const parsed = JSON.parse(json) as {
        tool?: string;
        args?: Record<string, number | string>;
      };
      if (!parsed.tool || parsed.tool === 'none') return null;
      return { tool: parsed.tool, args: parsed.args ?? {} };
    } catch {
      return null;
    }
  }

  private async request(
    body: Record<string, unknown>,
  ): Promise<{ choices?: Array<{ message?: { content?: string } }> } | null> {
    if (!this.enabled) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, ...body }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`LLM request failed with HTTP ${response.status}`);
        return null;
      }

      return (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
    } catch (error) {
      this.logger.warn(
        `LLM request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
