import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * صفحهٔ معرفیِ شرکت — ریشهٔ دامنه.
 *
 * ⚠️ چرا ریشه از صفحهٔ ورود گرفته شد؟
 *
 *    تا امروز `/` صفحهٔ ورودِ کارکنان بود.  یعنی هر بازدیدکننده‌ای —
 *    مشتریِ بالقوه، موتور جست‌وجو، یا کسی که لینک را جایی دیده — اول
 *    یک فرمِ رمز می‌دید.  برای سامانه‌ای که فقط داخلِ سازمان استفاده
 *    شود اشکالی ندارد؛ برای دامنهٔ عمومیِ شرکت بدترین صفحهٔ ممکن است.
 *
 *    ورود به `/panel` منتقل شد و از همین صفحه لینک دارد.
 *
 * ⚠️ این صفحه **سروری** است، نه `'use client'`.
 *
 *    محتوایش ثابت است و هیچ حالتی ندارد.  کلاینت کردنش یعنی
 *    بازدیدکننده باید جاوااسکریپتِ کلِ برنامه را دانلود کند تا یک
 *    صفحهٔ متنی ببیند — و موتور جست‌وجو هم چیزی برای خواندن پیدا
 *    نمی‌کند تا آن اجرا شود.
 *
 * ⚠️ متن‌ها اینجا مستقیم فارسی‌اند و این **عمدی** است.
 *
 *    نگهبانِ `audit-hardcoded-fa` پنل را می‌سنجد چون پنل سه‌زبانه
 *    است.  صفحهٔ معرفیِ یک شرکتِ ایرانی مخاطبِ فارسی‌زبان دارد؛
 *    سه‌زبانه کردنش کارِ بازاریابی است نه فنی، و وقتی لازم شد با
 *    مسیرهای `/en` و `/ar` انجام می‌شود نه با کلیدِ واژه‌نامه.
 */

const SITE =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  'https://molido.ir';

export const metadata: Metadata = {
  title: 'مولیدو | سامانهٔ یکپارچهٔ کسب‌وکار',
  description:
    'سامانهٔ فروشگاه، رستوران و فروش اینترنتی مولیدو — صندوق، انبار، حسابداری، منابع انسانی و گزارش‌های مدیریتی در یک جا.',
  // ⚠️ `metadataBase` لازم است وگرنه Next نشانی‌های نسبی در OpenGraph
  //    را با هشدار رها می‌کند و شبکه‌های اجتماعی تصویر را پیدا نمی‌کنند.
  metadataBase: new URL(SITE),
  openGraph: {
    title: 'مولیدو | سامانهٔ یکپارچهٔ کسب‌وکار',
    description:
      'صندوق فروشگاهی، مدیریت رستوران، فروشگاه اینترنتی، حسابداری و انبار — یکپارچه و فارسی.',
    url: SITE,
    siteName: 'مولیدو',
    locale: 'fa_IR',
    type: 'website',
  },
  alternates: { canonical: SITE },
};

/** آنچه واقعاً ساخته شده — نه فهرستِ آرزو. */
const FEATURES: { title: string; body: string }[] = [
  {
    title: 'صندوق فروشگاهی',
    body: 'بارکد، ترازو، شیفت صندوق‌دار، کالای وزنی، کلیدهای میان‌بر و کار در حالت آفلاین.',
  },
  {
    title: 'کافه و رستوران',
    body: 'میز و سالن، منو و رسپی، نمایشگر آشپزخانه، رزرو و تقسیم صورتحساب.',
  },
  {
    title: 'فروشگاه اینترنتی',
    body: 'کاتالوگ عمومی، سبد خرید، سفارش مشتری، نظرات خریداران و پیگیری سفارش.',
  },
  {
    title: 'انبار و خرید',
    body: 'چند انباره، انتقال، شمارش، بهای تمام‌شدهٔ میانگین موزون و پیشنهاد خودکار سفارش.',
  },
  {
    title: 'حسابداری',
    body: 'دفتر کل دوطرفه، خزانه، چک، دارایی و استهلاک، و صورت‌های مالی.',
  },
  {
    title: 'منابع انسانی',
    body: 'حضور و غیاب، حقوق و دستمزد، مرخصی، آموزش و ارزیابی عملکرد.',
  },
];

/** تصمیم‌های فنی‌ای که برای خریدار معنا دارند. */
const PILLARS: { title: string; body: string }[] = [
  {
    title: 'داده‌ها روی سرور شماست',
    body: 'نصب اختصاصی روی سرور خودتان یا سرور ما. پشتیبان‌گیری خودکار روزانه، هفتگی و ماهانه.',
  },
  {
    title: 'جداسازی واقعی',
    body: 'جداسازی شرکت‌ها در سطح خودِ پایگاه‌داده اعمال می‌شود، نه فقط در کد — یک شرط فراموش‌شده هم داده‌ای را نشت نمی‌دهد.',
  },
  {
    title: 'ورود دومرحله‌ای',
    body: 'رمز یک‌بارمصرف، کدهای بازیابی، قفل خودکار پس از تلاش‌های ناموفق و ابطال نشست از راه دور.',
  },
  {
    title: 'فارسی، عربی، انگلیسی',
    body: 'پنل کاملاً سه‌زبانه با چیدمان راست‌به‌چپ، تقویم شمسی و اعداد فارسی.',
  },
];

export default function HomePage() {
  return (
    <main style={PAGE}>
      <header style={HEADER}>
        <div style={BRAND}>
          <span style={LOGO} aria-hidden>
            م
          </span>
          <span style={{ fontWeight: 800, fontSize: 20 }}>مولیدو</span>
        </div>
        <nav style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/shop" style={BTN_GHOST}>
            فروشگاه
          </Link>
          <Link href="/panel" style={BTN_PRIMARY}>
            ورود به پنل
          </Link>
        </nav>
      </header>

      <section style={HERO}>
        <h1 style={H1}>سامانهٔ یکپارچهٔ کسب‌وکار</h1>
        <p style={LEAD}>
          فروشگاه، رستوران و فروش اینترنتی — صندوق، انبار، حسابداری و منابع
          انسانی در یک سامانه که فارسی نوشته شده و روی سرور خودتان اجرا می‌شود.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/panel" style={{ ...BTN_PRIMARY, padding: '13px 28px', fontSize: 16 }}>
            ورود به پنل
          </Link>
          <Link href="/shop" style={{ ...BTN_GHOST, padding: '13px 28px', fontSize: 16 }}>
            دیدن فروشگاه
          </Link>
        </div>
      </section>

      <section style={SECTION} aria-labelledby="features">
        <h2 id="features" style={H2}>
          چه چیزهایی دارد
        </h2>
        <div style={GRID}>
          {FEATURES.map((f) => (
            <article key={f.title} style={CARD}>
              <h3 style={H3}>{f.title}</h3>
              <p style={BODY}>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ ...SECTION, background: 'var(--surface)' }} aria-labelledby="pillars">
        <h2 id="pillars" style={H2}>
          چرا مولیدو
        </h2>
        <div style={GRID}>
          {PILLARS.map((p) => (
            <article key={p.title} style={CARD}>
              <h3 style={H3}>{p.title}</h3>
              <p style={BODY}>{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={SECTION} aria-labelledby="contact">
        <h2 id="contact" style={H2}>
          تماس
        </h2>
        <p style={{ ...BODY, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
          برای نمایش زنده یا مشاورهٔ راه‌اندازی با ما در تماس باشید.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
          {/*
            ⚠️ نشانی ایمیل واقعی است و باید بماند.
               پیشنهاد نمی‌کنم شمارهٔ تلفن ساختگی بگذارم — نبودنِ شماره
               بهتر از شماره‌ای است که کسی جواب نمی‌دهد.
          */}
          <a href="mailto:info@molido.ir" style={BTN_PRIMARY}>
            info@molido.ir
          </a>
        </div>
      </section>

      <footer style={FOOTER}>
        <span>© مولیدو</span>
        <span style={{ display: 'flex', gap: 14 }}>
          <Link href="/panel" style={FOOT_LINK}>
            ورود
          </Link>
          <Link href="/shop" style={FOOT_LINK}>
            فروشگاه
          </Link>
        </span>
      </footer>
    </main>
  );
}

const PAGE: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
  display: 'flex',
  flexDirection: 'column',
};

const HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  padding: '16px clamp(16px, 5vw, 56px)',
  borderBottom: '1px solid var(--border)',
};

const BRAND: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

const LOGO: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  background: 'var(--accent)',
  color: '#04121a',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 900,
  fontSize: 19,
};

const HERO: React.CSSProperties = {
  padding: 'clamp(48px, 9vw, 104px) clamp(16px, 5vw, 56px)',
  textAlign: 'center',
  display: 'grid',
  gap: 20,
  justifyItems: 'center',
};

// ⚠️ `clamp` به‌جای نقطهٔ شکست: عنوان روی موبایل نباید سه خط شود و
//    روی نمایشگر بزرگ هم نباید کوچک بماند.
const H1: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(28px, 5vw, 46px)',
  lineHeight: 1.25,
  fontWeight: 800,
};

const LEAD: React.CSSProperties = {
  margin: 0,
  maxWidth: 620,
  fontSize: 'clamp(15px, 2vw, 18px)',
  lineHeight: 2,
  color: 'var(--muted)',
};

const SECTION: React.CSSProperties = {
  padding: 'clamp(36px, 6vw, 72px) clamp(16px, 5vw, 56px)',
};

const H2: React.CSSProperties = {
  margin: '0 0 26px',
  fontSize: 'clamp(21px, 3vw, 28px)',
  textAlign: 'center',
  fontWeight: 800,
};

const GRID: React.CSSProperties = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))',
  maxWidth: 1100,
  margin: '0 auto',
};

const CARD: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 20,
};

const H3: React.CSSProperties = { margin: '0 0 8px', fontSize: 17, fontWeight: 700 };

const BODY: React.CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  lineHeight: 2,
  color: 'var(--muted)',
};

const BTN_PRIMARY: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  // ⚠️ ۴۴ پیکسل کفِ اندازهٔ هدفِ لمسی است؛ کمتر از آن روی موبایل
  //    قابل زدن نیست.
  minHeight: 44,
  padding: '11px 20px',
  borderRadius: 10,
  background: 'var(--accent)',
  color: '#04121a',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: 15,
};

const BTN_GHOST: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '11px 20px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  color: 'var(--text)',
  textDecoration: 'none',
  fontSize: 15,
};

const FOOTER: React.CSSProperties = {
  marginTop: 'auto',
  padding: '20px clamp(16px, 5vw, 56px)',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  color: 'var(--muted)',
  fontSize: 13.5,
};

const FOOT_LINK: React.CSSProperties = { color: 'var(--muted)', textDecoration: 'none' };
