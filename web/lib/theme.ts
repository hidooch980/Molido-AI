/**
 * پوستهٔ پنل.
 *
 * انتخاب **در مرورگر هر کاربر** می‌ماند، نه روی سرور: صندوق‌دارِ شیفت شب
 * و مدیری که تمام روز گزارش می‌خواند، روی یک نصب و با یک حساب هم ممکن
 * است دو پوستهٔ متفاوت بخواهند.  ذخیره روی سرور یعنی هر بار که یکی عوض
 * می‌کند، برای دیگری هم عوض شود.
 */

export type ThemeKey = 'minimal' | 'night' | 'turquoise' | 'paper' | 'classic';

/**
 * انتخاب کاربر — که با پوستهٔ اعمال‌شده یکی نیست.
 *
 * «خودکار» یعنی هرچه سیستم‌عامل می‌گوید.  نگه‌داشتنِ خودِ انتخاب (نه
 * نتیجه‌اش) لازم است: اگر فقط پوستهٔ حاصل ذخیره شود، کاربری که شب
 * تاریک را دیده، فردا صبح هم تاریک می‌ماند در حالی که سیستمش روشن
 * شده — و دلیلش هیچ‌جا معلوم نیست.
 */
export type ThemeChoice = ThemeKey | 'auto';

const CHOICE_KEY = 'molido_theme_choice';

/** پوستهٔ روشن و تاریکِ حالت خودکار. */
const AUTO_LIGHT: ThemeKey = 'minimal';
const AUTO_DARK: ThemeKey = 'night';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** پوسته‌ای که «خودکار» همین الان به آن می‌رسد. */
export function autoTheme(): ThemeKey {
  return systemPrefersDark() ? AUTO_DARK : AUTO_LIGHT;
}

export function currentChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto';

  const saved = window.localStorage.getItem(CHOICE_KEY) as ThemeChoice | null;
  if (saved === 'auto') return 'auto';
  if (saved && THEMES.some((item) => item.key === saved)) return saved;

  // نصب‌های قدیمی فقط پوسته را ذخیره کرده‌اند؛ همان را انتخابِ صریح
  // حساب می‌کنیم تا ظاهرشان با به‌روزرسانی عوض نشود.
  const legacy = window.localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
  return legacy && THEMES.some((item) => item.key === legacy) ? legacy : 'auto';
}

export function setChoice(choice: ThemeChoice): void {
  window.localStorage.setItem(CHOICE_KEY, choice);
  const theme = choice === 'auto' ? autoTheme() : choice;
  window.localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
}

/** آیا پوستهٔ فعلی تاریک است — برای آیکون کلید سریع. */
export function isDark(theme: ThemeKey): boolean {
  return theme === 'night';
}

/**
 * دنبال‌کردن تغییر تنظیم سیستم.
 *
 * فقط وقتی انتخاب «خودکار» است اثر دارد.  تابعِ لغو برمی‌گرداند تا در
 * `useEffect` پاک شود؛ بدون آن، هر بار رندر یک شنونده اضافه می‌شود.
 */
export function watchSystemTheme(onChange: (theme: ThemeKey) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (currentChoice() !== 'auto') return;
    const theme = autoTheme();
    window.localStorage.setItem(STORAGE_KEY, theme);
    apply(theme);
    onChange(theme);
  };

  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

export type Theme = {
  key: ThemeKey;
  /** کلید ترجمه، نه خود متن. */
  label: string;
  /** رنگ نمونه برای انتخابگر — دیدنش سریع‌تر از خواندن نام است. */
  swatch: string;
  hint: string;
};

export const THEMES: Theme[] = [
  {
    key: 'minimal',
    label: 'themeMinimal',
    swatch: '#1f5eff',
    hint: 'themeMinimalHint',
  },
  {
    key: 'night',
    label: 'themeNight',
    swatch: '#12a67f',
    hint: 'themeNightHint',
  },
  {
    key: 'turquoise',
    label: 'themeTurquoise',
    swatch: '#047857',
    hint: 'themeTurquoiseHint',
  },
  {
    key: 'paper',
    label: 'themePaper',
    swatch: '#111111',
    hint: 'themePaperHint',
  },
  {
    key: 'classic',
    label: 'themeClassic',
    swatch: '#6366f1',
    hint: 'themeClassicHint',
  },
];

/**
 * پیش‌فرض: مینیمال سرد.
 *
 * پنل صفحه‌هایی با سی ردیف داده دارد و هر رنگ اضافه یک حواس‌پرتی است.
 * کسی که چیز دیگری بخواهد، عوضش می‌کند.
 */
const DEFAULT: ThemeKey = 'minimal';

const STORAGE_KEY = 'molido_theme';
const ACCENT_KEY = 'molido_accent';
const DENSITY_KEY = 'molido_density';

/**
 * شخصی‌سازی روی پوسته.
 *
 * پوسته نقطهٔ شروع است؛ این‌ها آن را تنظیم می‌کنند بی‌آنکه پوستهٔ تازه
 * لازم باشد.  رنگ اصلی و فشردگی، دو چیزی هستند که کاربران واقعاً عوض
 * می‌کنند — بقیه سلیقهٔ طراح است نه نیاز کاربر.
 */
export type Density = 'compact' | 'normal' | 'relaxed';

/** فاصله‌های پایه در هر فشردگی. */
const DENSITY_SCALE: Record<Density, { pad: string; row: string; font: string }> = {
  compact: { pad: '14px', row: '6px', font: '13px' },
  normal: { pad: '22px', row: '10px', font: '14px' },
  relaxed: { pad: '30px', row: '15px', font: '15px' },
};

/** `classic` همان طرح اولیه است و توکن‌های `:root` را دست‌نخورده می‌گذارد. */
function apply(theme: ThemeKey): void {
  const root = document.documentElement;

  if (theme === 'classic') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/**
 * رنگ اصلی دلخواه.
 *
 * روی توکن‌های پوسته می‌نشیند نه جایشان: پوسته زمینه و مرز را تعیین
 * می‌کند، این فقط رنگ کنش را عوض می‌کند.  جدا نگه داشتنشان یعنی هر رنگی
 * با هر پوسته‌ای کار کند.
 */
function applyAccent(color: string | null): void {
  const root = document.documentElement;

  if (!color) {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-2');
    root.style.removeProperty('--ring');
    root.style.removeProperty('--nav-active-border');
    return;
  }

  root.style.setProperty('--primary', color);
  root.style.setProperty('--primary-2', color);
  root.style.setProperty('--ring', `color-mix(in srgb, ${color} 25%, transparent)`);
  root.style.setProperty(
    '--nav-active-border',
    `color-mix(in srgb, ${color} 40%, transparent)`,
  );
}

function applyDensity(density: Density): void {
  const scale = DENSITY_SCALE[density];
  const root = document.documentElement;

  root.style.setProperty('--pad-card', scale.pad);
  root.style.setProperty('--pad-row', scale.row);
  root.style.setProperty('--font-base', scale.font);
}

export function currentAccent(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCENT_KEY);
}

export function setAccent(color: string | null): void {
  if (color) window.localStorage.setItem(ACCENT_KEY, color);
  else window.localStorage.removeItem(ACCENT_KEY);

  applyAccent(color);
}

export function currentDensity(): Density {
  if (typeof window === 'undefined') return 'normal';

  const saved = window.localStorage.getItem(DENSITY_KEY) as Density | null;
  return saved && saved in DENSITY_SCALE ? saved : 'normal';
}

export function setDensity(density: Density): void {
  window.localStorage.setItem(DENSITY_KEY, density);
  applyDensity(density);
}

export function currentTheme(): ThemeKey {
  if (typeof window === 'undefined') return DEFAULT;

  const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
  return saved && THEMES.some((item) => item.key === saved) ? saved : DEFAULT;
}

export function setTheme(theme: ThemeKey): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
}

/**
 * اعمال پوستهٔ ذخیره‌شده هنگام بالا آمدن.
 *
 * روی سرور اجرا نمی‌شود؛ فراخوانی‌اش باید داخل `useEffect` باشد وگرنه
 * رندر سرور و کلاینت با هم فرق می‌کنند و React اخطار می‌دهد.
 */
export function loadTheme(): ThemeKey {
  // انتخاب کاربر ملاک است، نه پوستهٔ ذخیره‌شده: با «خودکار»، پوستهٔ
  // دیشب نباید امروز صبح هم بماند.
  const choice = currentChoice();
  const theme = choice === 'auto' ? autoTheme() : choice;

  apply(theme);
  // ترتیب مهم است: پوسته اول، بعد شخصی‌سازی — وگرنه توکن‌های پوسته روی
  // رنگ دلخواه کاربر می‌نویسند.
  applyAccent(currentAccent());
  applyDensity(currentDensity());

  return theme;
}
