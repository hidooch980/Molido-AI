/**
 * آیکون‌های SVG — بدون هیچ کتابخانه.
 *
 * پیش از این همه‌جا emoji استفاده می‌شد.  سه ایراد داشت:
 *   • در هر سیستم‌عامل شکل و رنگ متفاوتی دارند و طراحی را بی‌ثبات می‌کنند
 *   • رنگشان ثابت است و با تم یا وضعیت (خطا، موفقیت) هماهنگ نمی‌شود
 *   • صفحه‌خوان‌ها آن‌ها را با نام کامل و بی‌ربط می‌خوانند
 *
 * مسیرها از مجموعهٔ Lucide (ISC) گرفته شده‌اند و درون‌خطی‌اند تا نه
 * وابستگی اضافه شود نه درخواست شبکه.  همه `currentColor` می‌گیرند، پس
 * رنگشان از متن والد می‌آید.
 */

export type IconName =
  | 'home'
  | 'pos'
  | 'restaurant'
  | 'package'
  | 'warehouse'
  | 'clipboard'
  | 'users'
  | 'receipt'
  | 'link'
  | 'agent'
  | 'target'
  | 'return'
  | 'ledger'
  | 'building'
  | 'calendar'
  | 'inbox'
  | 'bank'
  | 'chart'
  | 'tag'
  | 'user'
  | 'menu'
  | 'more'
  | 'logout'
  | 'refresh'
  | 'search'
  | 'plus'
  | 'check'
  | 'x'
  | 'alert'
  | 'clock'
  | 'money'
  | 'trendUp'
  | 'trendDown'
  | 'print'
  | 'settings'
  | 'moon'
  | 'sun';

/**
 * هر آیکون فقط بدنهٔ مسیر است؛ قاب مشترک در کامپوننت `Icon` می‌آید تا
 * اندازه، ضخامت خط و رفتار یکسان بمانند.
 */
const PATHS: Record<IconName, string> = {
  home: 'M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z',
  pos: 'M2 7h20v10H2zM2 11h20M6 15h4',
  restaurant: 'M4 3v7a3 3 0 0 0 6 0V3M7 10v11M18 3c-1.7 1.5-2 4-2 6s.3 3 2 3v9',
  package: 'M21 8v8l-9 5-9-5V8l9-5 9 5ZM3 8l9 5 9-5M12 13v8',
  warehouse: 'M3 21V9l9-5 9 5v12M3 21h18M8 21v-7h8v7M8 17h8',
  clipboard:
    'M9 3h6v3H9zM8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 12h6M9 16h4',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  receipt:
    'M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3l-2 1.5L15 3l-2 1.5L11 3 9 4.5 7 3 5 4.5ZM8 8h8M8 12h8M8 16h5',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19.5',
  agent:
    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 8l2 2 3-3',
  target:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  return: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v6',
  ledger:
    'M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V4ZM19 20H6M9 7h7M9 11h7',
  building:
    'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M4 21h16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4',
  calendar:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  inbox:
    'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5Z',
  bank: 'M3 10h18M5 10v9M9 10v9M15 10v9M19 10v9M2 21h20M12 2 2 7h20L12 2Z',
  chart: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-3',
  tag: 'M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  money: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 12h.01M18 12h.01',
  trendUp: 'M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6',
  trendDown: 'M22 17 13.5 8.5 8.5 13.5 2 7M16 17h6v-6',
  print:
    'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  // ماه و خورشید برای کلید تاریک/روشن.  دو آیکون جدا، نه یک آیکون
  // چرخان: کاربر باید ببیند «الان روشن است، بزن تا تاریک شود».
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const d = PATHS[name];
  if (!d) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      // آیکون همیشه تزئینی است و معنایش از متن کنارش می‌آید؛ اگر
      // صفحه‌خوان آن را هم بخواند، هر عنوان دو بار شنیده می‌شود.
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      <path d={d} />
    </svg>
  );
}
