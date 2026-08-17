'use client';

/**
 * چیدمان سالن — سالن‌ها و میزها.
 *
 * تا امروز صفحهٔ رستوران فقط میزها را **نشان** می‌داد.  یعنی یک
 * رستوران تازه اصلاً نمی‌توانست چیدمانش را وارد کند: نه سالن، نه میز.
 * همه‌چیز با `curl` یا مستقیم در پایگاه داده ساخته می‌شد.
 *
 * این صفحه یک بار در ابتدای کار استفاده می‌شود و بعد به‌ندرت — پس
 * سادگی مهم‌تر از سرعت است.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../../components/AppShell';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n-context';

type Area = {
  id: string;
  name: string;
  floor: string | null;
  isSmoking: boolean;
  isOutdoor: boolean;
  isActive: boolean;
};

type Table = {
  id: string;
  areaId: string | null;
  areaName?: string | null;
  tableNo: string;
  capacity: number;
  status: string;
  note: string | null;
};

const TABLE_STATUS_FA: Record<string, string> = {
  FREE: 'آزاد',
  OCCUPIED: 'مشغول',
  RESERVED: 'رزرو',
  CLEANING: 'در حال نظافت',
};

const STATUS_COLOR: Record<string, string> = {
  FREE: 'var(--success)',
  OCCUPIED: 'var(--warning)',
  RESERVED: '#1d4ed8',
  CLEANING: '#6b7280',
};

export default function SetupPage() {
  const { t } = useI18n();
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [areaName, setAreaName] = useState('');
  const [areaFloor, setAreaFloor] = useState('');
  const [areaOutdoor, setAreaOutdoor] = useState(false);

  const [tableNo, setTableNo] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [tableArea, setTableArea] = useState('');
  const [bulkTo, setBulkTo] = useState('');

  /**
   * ⚠️ در مسیر موفق خطا را **پاک نمی‌کند**.
   *
   * نسخهٔ اول اینجا `setError('')` داشت.  نتیجه‌اش این بود که هر
   * عملیاتی که خطا می‌داد و بعد فهرست را تازه می‌کرد، پیام خطایش بی‌صدا
   * محو می‌شد: «سه میز افزوده شد، سه‌تا تکراری بود» کاملاً ناپدید
   * می‌شد و کاربر فقط می‌دید تعداد میزها آن نیست که خواسته بود.
   *
   * پاک کردن خطا کارِ *شروعِ* هر عملیات است، نه کارِ بارگذاری.
   */
  const load = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([
        api<Area[]>('/restaurant/areas'),
        api<Table[]>('/restaurant/tables'),
      ]);
      setAreas(a);
      setTables(t);
      // اولین سالن پیش‌فرض می‌شود تا افزودن میز یک انتخاب کمتر داشته
      // باشد؛ ولی انتخاب کاربر بازنویسی نمی‌شود.
      setTableArea((prev) => prev || a[0]?.id || '');
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const addArea = async () => {
    const name = areaName.trim();
    if (!name) {
      setError('نام سالن را بنویسید');
      return;
    }
    setError('');
    setBusy('area');
    try {
      const body: Record<string, unknown> = { name, isOutdoor: areaOutdoor };
      if (areaFloor.trim()) body.floor = areaFloor.trim();
      await api('/restaurant/areas', { method: 'POST', body });
      setAreaName('');
      setAreaFloor('');
      setAreaOutdoor(false);
      flash('سالن افزوده شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeArea = async (a: Area) => {
    if (!window.confirm(`سالن «${a.name}» حذف شود؟`)) return;
    setError('');
    setBusy(a.id);
    try {
      await api(`/restaurant/areas/${a.id}`, { method: 'DELETE' });
      flash('سالن حذف شد');
      await load();
    } catch (caught) {
      // سالنی که میز دارد حذف نمی‌شود؛ پیام سرور تعداد میزها را
      // می‌گوید و از هر متنی که اینجا بنویسیم دقیق‌تر است.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /**
   * افزودن میز — تکی یا بازه‌ای.
   *
   * رستورانی با بیست میز، بیست بار پر کردن فرم یعنی بیست فرصت برای
   * اشتباه.  «از ۱ تا ۲۰» همان کار را یک بار انجام می‌دهد.
   */
  const addTables = async () => {
    const from = tableNo.trim();
    if (!from) {
      setError('شمارهٔ میز را بنویسید');
      return;
    }

    const cap = Number(capacity) || 4;
    const start = Number(from);
    const end = Number(bulkTo);
    const isRange =
      bulkTo.trim() !== '' &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start;

    if (bulkTo.trim() !== '' && !isRange) {
      setError('برای افزودن بازه‌ای، هر دو شماره باید عدد صحیح و پایان ≥ شروع باشد');
      return;
    }

    const numbers = isRange
      ? Array.from({ length: end - start + 1 }, (_, i) => String(start + i))
      : [from];

    if (numbers.length > 100) {
      setError('حداکثر ۱۰۰ میز در یک بار');
      return;
    }

    setError('');
    setBusy('table');
    const failed: string[] = [];
    try {
      // پشت سر هم، نه موازی: شمارهٔ تکراری باید دقیقاً معلوم شود کدام
      // است، و صد درخواست هم‌زمان سقف نرخ را می‌خورد.
      for (const no of numbers) {
        try {
          const body: Record<string, unknown> = { tableNo: no, capacity: cap };
          if (tableArea) body.areaId = tableArea;
          await api('/restaurant/tables', { method: 'POST', body });
        } catch {
          failed.push(no);
        }
      }

      if (failed.length === 0) {
        flash(numbers.length > 1 ? `${numbers.length} میز افزوده شد` : 'میز افزوده شد');
        setTableNo('');
        setBulkTo('');
      } else {
        // نیمه‌کاره ماندن باید صریح گفته شود، نه اینکه با یک «انجام شد»
        // پوشانده شود.
        setError(
          `${numbers.length - failed.length} میز افزوده شد؛ این شماره‌ها ساخته نشدند (تکراری؟): ${failed.join('، ')}`,
        );
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const patchTable = async (t: Table, body: Record<string, unknown>) => {
    setError('');
    setBusy(t.id);
    try {
      await api(`/restaurant/tables/${t.id}`, { method: 'PATCH', body });
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeTable = async (t: Table) => {
    if (!window.confirm(`میز ${t.tableNo} حذف شود؟`)) return;
    setError('');
    setBusy(t.id);
    try {
      await api(`/restaurant/tables/${t.id}`, { method: 'DELETE' });
      flash('میز حذف شد');
      await load();
    } catch (caught) {
      // میزی که سفارش باز دارد حذف نمی‌شود.
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const tablesOf = (areaId: string | null) =>
    tables.filter((t) => (t.areaId ?? null) === areaId);

  const orphans = tablesOf(null);

  return (
    <AppShell title="چیدمان سالن">
      <div style={{ display: 'grid', gap: 16 }}>
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : null}
        {note ? (
          <div role="status" style={{ ...ALERT, background: 'color-mix(in srgb, var(--success) 13%, transparent)', color: 'var(--success)' }}>
            {note}
          </div>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>{t('stpNewHall')}</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="نام">
              <input
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                style={INPUT}
                placeholder="سالن اصلی"
              />
            </Field>
            <Field label="طبقه">
              <input
                value={areaFloor}
                onChange={(e) => setAreaFloor(e.target.value)}
                style={{ ...INPUT, maxWidth: 120 }}
                placeholder="همکف"
              />
            </Field>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
              <input
                type="checkbox"
                checked={areaOutdoor}
                onChange={(e) => setAreaOutdoor(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>{t('stpOutdoor')}</span>
            </label>
            <button type="button" onClick={addArea} disabled={busy === 'area'} style={BTN_PRIMARY}>
              {busy === 'area' ? '…' : 'افزودن سالن'}
            </button>
          </div>
        </section>

        <section style={CARD}>
          <h2 style={H2}>{t('stpNewTable')}</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="شماره میز">
              <input
                value={tableNo}
                onChange={(e) => setTableNo(e.target.value)}
                style={{ ...INPUT, maxWidth: 120 }}
                placeholder="۱"
              />
            </Field>
            <Field label="تا شماره (اختیاری)">
              <input
                value={bulkTo}
                onChange={(e) => setBulkTo(e.target.value)}
                style={{ ...INPUT, maxWidth: 120 }}
                placeholder="۲۰"
              />
            </Field>
            <Field label="ظرفیت">
              <input
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                style={{ ...INPUT, maxWidth: 100 }}
                inputMode="numeric"
              />
            </Field>
            <Field label="سالن">
              <select
                value={tableArea}
                onChange={(e) => setTableArea(e.target.value)}
                style={INPUT}
              >
                <option value="">{t('stpNoHall')}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              onClick={addTables}
              disabled={busy === 'table'}
              style={BTN_PRIMARY}
            >
              {busy === 'table' ? '…' : 'افزودن میز'}
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {t('stpBulkHint')}
            </span>
          </div>
        </section>

        {areas.length === 0 && tables.length === 0 ? (
          <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            {t('stpNoHallYet')}
          </p>
        ) : null}

        {areas.map((area) => (
          <section key={area.id} style={CARD}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={H2}>{area.name}</h2>
              {area.floor ? (
                <span style={{ color: 'var(--muted)', fontSize: 14 }}>طبقه {area.floor}</span>
              ) : null}
              {area.isOutdoor ? <span style={TAG}>{t('stpOutdoor')}</span> : null}
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>
                {tablesOf(area.id).length} میز
              </span>
              <button
                type="button"
                onClick={() => removeArea(area)}
                disabled={busy === area.id}
                style={{ ...BTN_SM, marginInlineStart: 'auto', color: 'var(--danger)' }}
              >
                {t('stpDeleteHall')}
              </button>
            </div>

            <TableGrid
              tables={tablesOf(area.id)}
              areas={areas}
              busy={busy}
              onMove={(t, areaId) => patchTable(t, { areaId: areaId || null })}
              onCapacity={(t, cap) => patchTable(t, { capacity: cap })}
              onRemove={removeTable}
            />
          </section>
        ))}

        {orphans.length > 0 ? (
          <section style={{ ...CARD, borderColor: 'var(--warning)' }}>
            <h2 style={H2}>میزهای بدون سالن ({orphans.length})</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              این میزها روی نقشهٔ سالن دیده نمی‌شوند تا به سالنی منتقل شوند.
            </p>
            <TableGrid
              tables={orphans}
              areas={areas}
              busy={busy}
              onMove={(t, areaId) => patchTable(t, { areaId: areaId || null })}
              onCapacity={(t, cap) => patchTable(t, { capacity: cap })}
              onRemove={removeTable}
            />
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function TableGrid({
  tables,
  areas,
  busy,
  onMove,
  onCapacity,
  onRemove,
}: {
  tables: Table[];
  areas: Area[];
  busy: string | null;
  onMove: (t: Table, areaId: string) => void;
  onCapacity: (t: Table, capacity: number) => void;
  onRemove: (t: Table) => void;
}) {
  const { t: tr } = useI18n();
  if (tables.length === 0) {
    return (
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{tr('stpNoTableInHall')}</p>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
      }}
    >
      {tables.map((t) => (
        <div
          key={t.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 10,
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <strong style={{ fontSize: 18 }}>میز {t.tableNo}</strong>
            <span
              style={{
                marginInlineStart: 'auto',
                fontSize: 13,
                color: STATUS_COLOR[t.status] ?? 'var(--muted)',
                fontWeight: 700,
              }}
            >
              {TABLE_STATUS_FA[t.status] ?? t.status}
            </span>
          </div>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>{tr('stpCapacity')}</span>
            <input
              defaultValue={String(t.capacity)}
              onBlur={(e) => {
                const v = Number(e.target.value);
                // فقط وقتی واقعاً عوض شد درخواست می‌رود؛ کلیک بی‌هدف
                // روی میدان نباید ترافیک بسازد.
                if (Number.isFinite(v) && v > 0 && v !== t.capacity) onCapacity(t, v);
              }}
              style={{ ...INPUT, minHeight: 32, padding: '4px 8px', width: 60 }}
              inputMode="numeric"
              aria-label={`ظرفیت میز ${t.tableNo}`}
            />
          </label>

          <select
            value={t.areaId ?? ''}
            onChange={(e) => onMove(t, e.target.value)}
            disabled={busy === t.id}
            style={{ ...INPUT, minHeight: 34, padding: '4px 8px', fontSize: 13 }}
            aria-label={`سالن میز ${t.tableNo}`}
          >
            <option value="">{tr('stpNoHall')}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onRemove(t)}
            disabled={busy === t.id}
            style={{ ...BTN_SM, color: 'var(--danger)' }}
          >
            {tr('stpDeleteTable')}
          </button>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
  );
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
  display: 'grid',
  gap: 12,
};

const H2: React.CSSProperties = { margin: 0, fontSize: 17 };

const INPUT: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 40,
};

const BTN: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 44,
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
};

const BTN_SM: React.CSSProperties = {
  ...BTN,
  padding: '6px 10px',
  fontSize: 13,
  minHeight: 34,
};

const TAG: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 8px',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--success) 13%, transparent)',
  color: 'var(--success)',
};

const ALERT: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
  color: 'var(--danger)',
};
