/**
 * تصمیم CORS.
 *
 * مقدار ثابت `CORS_ORIGIN` برای استقرار روی شبکهٔ محلی جواب نمی‌دهد: پنل
 * از روی خود سرور با `localhost` باز می‌شود، از موبایل با IP، و شاید از
 * دستگاه دیگری با نام میزبان — و هر کدام یک مبدأ متفاوت است.  با یک مقدار
 * ثابت، همهٔ آن‌ها جز یکی «Failed to fetch» می‌گیرند.
 *
 * پس: هرچه در `CORS_ORIGIN` آمده (با کاما جدا) مجاز است، به‌علاوهٔ مبدأهای
 * شبکهٔ محلی.  اینترنت عمومی همچنان بسته می‌ماند — این سامانه قرار نیست
 * از بیرون در دسترس باشد.
 */
export function buildCorsCheck(configured?: string) {
  const allowList = (configured ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    // بدون مبدأ یعنی درخواست از مرورگر نیامده (curl، اپ موبایل، خود
    // سرور).  CORS اصلاً برای این حالت نیست و ردش کردن فقط ابزارها را
    // می‌شکند بی‌آنکه چیزی امن‌تر شود.
    if (!origin) return callback(null, true);

    if (allowList.includes(origin.replace(/\/$/, ''))) {
      return callback(null, true);
    }

    return callback(null, isLocalOrigin(origin));
  };
}

/** آیا این مبدأ روی همین دستگاه یا شبکهٔ محلی است. */
export function isLocalOrigin(origin: string): boolean {
  let host: string;

  try {
    host = new URL(origin).hostname;
  } catch {
    // مبدأ نامعتبر — چیزی که مرورگر می‌فرستد همیشه معتبر است، پس این
    // یعنی دستکاری‌شده و باید رد شود.
    return false;
  }

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;

  // `.local` برای mDNS (نام دستگاه در شبکهٔ خانگی/اداری)
  if (host.endsWith('.local')) return true;

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;

  // بازه‌های خصوصی RFC 1918 — تنها جایی که این سامانه قرار است دیده شود.
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}
