/**
 * ورودی صوتی فارسی — بدون کتابخانه.
 *
 * از `SpeechRecognition` بومی مرورگر استفاده می‌کند.  در کروم و اج
 * موجود است؛ در فایرفاکس و سافاری قدیمی نه — و آنجا دکمه اصلاً نشان
 * داده نمی‌شود.  دکمه‌ای که کار نمی‌کند بدتر از نبودنش است.
 *
 * چرا بومی و نه سرویس ابری: صندوق فروشگاه روی شبکهٔ محلی کار می‌کند و
 * ممکن است اینترنت نداشته باشد.  مهم‌تر اینکه فرستادن صدای مکالمهٔ
 * فروشگاه به سرویس بیرونی، تصمیمی است که فروشنده باید بگیرد نه ما.
 */

/** فارسی ایران — تنها زبانی که این نسخه پشتیبانی می‌کند. */
export const SPEECH_LANG = 'fa-IR';

type RecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>;
  resultIndex: number;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

/** آیا مرورگر تشخیص گفتار دارد؟ */
export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as SpeechWindow;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * پاک‌سازی متن شنیده‌شده.
 *
 * موتور گفتار عدد را گاهی فارسی می‌نویسد و گاهی لاتین، و آخر جمله
 * نقطه می‌گذارد.  اگر همین متن مستقیم به جست‌وجوی کالا برود، «برنج.»
 * چیزی پیدا نمی‌کند.
 */
export function cleanTranscript(text: string): string {
  return text
    .replace(/[۰-۹٠-٩]/g, (d) => {
      const fa = PERSIAN_DIGITS.indexOf(d);
      return String(fa >= 0 ? fa : ARABIC_DIGITS.indexOf(d));
    })
    .replace(/[.،؛!؟]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * اعدادی که موتور گفتار به حروف می‌نویسد.
 *
 * «ده تا برنج» باید ۱۰ بشود.  فهرست عمداً کوتاه است — تا بیست و چند
 * عدد گرد، که ۹۹٪ کاربرد صندوق را می‌پوشاند.  فهرست کامل فارسی
 * («سیصد و چهل و دو») تجزیه‌گر می‌خواهد، و آن‌جا خطا بیشتر از سودش است.
 */
const WORD_NUMBERS: Record<string, number> = {
  یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5,
  شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15,
  شانزده: 16, هفده: 17, هجده: 18, نوزده: 19, بیست: 20,
  سی: 30, چهل: 40, پنجاه: 50, شصت: 60,
  هفتاد: 70, هشتاد: 80, نود: 90, صد: 100,
};

/**
 * جدا کردن «مقدار» از «نام کالا».
 *
 * صندوق‌دار می‌گوید «سه تا نان» یا «۲ برنج».  بدون این، کل جمله به
 * جست‌وجوی کالا می‌رود و چیزی پیدا نمی‌شود.
 *
 * اگر عددی پیدا نشد، `qty` برابر `null` است — نه ۱.  تفاوتش مهم است:
 * فراخوان باید بداند کاربر مقدار **نگفته**، تا مقدار پیش‌فرض خودش را
 * بگذارد.
 */
export function parseVoiceCommand(text: string): { qty: number | null; term: string } {
  const clean = cleanTranscript(text);

  // عدد لاتین در ابتدا: «۳ برنج» یا «3 برنج»
  const digits = clean.match(/^(\d+(?:\.\d+)?)\s*(?:تا|عدد|کیلو|کارتن)?\s*(.*)$/);
  if (digits && digits[2].trim()) {
    return { qty: Number(digits[1]), term: digits[2].trim() };
  }

  // عدد به حروف: «سه تا نان»
  const words = clean.split(/\s+/);
  const first = words[0];
  if (first && first in WORD_NUMBERS && words.length > 1) {
    const rest = words.slice(1).filter((w) => !['تا', 'عدد', 'کیلو', 'کارتن'].includes(w));
    if (rest.length) {
      return { qty: WORD_NUMBERS[first], term: rest.join(' ') };
    }
  }

  return { qty: null, term: clean };
}

export type ListenHandle = { stop: () => void };

/**
 * یک بار گوش دادن.
 *
 * `continuous: false` عمدی است: صندوق‌دار یک جمله می‌گوید و انتظار دارد
 * تمام شود.  حالت پیوسته میکروفن را باز نگه می‌دارد و هم باتری تبلت را
 * می‌خورد و هم مکالمهٔ مشتری بعدی را می‌شنود.
 */
export function listenOnce(
  onResult: (text: string) => void,
  onError?: (message: string) => void,
): ListenHandle | null {
  if (!isSpeechSupported()) {
    onError?.('مرورگر شما تشخیص گفتار ندارد');
    return null;
  }

  const w = window as SpeechWindow;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition!;
  const recognition = new Ctor();

  recognition.lang = SPEECH_LANG;
  recognition.continuous = false;
  recognition.interimResults = false;
  // سه گزینه: موتور گاهی نام کالا را اشتباه می‌شنود و گزینهٔ دوم درست
  // است.  فعلاً فقط اولی استفاده می‌شود، ولی گرفتنشان هزینه‌ای ندارد.
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const best = result?.[0]?.transcript;
    if (best) onResult(cleanTranscript(best));
  };

  recognition.onerror = (event) => {
    const messages: Record<string, string> = {
      'no-speech': 'صدایی شنیده نشد',
      'audio-capture': 'میکروفن پیدا نشد',
      'not-allowed': 'دسترسی به میکروفن داده نشده',
      network: 'تشخیص گفتار به اینترنت نیاز دارد',
    };
    onError?.(messages[event.error] ?? 'تشخیص گفتار ناموفق بود');
  };

  try {
    recognition.start();
  } catch {
    // `start()` روی نمونه‌ای که هنوز متوقف نشده استثنا می‌دهد.
    onError?.('میکروفن در حال استفاده است');
    return null;
  }

  return { stop: () => recognition.abort() };
}
