import {
  normalizePhone,
  prepareRecipients,
  renderTemplate,
  segmentCount,
  toLatinDigits,
  totalSegments,
} from './sms-rules';

describe('نرمال‌سازی شماره', () => {
  it('شکل استاندارد را دست‌نخورده برمی‌گرداند', () => {
    expect(normalizePhone('09121234567')).toBe('09121234567');
  });

  it('ارقام فارسی را می‌پذیرد', () => {
    // مشتری با کیبورد فارسی تایپ می‌کند؛ بدون این، شماره‌اش نامعتبر است.
    expect(normalizePhone('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
  });

  it('ارقام عربی را می‌پذیرد', () => {
    expect(normalizePhone('٠٩١٢١٢٣٤٥٦٧')).toBe('09121234567');
  });

  it('پیش‌شمارهٔ +98 را تبدیل می‌کند', () => {
    expect(normalizePhone('+989121234567')).toBe('09121234567');
  });

  it('پیش‌شمارهٔ 0098 را تبدیل می‌کند', () => {
    expect(normalizePhone('00989121234567')).toBe('09121234567');
  });

  it('۹۸ بدون صفر را تبدیل می‌کند', () => {
    expect(normalizePhone('989121234567')).toBe('09121234567');
  });

  it('بدون صفر ابتدایی را تبدیل می‌کند', () => {
    expect(normalizePhone('9121234567')).toBe('09121234567');
  });

  it('خط تیره و فاصله را نادیده می‌گیرد', () => {
    expect(normalizePhone('0912-123-4567')).toBe('09121234567');
    expect(normalizePhone(' 0912 123 4567 ')).toBe('09121234567');
  });

  it('شمارهٔ ثابت را رد می‌کند', () => {
    expect(normalizePhone('02112345678')).toBeNull();
  });

  it('شمارهٔ کوتاه و بلند را رد می‌کند', () => {
    expect(normalizePhone('0912123456')).toBeNull();
    expect(normalizePhone('091212345678')).toBeNull();
  });

  it('ورودی خالی و نامعتبر را رد می‌کند', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('سلام')).toBeNull();
  });
});

describe('تبدیل ارقام', () => {
  it('فارسی و عربی را با هم تبدیل می‌کند', () => {
    expect(toLatinDigits('۱۲۳٤٥٦')).toBe('123456');
  });

  it('متن غیرعددی را دست نمی‌زند', () => {
    expect(toLatinDigits('تخفیف ۲۰٪')).toBe('تخفیف 20٪');
  });
});

describe('قالب پیام', () => {
  it('متغیر را جای‌گذاری می‌کند', () => {
    expect(renderTemplate('سلام {name} عزیز', { name: 'رضا' })).toBe('سلام رضا عزیز');
  });

  it('متغیر ناشناخته را خالی می‌گذارد، نه {name}', () => {
    // دیدن «سلام {name} عزیز» روی گوشی مشتری بدتر از «سلام عزیز» است.
    expect(renderTemplate('سلام {unknown} عزیز', {})).toBe('سلام عزیز');
  });

  it('فاصله‌های اضافیِ ناشی از جای‌گذاری خالی را جمع می‌کند', () => {
    expect(renderTemplate('کد {code} شما', { code: '' })).toBe('کد شما');
  });

  it('عدد را به متن تبدیل می‌کند', () => {
    expect(renderTemplate('{pct} درصد', { pct: 20 })).toBe('20 درصد');
  });
});

describe('شمارش قبض', () => {
  it('پیام خالی صفر قبض است', () => {
    expect(segmentCount('')).toBe(0);
  });

  it('لاتین تا ۱۶۰ نویسه یک قبض', () => {
    expect(segmentCount('a'.repeat(160))).toBe(1);
    expect(segmentCount('a'.repeat(161))).toBe(2);
  });

  it('فارسی تا ۷۰ نویسه یک قبض', () => {
    // مرز مهم است: یک نویسه بیشتر یعنی هزینهٔ دو برابر روی هر مشتری.
    expect(segmentCount('ا'.repeat(70))).toBe(1);
    expect(segmentCount('ا'.repeat(71))).toBe(2);
  });

  it('فارسی چندبخشی با ۶۷ نویسه در هر بخش شمرده می‌شود', () => {
    expect(segmentCount('ا'.repeat(134))).toBe(2);
    expect(segmentCount('ا'.repeat(135))).toBe(3);
  });

  it('یک نویسهٔ فارسی کل پیام را یونیکد می‌کند', () => {
    // متن انگلیسی با یک «ی» وسطش، دیگر GSM-7 نیست.
    expect(segmentCount('a'.repeat(100))).toBe(1);
    expect(segmentCount(`${'a'.repeat(100)}ی`)).toBe(2);
  });
});

describe('آماده‌سازی مخاطبان', () => {
  const T = 'سلام {name}';

  it('شماره‌ها را نرمال می‌کند', () => {
    const { send } = prepareRecipients([{ phone: '۰۹۱۲۱۱۱۲۲۳۳', name: 'الف' }], T);
    expect(send[0].phone).toBe('09121112233');
  });

  it('مشتری منصرف‌شده پیام نمی‌گیرد', () => {
    // فرستادن پس از انصراف هم شکایت می‌آورد هم سرشمارهٔ فروشگاه را می‌سوزاند.
    const { send, skipped } = prepareRecipients(
      [{ phone: '09121112233', smsOptOut: true }],
      T,
    );
    expect(send).toHaveLength(0);
    expect(skipped[0].reason).toBe('OPTED_OUT');
  });

  it('شمارهٔ نامعتبر جدا می‌شود، نه اینکه بی‌صدا حذف', () => {
    const { send, skipped } = prepareRecipients([{ phone: '021123' }], T);
    expect(send).toHaveLength(0);
    expect(skipped[0].reason).toBe('INVALID_PHONE');
  });

  it('شمارهٔ تکراری فقط یک پیام می‌گیرد', () => {
    const { send, skipped } = prepareRecipients(
      [
        { phone: '09121112233', name: 'الف' },
        { phone: '+989121112233', name: 'ب' },
      ],
      T,
    );
    expect(send).toHaveLength(1);
    expect(skipped[0].reason).toBe('DUPLICATE');
  });

  it('نام هر مشتری در پیام خودش می‌نشیند', () => {
    const { send } = prepareRecipients(
      [
        { phone: '09121112233', name: 'رضا' },
        { phone: '09121112244', name: 'سارا' },
      ],
      T,
    );
    expect(send.map((s) => s.body)).toEqual(['سلام رضا', 'سلام سارا']);
  });

  it('متغیر مشترک به همه می‌رسد', () => {
    const { send } = prepareRecipients(
      [{ phone: '09121112233', name: 'رضا' }],
      'کد {code} برای {name}',
      { code: 'EID20' },
    );
    expect(send[0].body).toBe('کد EID20 برای رضا');
  });

  it('جمع قبض‌ها برای برآورد هزینه', () => {
    const { send } = prepareRecipients(
      [
        { phone: '09121112233', name: 'الف' },
        { phone: '09121112244', name: 'ب' },
      ],
      'ا'.repeat(80),
    );
    expect(totalSegments(send)).toBe(4);
  });

  it('فهرست خالی خطا نمی‌دهد', () => {
    expect(prepareRecipients([], T)).toEqual({ send: [], skipped: [] });
  });
});
