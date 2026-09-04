'use client';

import Link from 'next/link';

import { Icon, type IconName } from './icons';
import { useI18n } from '../lib/i18n-context';

/**
 * میان‌برهای صفحهٔ اصلی.
 *
 * داشبورد آمار و اعلان داشت ولی هیچ راهِ کوتاهی به کار — یعنی
 * صندوق‌دار برای رسیدن به صندوق باید از نوار کناری می‌رفت، هر بار.
 *
 * ⚠️ ترتیب بر پایهٔ **کارِ روزانه** است، نه الفبا و نه ساختار ماژول‌ها.
 *
 *    صندوق و فاکتور اول‌اند چون بیشترین بار را دارند.  گزارش آخر است
 *    چون هفته‌ای یک بار باز می‌شود.  میان‌بری که در جای درست نباشد،
 *    همان مسیرِ طولانی است با یک کلیک اضافه.
 *
 * ⚠️ عمق سه‌بعدی **تزئین نیست** — نشانهٔ فشاردادنی بودن است.
 *
 *    کارت‌ها روی سطحِ صفحه بالا می‌آیند و با فشار پایین می‌روند، مثل
 *    کلیدِ واقعی.  هر چیزی بیش از این (چرخش، پرسپکتیوِ تند) روی
 *    صفحه‌ای که روزی صد بار باز می‌شود آزاردهنده می‌شود.
 *
 *    حرکت پشت `prefers-reduced-motion` است و هاور پشت
 *    `@media (hover: hover)` — روی لمسی `:hover` پس از ضربه می‌چسبد.
 */

/**
 * ⚠️ `icon` عمداً `IconName` است نه `string`.
 *
 *    نامِ آیکونِ اشتباه چیزی را نمی‌شکند — فقط جای خالی می‌گذارد، و
 *    کسی که کارت بی‌آیکون را می‌بیند فکر می‌کند صفحه کامل بارگذاری
 *    نشده.  با این تایپ، `tsc` همان لحظه می‌گیرد.
 */
type Shortcut = {
  href: string;
  icon: IconName;
  labelKey: string;
  /** رنگِ لبه — فقط برای تشخیصِ سریع، نه معنا. */
  tone: string;
};

const SHORTCUTS: Shortcut[] = [
  { href: '/pos', icon: 'pos', labelKey: 'scPos', tone: 'a' },
  { href: '/sales/new', icon: 'receipt', labelKey: 'scNewInvoice', tone: 'b' },
  { href: '/products', icon: 'package', labelKey: 'scProducts', tone: 'c' },
  { href: '/inventory', icon: 'warehouse', labelKey: 'scInventory', tone: 'd' },
  { href: '/count', icon: 'clipboard', labelKey: 'scCount', tone: 'e' },
  { href: '/purchasing', icon: 'agent', labelKey: 'scPurchasing', tone: 'f' },
  { href: '/customers', icon: 'users', labelKey: 'scCustomers', tone: 'a' },
  { href: '/reports', icon: 'chart', labelKey: 'scReports', tone: 'c' },
];

export default function ShortcutGrid() {
  const { t } = useI18n();

  return (
    <nav className="sc-grid" aria-label={t('scTitle')}>
      {SHORTCUTS.map((item) => (
        <Link key={item.href} href={item.href} className={`sc-tile sc-${item.tone}`}>
          <span className="sc-icon" aria-hidden="true">
            <Icon name={item.icon} size={26} />
          </span>
          <span className="sc-label">{t(item.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}
