'use client';

/**
 * صفحهٔ آشپزخانه (KDS).
 *
 * تا امروز سفارش به آشپزخانه فرستاده می‌شد و **هیچ‌کس نمی‌دیدش** —
 * API از اول بود، صفحه‌اش نبود.
 *
 * این صفحه سه شرط دارد که با بقیهٔ صفحه‌های سامانه فرق می‌کند:
 *
 * ۱. از **فاصله** خوانده می‌شود.  آشپز پشت اجاق است نه پشت میز، پس
 *    متن بزرگ است و کارت‌ها درشت.
 *
 * ۲. با **دستِ چرب** لمس می‌شود.  دکمه‌ها بزرگ‌اند و هیچ کاری به
 *    هدف‌گیری دقیق نیاز ندارد.
 *
 * ۳. **خودش تازه می‌شود**.  آشپز وقت ندارد صفحه را نو کند؛ سفارشی که
 *    دیر دیده شود، غذای سرد است.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../../components/AppShell';
import { api } from '../../../lib/api';

type Item = {
  id: string;
  orderId: string;
  orderNo: string;
  orderType: string;
  tableNo: string | null;
  name: string;
  qty: string | number;
  status: 'PREPARING' | 'READY';
  station: string | null;
  note: string | null;
  waitingMinutes: number;
};

const ORDER_TYPE: Record<string, string> = {
  DINE_IN: 'سالن',
  TAKEAWAY: 'بیرون‌بر',
  DELIVERY: 'دلیوری',
};

/**
 * آستانه‌های هشدار انتظار.
 *
 * ده دقیقه برای غذای گرم پذیرفتنی است؛ بیست دقیقه یعنی مشتری منتظر
 * است و کسی باید بداند.  رنگ عمداً از سبز به قرمز نمی‌پرد — مرحلهٔ
 * میانی همان‌جایی است که هنوز می‌شود جبران کرد.
 */
const WARN_MINUTES = 10;
const LATE_MINUTES = 20;

/**
 * تعداد از پستگرس رشتهٔ `numeric` است: «2.00» نه 2.
 *
 * نوشتن «۲.۰۰ × چلوکباب» روی تختهٔ آشپزخانه غلط به نظر می‌رسد، ولی
 * «۱.۵ کیلو» درست است — پس صفرهای انتهایی می‌روند، اعشار واقعی می‌ماند.
 */
function showQty(qty: string | number): string {
  const n = Number(qty);
  if (!Number.isFinite(n)) return String(qty);
  return String(Number(n.toFixed(3)));
}

function waitColor(minutes: number): string {
  if (minutes >= LATE_MINUTES) return '#b91c1c';
  if (minutes >= WARN_MINUTES) return '#b45309';
  return '#047857';
}

export default function KitchenPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [station, setStation] = useState('');
  const [stations, setStations] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastLoad, setLastLoad] = useState<Date | null>(null);

  /**
   * بارگذاری بدون پاک کردن صفحه.
   *
   * اگر هنگام تازه‌سازی فهرست خالی شود، آشپز لحظه‌ای صفحهٔ سفید
   * می‌بیند و فکر می‌کند سفارشی نیست.
   */
  const load = useCallback(async () => {
    try {
      // عمداً **بدون** پارامتر ایستگاه: تختهٔ آشپزخانه چند ده قلم است،
      // نه چند هزار.  گرفتن کاملِ آن و فیلتر کردن در خود صفحه دو چیز
      // را درست می‌کند که نسخهٔ اول هر دو را خراب کرده بود:
      //
      // ۱. دکمه‌های ایستگاه از پاسخ ساخته می‌شوند؛ اگر پاسخ فیلترشده
      //    باشد، فیلتر روی «COLD» بقیهٔ دکمه‌ها را محو می‌کرد و آشپز
      //    برای رفتن به ایستگاه دیگر باید اول «همه» را می‌زد.
      //
      // ۲. تعویض ایستگاه دیگر رفت‌وبرگشت شبکه ندارد — فوری است، که
      //    پشت اجاق همان چیزی است که اهمیت دارد.
      const data = await api<Item[]>('/restaurant/kitchen');
      setItems(data);
      setLastLoad(new Date());
      setError('');

      const found = [...new Set(data.map((i) => i.station).filter(Boolean))] as string[];
      setStations((prev) => (found.length ? found : prev));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * تازه‌سازی خودکار هر ده ثانیه.
   *
   * `load` وابستگی ندارد و پایدار است، پس تایمر یک بار ساخته می‌شود و
   * با تغییر ایستگاه بازسازی نمی‌شود — وگرنه شمارش هر بار از صفر
   * شروع می‌شد و سفارش تازه دیرتر دیده می‌شد.
   */
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const setStatus = async (item: Item, status: 'READY' | 'SERVED') => {
    setBusy(item.id);
    try {
      await api(`/restaurant/kitchen/items/${item.id}`, {
        method: 'PATCH',
        body: { status },
      });
      // حذف خوش‌بینانه: آشپز باید فوری ببیند قلم رفت، نه اینکه ده
      // ثانیه تا تازه‌سازی بعدی منتظر بماند.
      setItems((prev) =>
        status === 'SERVED'
          ? prev.filter((x) => x.id !== item.id)
          : prev.map((x) => (x.id === item.id ? { ...x, status } : x)),
      );
    } catch (caught) {
      setError((caught as Error).message);
      void load();
    } finally {
      setBusy(null);
    }
  };

  const visible = station ? items.filter((i) => i.station === station) : items;
  const preparing = visible.filter((i) => i.status === 'PREPARING');
  const ready = visible.filter((i) => i.status === 'READY');

  return (
    <AppShell title="آشپزخانه">
      <div style={{ display: 'grid', gap: 16 }}>
        <header
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StationButton active={!station} onClick={() => setStation('')}>
              همه
            </StationButton>
            {stations.map((s) => (
              <StationButton key={s} active={station === s} onClick={() => setStation(s)}>
                {s}
              </StationButton>
            ))}
          </div>

          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            {lastLoad
              ? `به‌روز شد ${lastLoad.toLocaleTimeString('fa-IR')}`
              : 'در حال بارگذاری…'}
          </div>
        </header>

        {error ? (
          <div role="alert" style={{ padding: 12, borderRadius: 10, background: '#b91c1c22' }}>
            {error}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p style={{ fontSize: 24, textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
            سفارشی در انتظار نیست
          </p>
        ) : null}

        <Board title={`در حال آماده‌سازی (${preparing.length})`}>
          {preparing.map((item) => (
            <Card
              key={item.id}
              item={item}
              busy={busy === item.id}
              action="آماده شد"
              onAction={() => setStatus(item, 'READY')}
            />
          ))}
        </Board>

        {ready.length > 0 ? (
          <Board title={`آمادهٔ تحویل (${ready.length})`}>
            {ready.map((item) => (
              <Card
                key={item.id}
                item={item}
                busy={busy === item.id}
                action="تحویل شد"
                onAction={() => setStatus(item, 'SERVED')}
                ready
              />
            ))}
          </Board>
        ) : null}
      </div>
    </AppShell>
  );
}

function StationButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 52,
        padding: '12px 22px',
        fontSize: 17,
        borderRadius: 12,
        cursor: 'pointer',
        border: '1px solid var(--border)',
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text)',
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
    </button>
  );
}

function Board({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && items.length === 0) return null;

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ fontSize: 19, margin: 0 }}>{title}</h2>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Card({
  item,
  busy,
  action,
  onAction,
  ready,
}: {
  item: Item;
  busy: boolean;
  action: string;
  onAction: () => void;
  ready?: boolean;
}) {
  const color = waitColor(item.waitingMinutes);

  return (
    <article
      style={{
        border: `2px solid ${color}`,
        borderRadius: 14,
        padding: 14,
        background: 'var(--surface)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}>
          {item.tableNo ? `میز ${item.tableNo}` : ORDER_TYPE[item.orderType] ?? item.orderType}
          {' · '}
          {item.orderNo}
        </span>
        {/* دقیقهٔ انتظار بزرگ و رنگی است: تنها عددی که آشپز باید از
            آن‌سوی آشپزخانه ببیند. */}
        <span style={{ fontSize: 22, fontWeight: 700, color }}>
          {item.waitingMinutes}′
        </span>
      </div>

      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3 }}>
        {Number(item.qty) > 1 ? `${showQty(item.qty)} × ` : ''}
        {item.name}
      </div>

      {item.note ? (
        // یادداشت مشتری («بدون پیاز») روی رنگ هشدار می‌نشیند تا در
        // شلوغی از قلم نیفتد.
        <div
          style={{
            fontSize: 17,
            padding: '8px 12px',
            borderRadius: 8,
            background: '#b4530922',
            color: '#b45309',
            fontWeight: 600,
          }}
        >
          {item.note}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        style={{
          minHeight: 64,
          fontSize: 20,
          fontWeight: 700,
          borderRadius: 12,
          border: 'none',
          cursor: busy ? 'wait' : 'pointer',
          color: '#fff',
          background: busy ? '#6b7280' : ready ? '#047857' : 'var(--accent)',
        }}
      >
        {busy ? '…' : action}
      </button>
    </article>
  );
}
