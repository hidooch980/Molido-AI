/**
 * استخراج قیمت از گفتار فارسی — برای تماس با بنکدار.
 *
 * مریم متن مکالمه را ذخیره می‌کرد ولی هیچ‌کس از آن قیمت درنمی‌آورد؛
 * اپراتور باید هر عدد را دستی تایپ می‌کرد.  یعنی «کارپرداز صوتی» در
 * عمل یک فرم دستی بود.
 *
 * ⚠️ این ماژول **پیشنهاد** می‌دهد، نه نتیجه.
 *
 *    قیمتی که اشتباه شنیده شود و خودکار ثبت شود، سفارش خرید را خراب
 *    می‌کند و کسی هم نمی‌فهمد چرا.  هر عدد باید پیش از ثبت به چشم
 *    اپراتور برسد — به‌ویژه آن‌هایی که این ماژول خودش مطمئن نیست.
 */

/** واحد پولی که در متن گفته شده. */
export type Unit = 'TOMAN' | 'RIAL' | 'UNKNOWN';

export type Extracted = {
  /** مبلغ به **ریال** — واحد داخلی سامانه. */
  rial: number;
  /** عددی که واقعاً گفته شد، پیش از تبدیل. */
  spoken: number;
  unit: Unit;
  /** بخشی از متن که این عدد از آن درآمد. */
  phrase: string;
  /**
   * چرا ممکن است اشتباه باشد.  خالی یعنی خواندنش روشن بود.
   *
   * اپراتور باید این‌ها را ببیند: عددی که با هشدار می‌آید، همان‌جایی
   * است که خطای ده‌برابری رخ می‌دهد.
   */
  warnings: string[];
};

const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** یکان تا صد — همان فهرستی که `speech.ts` دارد، به‌علاوهٔ صدگان. */
const ONES: Record<string, number> = {
  صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5,
  شش: 6, شیش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, پونزده: 15,
  شانزده: 16, شونزده: 16, هفده: 17, هیفده: 17, هجده: 18, هیجده: 18,
  نوزده: 19, نونزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50,
  شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90,
};

const HUNDREDS: Record<string, number> = {
  صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500,
  ششصد: 600, شیشصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900,
};

/** ضریب‌ها.  «میلیون» و «تومن» با هم می‌آیند و ترتیبشان مهم است. */
const SCALES: Record<string, number> = {
  هزار: 1_000,
  میلیون: 1_000_000,
  ملیون: 1_000_000,
  میلیارد: 1_000_000_000,
};

const TOMAN_WORDS = ['تومان', 'تومن', 'تومون'];
const RIAL_WORDS = ['ریال'];

/** رقم فارسی و عربی به لاتین؛ جداکنندهٔ هزارگان حذف می‌شود. */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)
    .replace(/(\d)[,،٬](?=\d{3}\b)/g, '$1')
    .replace(/‌/g, ' ');
}

/**
 * عدد فارسیِ نوشته‌شده با حروف را می‌خواند.
 *
 * «سی و دو هزار» ← ۳۲۰۰۰.  «دو میلیون و پانصد هزار» ← ۲٬۵۰۰٬۰۰۰.
 *
 * برخلاف `speech.ts` که فقط یک واژه را می‌فهمد، اینجا ترکیب لازم است:
 * قیمت بنکدار تقریباً هیچ‌وقت تک‌واژه‌ای نیست.
 */
export function parseWordNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;

  for (const raw of words) {
    const w = raw.trim();
    if (!w || w === 'و') continue;

    if (w in HUNDREDS) {
      current += HUNDREDS[w];
      seen = true;
      continue;
    }
    if (w in ONES) {
      current += ONES[w];
      seen = true;
      continue;
    }
    if (w in SCALES) {
      // «هزار» تنها یعنی ۱۰۰۰، نه ۰.
      const multiplier = SCALES[w];
      total += (current || 1) * multiplier;
      current = 0;
      seen = true;
      continue;
    }
    if (/^\d+$/.test(w)) {
      current += Number(w);
      seen = true;
      continue;
    }
    return seen ? total + current : null;
  }

  return seen ? total + current : null;
}

/**
 * تشخیص واحد از متن اطراف عدد.
 *
 * ⚠️ پیش‌فرض عمداً `UNKNOWN` است، نه تومان.
 *
 *    بنکدار ایرانی معمولاً تومان می‌گوید، ولی «معمولاً» برای پولِ کسی
 *    کافی نیست: اگر ریال گفته باشد و ما تومان بخوانیم، سفارش ده برابر
 *    ثبت می‌شود.  عددِ بی‌واحد باید به چشم اپراتور برسد.
 */
function detectUnit(context: string): Unit {
  if (TOMAN_WORDS.some((w) => context.includes(w))) return 'TOMAN';
  if (RIAL_WORDS.some((w) => context.includes(w))) return 'RIAL';
  return 'UNKNOWN';
}

/**
 * «سه تومن» چند است؟
 *
 * در گفتار روزمرهٔ ایران، «سه تومن» بسته به کالا می‌تواند سه هزار
 * تومان باشد یا سه میلیون.  این ابهام واقعی است و حل‌شدنی نیست — پس
 * حدس نمی‌زنیم، هشدار می‌دهیم.
 */
const SUSPICIOUSLY_SMALL = 1000;

/**
 * همهٔ مبلغ‌های متن.
 *
 * ترتیب حفظ می‌شود: بنکدار قیمت‌ها را به ترتیبِ کالاهایی می‌گوید که
 * پرسیده شده، و همان ترتیب تنها سرنخِ نگاشت است.
 */
export function extractAmounts(text: string): Extracted[] {
  const clean = normalizeDigits(text);
  const tokens = clean.split(/[\s،,.؛;]+/).filter(Boolean);
  const out: Extracted[] = [];

  let i = 0;
  while (i < tokens.length) {
    const isNumeric = (t: string) =>
      /^\d+$/.test(t) || t in ONES || t in HUNDREDS || t in SCALES;

    if (!isNumeric(tokens[i])) {
      i += 1;
      continue;
    }

    // بلوکِ پیوستهٔ عددی، به‌علاوهٔ «و» های میانی
    const start = i;
    let end = i;
    while (end < tokens.length) {
      if (isNumeric(tokens[end])) {
        end += 1;
        continue;
      }
      // «و» فقط وقتی جزو عدد است که بعدش باز عدد بیاید
      if (tokens[end] === 'و' && end + 1 < tokens.length && isNumeric(tokens[end + 1])) {
        end += 1;
        continue;
      }
      break;
    }

    const block = tokens.slice(start, end);
    const spoken = parseWordNumber(block);

    if (spoken !== null && spoken > 0) {
      // واحد از سه واژهٔ بعدی خوانده می‌شود: «سی هزار تومان کیلویی»
      const after = tokens.slice(end, end + 3).join(' ');
      const before = tokens.slice(Math.max(0, start - 2), start).join(' ');
      const unit = detectUnit(`${before} ${after}`);

      const warnings: string[] = [];
      if (unit === 'UNKNOWN') {
        warnings.push('واحد گفته نشد — تومان فرض شد');
      }
      if (spoken < SUSPICIOUSLY_SMALL) {
        // «سه تومن» ممکن است سه هزار باشد یا سه میلیون.
        warnings.push('عدد کوچک است؛ شاید «هزار» یا «میلیون» جا افتاده');
      }

      // واحد ناشناخته تومان فرض می‌شود چون گفتار بازار تومان است —
      // ولی هشدارش بالا ثبت شده و اپراتور می‌بیندش.
      const rial = unit === 'RIAL' ? spoken : spoken * 10;

      out.push({
        rial,
        spoken,
        unit,
        phrase: [...block, ...tokens.slice(end, end + 2)].join(' '),
        warnings,
      });
    }

    i = end > start ? end : start + 1;
  }

  return out;
}

export type QuoteSuggestion = {
  productId: string;
  productName: string;
  rial: number | null;
  spoken: number | null;
  unit: Unit;
  phrase: string;
  warnings: string[];
};

/**
 * نگاشت مبلغ‌ها به کالاهای استعلام.
 *
 * دو راه، به همین ترتیب:
 *
 *   ۱. **نام کالا در متن**.  «برنج سی و دو هزار» — مطمئن‌ترین حالت.
 *   ۲. **ترتیب**.  اگر نامی نیامد، مبلغِ n اُم به کالای n اُم می‌خورد،
 *      چون بنکدار به ترتیبِ پرسش جواب می‌دهد.
 *
 * راه دوم عمداً هشدار می‌گیرد: درست است ولی شکننده، و اپراتور باید
 * بداند این نگاشت حدسی است.
 */
export function suggestQuotes(
  transcript: string,
  products: Array<{ productId: string; productName: string }>,
): QuoteSuggestion[] {
  const clean = normalizeDigits(transcript);
  const amounts = extractAmounts(transcript);
  const used = new Set<number>();

  const blank = (p: { productId: string; productName: string }): QuoteSuggestion => ({
    productId: p.productId,
    productName: p.productName,
    rial: null,
    spoken: null,
    unit: 'UNKNOWN',
    phrase: '',
    warnings: [],
  });

  const result = products.map(blank);

  // ۱) نام کالا در متن
  products.forEach((product, index) => {
    // نام کامل کالا معمولاً گفته نمی‌شود («برنج ایرانی ۱۰ کیلویی» ←
    // «برنج»)، پس روی واژه‌های معنادارِ نام جست‌وجو می‌کنیم.
    const words = product.productName
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w));

    for (const word of words) {
      const at = clean.indexOf(word);
      if (at < 0) continue;

      // نزدیک‌ترین مبلغِ استفاده‌نشده پس از نام کالا
      const candidate = amounts.findIndex(
        (a, ai) => !used.has(ai) && clean.indexOf(a.phrase, at) >= at,
      );
      if (candidate >= 0) {
        used.add(candidate);
        const a = amounts[candidate];
        result[index] = {
          ...result[index],
          rial: a.rial,
          spoken: a.spoken,
          unit: a.unit,
          phrase: a.phrase,
          warnings: a.warnings,
        };
        break;
      }
    }
  });

  // ۲) ترتیب، برای آن‌هایی که هنوز خالی‌اند
  let cursor = 0;
  result.forEach((row, index) => {
    if (row.rial !== null) return;
    while (cursor < amounts.length && used.has(cursor)) cursor += 1;
    if (cursor >= amounts.length) return;

    const a = amounts[cursor];
    used.add(cursor);
    result[index] = {
      ...row,
      rial: a.rial,
      spoken: a.spoken,
      unit: a.unit,
      phrase: a.phrase,
      warnings: [...a.warnings, 'نام کالا در مکالمه نیامد؛ بر اساس ترتیب حدس زده شد'],
    };
  });

  return result;
}
