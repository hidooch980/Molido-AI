/**
 * بازنویسی فارسی به املای بلوچی — عمداً خالص و بدون دیتابیس.
 *
 * چرا لازم است: واژه‌نامه هر چقدر بزرگ باشد، نام کالاهای یک فروشگاه
 * را کامل ندارد.  «شامپو سر و بدن» در هیچ فرهنگ بلوچی نیست.
 *
 * بلوچی حروف ویژهٔ عربی را ندارد؛ واژه‌های وام‌گرفته با حروف بلوچی
 * نوشته می‌شوند.  این یک قاعدهٔ املایی است، نه ترجمه — و همین تفاوت،
 * تمامِ ارزش این فایل است: قاعده را می‌شود مطمئن اجرا کرد، ترجمه را نه.
 *
 * خروجی **پیشنهاد** است نه نتیجه.  هیچ‌جا خودکار در `textTarget`
 * نوشته نمی‌شود: واژه‌ای که ماشین حدس زده و آدمی ندیده، بدتر از
 * واژهٔ خالی است — چون خالی را کسی پر می‌کند و حدسِ اشتباه را کسی
 * بازبینی نمی‌کند.
 */

/**
 * حروفی که در بلوچی نیستند و معادلشان.
 *
 * هر هشت‌تا آوایی دارند که در بلوچی با حرف دیگری نوشته می‌شود:
 * ث/ص همان «س» تلفظ می‌شوند، ذ/ض/ظ همان «ز»، ط همان «ت»، ح همان «ه».
 */
const LETTER_MAP: Record<string, string> = {
  ث: 'س',
  ص: 'س',
  ذ: 'ز',
  ض: 'ز',
  ظ: 'ز',
  ط: 'ت',
  ح: 'ه',
};

/** حروفی که در نوشتار بلوچی حذف می‌شوند. */
const DROPPED = 'ع';

/** نویسه‌های عربی که شکل فارسی/بلوچی دارند. */
const SHAPE_FIXES: Array<[RegExp, string]> = [
  [/ي/g, 'ی'],
  [/ك/g, 'ک'],
  [/[\u064B-\u0652]/g, ''],
];

export type Transliteration = {
  /** پیشنهاد املای بلوچی */
  suggestion: string;
  /** آیا اصلاً چیزی عوض شد */
  changed: boolean;
  /** کدام حروف عوض شدند — برای اینکه بازبین بفهمد چرا */
  notes: string[];
};

function transliterateWord(word: string): { out: string; notes: string[] } {
  const notes: string[] = [];
  let out = '';

  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];

    if (ch === DROPPED) {
      // «ع» آغازِ واژه به «ا» بدل می‌شود، وگرنه حذف.
      //
      // حذفِ کامل در آغاز، واژه را بی‌آغاز می‌کند: «عسل» می‌شد «سل».
      if (i === 0) {
        out += 'ا';
        notes.push('ع آغازین ← ا');
      } else {
        notes.push('ع حذف شد');
      }
      continue;
    }

    const mapped = LETTER_MAP[ch];
    if (mapped) {
      out += mapped;
      notes.push(`${ch} ← ${mapped}`);
      continue;
    }

    out += ch;
  }

  return { out, notes };
}

/**
 * بازنویسی یک عبارت.
 *
 * واژه‌به‌واژه است نه یک‌جا، چون قاعدهٔ «ع آغازین» به جایگاه در واژه
 * بستگی دارد و در «سعید علی» آن دو «ع» سرنوشت یکسانی ندارند.
 */
export function toBaluchiScript(text: string): Transliteration {
  let normalized = text.trim();
  for (const [pattern, replacement] of SHAPE_FIXES) {
    normalized = normalized.replace(pattern, replacement);
  }

  if (!normalized) return { suggestion: '', changed: false, notes: [] };

  const notes: string[] = [];
  const words = normalized.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part)) return part;
    const { out, notes: wordNotes } = transliterateWord(part);
    notes.push(...wordNotes);
    // واژه‌ای که پس از حذف چیزی نمی‌ماند، دست‌نخورده برمی‌گردد:
    // پیشنهادِ رشتهٔ خالی هیچ کمکی نیست.
    return out.trim() ? out : part;
  });

  const suggestion = words.join('').replace(/\s+/g, ' ').trim();

  return {
    suggestion,
    changed: suggestion !== normalized,
    // تکراری‌ها حذف می‌شوند: «ص ← س» سه بار، سه سطر گزارش نمی‌خواهد.
    notes: [...new Set(notes)],
  };
}

/**
 * آیا این واژه اصلاً بازنویسی لازم دارد؟
 *
 * برای رابط کاربری: عبارتی که هیچ حرف عربی ندارد، پیشنهاد نمی‌خواهد و
 * نشان دادنِ «پیشنهاد: همان چیزی که نوشتی» فقط کاربر را گیج می‌کند.
 */
export function needsTransliteration(text: string): boolean {
  return toBaluchiScript(text).changed;
}
