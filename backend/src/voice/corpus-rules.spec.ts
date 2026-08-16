import {
  BASE_COMMANDS,
  BASE_NUMBERS,
  MIN_SAMPLES,
  MIN_SPEAKERS,
  gapsOf,
  readiness,
  type PhraseStat,
} from './corpus-rules';

function phrase(over: Partial<PhraseStat> = {}): PhraseStat {
  return {
    phraseId: 'p1',
    textFa: 'نان',
    textTarget: 'نگن',
    source: 'GATITOS',
    kind: 'PRODUCT',
    approved: MIN_SAMPLES,
    speakers: MIN_SPEAKERS,
    ...over,
  };
}

describe('gapsOf', () => {
  it('عبارت کامل، کمبود ندارد', () => {
    expect(gapsOf([phrase()])).toEqual([]);
  });

  it('ضبط کم، کمبود می‌سازد', () => {
    const [gap] = gapsOf([phrase({ approved: 2 })]);
    expect(gap.needSamples).toBe(3);
    expect(gap.reason).toContain('3 ضبط دیگر');
  });

  it('گویندهٔ کم، کمبود می‌سازد حتی وقتی ضبط زیاد است', () => {
    // صد ضبط از یک نفر، مدلی می‌سازد که فقط همان یک نفر را می‌شناسد.
    const [gap] = gapsOf([phrase({ approved: 100, speakers: 1 })]);
    expect(gap.needSpeakers).toBe(MIN_SPEAKERS - 1);
  });

  it('نبودِ متن بلوچی در دلیل گفته می‌شود', () => {
    const [gap] = gapsOf([phrase({ textTarget: null, approved: 1 })]);
    expect(gap.reason).toContain('متن بلوچی');
  });

  it('کمبود بیشتر، بالاتر می‌آید', () => {
    const gaps = gapsOf([
      phrase({ phraseId: 'a', approved: 4 }),
      phrase({ phraseId: 'b', approved: 0 }),
      phrase({ phraseId: 'c', approved: 2 }),
    ]);
    expect(gaps.map((g) => g.phraseId)).toEqual(['b', 'c', 'a']);
  });

  it('عبارت پرضبط ولی بی‌متن، همچنان کمبود است', () => {
    // ضبط بدون متنِ درست، دادهٔ آموزش نیست — جفتِ «صدا ← متن» ناقص است.
    // اگر اینجا کمبود شمرده نشود، درصدِ آمادگی زیر صد می‌ماند و هیچ
    // کاری برای رفعش نشان داده نمی‌شود.
    const gaps = gapsOf([phrase({ textTarget: null })]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe('متن بلوچی وارد نشده');
  });
});

describe('readiness', () => {
  it('پیکرهٔ خالی', () => {
    const r = readiness([], 0);
    expect(r.total).toBe(0);
    expect(r.canTrain).toBe(false);
    expect(r.advice).toContain('هنوز عبارتی');
  });

  it('اکثریت کافی نیست — همه باید کامل باشند', () => {
    // عبارتی که داده ندارد، در مدل به عبارت مشابهش نگاشت می‌شود:
    // صندوق‌دار «برنج» می‌گوید و «بربری» اضافه می‌شود.
    const stats = [
      phrase({ phraseId: 'a' }),
      phrase({ phraseId: 'b' }),
      phrase({ phraseId: 'c' }),
      phrase({ phraseId: 'd', approved: 1 }),
    ];
    const r = readiness(stats, 60 * 60_000);
    expect(r.percent).toBe(75);
    expect(r.canTrain).toBe(false);
  });

  it('همه کامل ولی صدا کم — شروع می‌شود، دقت بالا نه', () => {
    const r = readiness([phrase()], 5 * 60_000);
    expect(r.percent).toBe(100);
    expect(r.canTrain).toBe(true);
    expect(r.advice).toContain('برای دقت بالا نه');
  });

  it('همه کامل و صدا کافی', () => {
    const r = readiness([phrase()], 45 * 60_000);
    expect(r.canTrain).toBe(true);
    expect(r.minutes).toBe(45);
    expect(r.advice).toContain('آمادهٔ آموزش');
  });

  it('متن تأییدنشده آموزش‌پذیر نیست، حتی با ضبط کامل', () => {
    // این خطرناک‌ترین حالت است: ضبط‌ها کامل‌اند، آمار سبز به نظر
    // می‌رسد، ولی متنی که ضبط شده حدسِ ماشین است.  مدل یاد می‌گیرد
    // صدای «فلان» یعنی واژه‌ای که آن معنی را نمی‌دهد — و چون همه‌چیز
    // پر است، کسی دنبال علت نمی‌گردد.
    const r = readiness([phrase({ source: 'UNVERIFIED' })], 60 * 60_000);
    expect(r.ready).toBe(0);
    expect(r.canTrain).toBe(false);
  });

  it('وام‌واژه و مشتق آموزش‌پذیرند', () => {
    // «کارت» که عمداً فارسی مانده حدس نیست؛ تصمیم است.
    expect(readiness([phrase({ source: 'LOANWORD' })], 60 * 60_000).canTrain).toBe(true);
    expect(readiness([phrase({ source: 'DERIVED' })], 60 * 60_000).canTrain).toBe(true);
  });

  it('علتِ تأییدنشده در شکاف‌ها گفته می‌شود', () => {
    const gaps = gapsOf([phrase({ source: 'UNVERIFIED', approved: 0, speakers: 0 })]);
    expect(gaps[0].reason).toContain('تأییدنشده');
  });

  it('عبارت بدون متن بلوچی، کامل شمرده نمی‌شود', () => {
    const r = readiness([phrase({ textTarget: null })], 60 * 60_000);
    expect(r.ready).toBe(0);
    expect(r.canTrain).toBe(false);
  });

  it('جمع ضبط‌ها شمرده می‌شود', () => {
    const r = readiness([phrase({ approved: 7 }), phrase({ approved: 3 })], 0);
    expect(r.samples).toBe(10);
  });

  it('دقیقه از میلی‌ثانیه گرد می‌شود', () => {
    expect(readiness([phrase()], 90_000).minutes).toBe(2);
    expect(readiness([phrase()], 29_000).minutes).toBe(0);
  });
});

describe('BASE_NUMBERS', () => {
  it('سی عدد پایه دارد', () => {
    expect(BASE_NUMBERS).toHaveLength(30);
  });

  it('هر عدد، واژهٔ فارسی دارد', () => {
    // رقمِ تنها گفتنی نیست: کسی که «۳» را می‌بیند نمی‌داند فارسی‌اش
    // را بگوید یا بلوچی‌اش.
    for (const [value, word] of BASE_NUMBERS) {
      expect(typeof value).toBe('number');
      expect(word.trim().length).toBeGreaterThan(0);
      expect(word).not.toMatch(/[0-9]/);
    }
  });

  it('واژه‌ها تکراری نیستند', () => {
    // واژهٔ تکراری در پیکره یعنی دو ردیف برای یک صدا، و هیچ‌کدام به
    // حد نصاب نمی‌رسد.
    const words = BASE_NUMBERS.map(([, w]) => w);
    expect(new Set(words).size).toBe(words.length);
  });

  it('از یک شروع می‌شود و به هزار می‌رسد', () => {
    expect(BASE_NUMBERS[0]).toEqual([1, 'یک']);
    expect(BASE_NUMBERS[BASE_NUMBERS.length - 1]).toEqual([1000, 'هزار']);
  });
});

describe('BASE_COMMANDS', () => {
  it('پانزده عبارت دارد و تکراری نیست', () => {
    // ده عبارتِ تماس با بنکدار + پنج عبارتِ اعلام کسری به مدیر.
    expect(BASE_COMMANDS).toHaveLength(15);
    expect(new Set(BASE_COMMANDS).size).toBe(15);
  });

  it('عبارت‌های صندوق در پیکره نیستند', () => {
    // پیکره برای مریم است، نه صندوق.  «چاپ» و «لغو» در مکالمهٔ
    // تلفنی هیچ‌وقت گفته نمی‌شوند و ضبطشان وقتِ گوینده را می‌گرفت.
    for (const till of ['چاپ', 'لغو', 'پرداخت', 'نقدی', 'کارت']) {
      expect(BASE_COMMANDS).not.toContain(till);
    }
  });

  it('هر دو کارِ مریم پوشش دارند', () => {
    expect(BASE_COMMANDS).toContain('قیمت چند است');
    expect(BASE_COMMANDS).toContain('کم است');
  });

  it('با واژه‌های عددی تداخل ندارد', () => {
    // فرمانی که شبیه عدد باشد، وسط فروش اشتباه تشخیص داده می‌شود.
    const numbers = new Set(BASE_NUMBERS.map(([, w]) => w));
    for (const command of BASE_COMMANDS) {
      expect(numbers.has(command)).toBe(false);
    }
  });
});
