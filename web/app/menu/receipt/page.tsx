import ReceiptClient from './ReceiptClient';

/**
 * رسیدِ بازگشت از درگاه — سرِ میز.
 *
 * ⚠️ ایندکس نمی‌شود: نشانی کدِ مهمان را دارد و آن کد تنها چیزی است
 *    که سفارشِ او را باز می‌کند.
 */
export const metadata = {
  title: 'نتیجهٔ پرداخت',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function MenuReceiptPage() {
  return <ReceiptClient />;
}
