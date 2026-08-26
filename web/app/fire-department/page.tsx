'use client';

/**
 * آتش‌نشانی.
 *
 * نوزده مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد — بزرگ‌ترین
 * ماژولِ بی‌رابطِ کلِ پروژه، و آخرینشان.
 *
 * ⚠️ ترتیبِ بخش‌ها بر پایهٔ فوریت است، نه بر پایهٔ ساختارِ داده.
 *
 *    پنج موجودیت دارد (ایستگاه، آتش‌نشان، خودرو، حادثه، بازرسی) ولی
 *    فقط **یکی**شان فوری است.  حادثهٔ گزارش‌شده‌ای که اعزام نشده،
 *    تنها چیزی است که ثانیه برایش مهم است؛ بقیه مرجع‌اند.
 *
 *    پس حادثه‌ها اول می‌آیند و پیش‌فرضِ صافی «هنوز باز» است.
 *
 * ⚠️ با موتورِ `[domain]` ساخته نشد: `:id/dispatch` و `:id/status`
 *    گردشِ کار دارند و اعزام باید ایستگاه را انتخاب کند.
 *
 * ⚠️ تلفاتِ صفر با تلفاتِ نامعلوم فرق دارد.
 *
 *    ستون‌ها `NOT NULL` با پیش‌فرضِ صفرند، پس در لحظهٔ گزارش همه‌چیز
 *    صفر است.  نمایشِ «۰ کشته» روی حادثه‌ای که تازه گزارش شده،
 *    اطمینانی می‌دهد که کسی نسنجیده — پس تا وقتی حادثه باز است،
 *    عددها فقط وقتی نشان داده می‌شوند که ناصفر باشند.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Station = { id: string; name: string; code: string; address: string | null; phone: string | null };
type Fighter = {
  id: string;
  stationId: string;
  firstName: string;
  lastName: string;
  rank: string;
  phone: string | null;
  isOnDuty: boolean;
  isActive: boolean;
};
type Vehicle = {
  id: string;
  stationId: string;
  name: string;
  plateNo: string;
  vehicleType: string;
  status: string;
};
type Incident = {
  id: string;
  incidentNo: string;
  stationId: string | null;
  type: string;
  status: string;
  address: string;
  reporterName: string | null;
  reporterPhone: string | null;
  description: string | null;
  casualties: number;
  injuries: number;
  reportedAt: string;
  dispatchedAt: string | null;
  resolvedAt: string | null;
};
type Inspection = {
  id: string;
  propertyName: string;
  address: string;
  ownerName: string;
  result: string;
  certificateNo: string | null;
  validUntil: string | null;
  inspectedAt: string;
};

const INCIDENT_STATUS_FA: Record<string, string> = {
  REPORTED: 'گزارش‌شده',
  DISPATCHED: 'اعزام‌شده',
  ON_SCENE: 'در محل',
  CONTAINED: 'مهارشده',
  RESOLVED: 'پایان‌یافته',
  CANCELLED: 'لغوشده',
};

const INCIDENT_COLOR: Record<string, string> = {
  REPORTED: 'var(--danger)',
  DISPATCHED: 'var(--warning)',
  ON_SCENE: 'var(--warning)',
  CONTAINED: 'var(--accent)',
  RESOLVED: 'var(--success)',
  CANCELLED: 'var(--muted)',
};

/** ⚠️ حادثه‌ای که هنوز تمام نشده — مبنای همهٔ هشدارهای این صفحه. */
const LIVE = new Set(['REPORTED', 'DISPATCHED', 'ON_SCENE', 'CONTAINED']);

/** گامِ بعدیِ طبیعیِ هر وضعیت. */
const NEXT: Record<string, { to: string; label: string }[]> = {
  DISPATCHED: [{ to: 'ON_SCENE', label: 'رسید به محل' }],
  ON_SCENE: [{ to: 'CONTAINED', label: 'مهار شد' }],
  CONTAINED: [{ to: 'RESOLVED', label: 'پایان' }],
  REPORTED: [{ to: 'CANCELLED', label: 'لغو' }],
};

const VEHICLE_FA: Record<string, string> = {
  READY: 'آماده',
  DISPATCHED: 'اعزام‌شده',
  FAILED: 'خراب',
};

function minutesSince(iso: string): number {
  const at = new Date(iso).getTime();
  return Number.isFinite(at) ? Math.floor((Date.now() - at) / 60000) : 0;
}

export default function FireDepartmentPage() {
  const { t } = useI18n();

  const [tab, setTab] = useState<'incidents' | 'resources' | 'inspections'>('incidents');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);

  const [onlyLive, setOnlyLive] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    // ⚠️ هر دسته جدا: نقشِ کاربر ممکن است فقط حادثه‌ها را ببیند و
    //    شکستِ یکی نباید صفحهٔ عملیات را خالی کند.
    api<Incident[]>('/fire-department/incidents')
      .then(setIncidents)
      .catch((e) => setError((e as Error).message));
    api<Station[]>('/fire-department/stations').then(setStations).catch(() => undefined);
    api<Fighter[]>('/fire-department/firefighters').then(setFighters).catch(() => undefined);
    api<Vehicle[]>('/fire-department/vehicles').then(setVehicles).catch(() => undefined);
    api<Inspection[]>('/fire-department/safety-inspections')
      .then(setInspections)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * ⚠️ تازه‌سازیِ خودکار فقط وقتی حادثهٔ باز هست.
   *
   *    صفحه‌ای که همیشه هر ۳۰ ثانیه به سرور می‌زند، در شبی که هیچ
   *    حادثه‌ای نیست فقط بار می‌سازد.  و بدونِ تازه‌سازی، دو نفر روی
   *    یک حادثه کار می‌کنند بی‌آنکه بدانند دیگری اعزام کرده.
   */
  const liveCount = useMemo(
    () => incidents.filter((i) => LIVE.has(i.status)).length,
    [incidents],
  );

  useEffect(() => {
    if (liveCount === 0) return;
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [liveCount, load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  const act = async (id: string, work: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    setError('');
    try {
      await work();
      flash(ok);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const dispatch = (inc: Incident) => {
    const ready = stations;
    if (!ready.length) {
      setError('ایستگاهی ثبت نشده است');
      return;
    }
    // ⚠️ انتخاب از فهرست، نه تایپِ آزاد: شناسهٔ اشتباه یعنی اعزامی که
    //    هیچ‌کس دریافتش نمی‌کند.
    const options = ready.map((s, i) => `${i + 1}) ${s.name} (${s.code})`).join('\n');
    const answer = window.prompt(`اعزام از کدام ایستگاه؟\n${options}`, '1');
    if (answer === null) return;
    const idx = Number(answer) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= ready.length) {
      setError('شمارهٔ ایستگاه نامعتبر است');
      return;
    }
    void act(
      inc.id,
      () =>
        api(`/fire-department/incidents/${inc.id}/dispatch`, {
          method: 'PATCH',
          body: { stationId: ready[idx].id },
        }),
      `اعزام از ${ready[idx].name}`,
    );
  };

  const move = (inc: Incident, to: string) => {
    const body: Record<string, unknown> = { status: to };

    // ⚠️ فقط در لحظهٔ پایان پرسیده می‌شود.
    //
    //    پرسیدنش در هر گام یعنی عددی که هنوز معلوم نیست ثبت می‌شود و
    //    بعد کسی اصلاحش نمی‌کند.
    if (to === 'RESOLVED') {
      const dead = window.prompt('تعداد فوتی', String(inc.casualties ?? 0));
      if (dead === null) return;
      const hurt = window.prompt('تعداد مصدوم', String(inc.injuries ?? 0));
      if (hurt === null) return;
      const d = Number(dead);
      const h = Number(hurt);
      if (!Number.isInteger(d) || d < 0 || !Number.isInteger(h) || h < 0) {
        setError('تعداد باید عددی صحیح و نامنفی باشد');
        return;
      }
      body.casualties = d;
      body.injuries = h;
    }

    void act(
      inc.id,
      () =>
        api(`/fire-department/incidents/${inc.id}/status`, { method: 'PATCH', body }),
      `وضعیت: ${INCIDENT_STATUS_FA[to] ?? to}`,
    );
  };

  const shown = useMemo(
    () =>
      incidents
        .filter((i) => (onlyLive ? LIVE.has(i.status) : true))
        // بازترین و قدیمی‌ترین بالا: همان چیزی که باید اول دیده شود.
        .sort((a, b) => new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime()),
    [incidents, onlyLive],
  );

  const summary = useMemo(() => {
    const live = incidents.filter((i) => LIVE.has(i.status));
    return {
      live: live.length,
      waiting: live.filter((i) => i.status === 'REPORTED').length,
      onDuty: fighters.filter((f) => f.isActive && f.isOnDuty).length,
      readyVehicles: vehicles.filter((v) => v.status === 'READY').length,
      brokenVehicles: vehicles.filter((v) => v.status === 'FAILED').length,
    };
  }, [incidents, fighters, vehicles]);

  const stationName = (id: string | null) =>
    stations.find((s) => s.id === id)?.name ?? '—';

  return (
    <AppShell title={t('menuFireDepartment')}>
      <div style={{ display: 'grid', gap: 16 }}>
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : null}
        {note ? (
          <div
            role="status"
            style={{
              ...ALERT,
              background: 'color-mix(in srgb, var(--success) 13%, transparent)',
              color: 'var(--success)',
            }}
          >
            {note}
          </div>
        ) : null}

        {/* ⚠️ حادثهٔ گزارش‌شده‌ای که اعزام نشده — تنها هشدارِ واقعاً فوری. */}
        {summary.waiting > 0 ? (
          <div
            role="alert"
            style={{
              ...ALERT,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {summary.waiting} حادثه هنوز اعزام نشده است
          </div>
        ) : null}

        <section style={CARD}>
          <div style={STATS}>
            <Stat label={t('fdOpenIncidents')} value={String(summary.live)} tone={summary.live ? 'bad' : undefined} />
            <Stat label={t('fdOnDuty')} value={String(summary.onDuty)} />
            <Stat label={t('fdReadyVehicles')} value={String(summary.readyVehicles)} />
            <Stat
              label={t('fdBrokenVehicles')}
              value={String(summary.brokenVehicles)}
              tone={summary.brokenVehicles ? 'warn' : undefined}
            />
          </div>
        </section>

        <section style={CARD}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={tab === 'incidents' ? CHIP_ON : CHIP}
              onClick={() => setTab('incidents')}
            >
              {t('fdIncidents')}
            </button>
            <button
              type="button"
              style={tab === 'resources' ? CHIP_ON : CHIP}
              onClick={() => setTab('resources')}
            >
              {t('fdStationsFleet')}
            </button>
            <button
              type="button"
              style={tab === 'inspections' ? CHIP_ON : CHIP}
              onClick={() => setTab('inspections')}
            >
              بازرسی ایمنی ({inspections.length})
            </button>
          </div>
        </section>

        {tab === 'incidents' ? (
          <section style={CARD}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={onlyLive}
                onChange={(e) => setOnlyLive(e.target.checked)}
              />
              {t('fdOnlyOpen')}
            </label>

            {shown.length === 0 ? (
              <p style={EMPTY}>
                {onlyLive ? 'حادثهٔ بازی نیست.' : 'حادثه‌ای ثبت نشده.'}
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {shown.map((inc) => {
                  const mins = minutesSince(inc.reportedAt);
                  const live = LIVE.has(inc.status);
                  return (
                    <div
                      key={inc.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderInlineStartWidth: 4,
                        borderInlineStartColor: INCIDENT_COLOR[inc.status] ?? 'var(--border)',
                        borderRadius: 10,
                        padding: 12,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
                          {inc.incidentNo}
                        </code>
                        <strong style={{ flex: '1 1 200px' }}>{inc.address}</strong>
                        <span
                          style={{
                            color: INCIDENT_COLOR[inc.status] ?? 'inherit',
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {INCIDENT_STATUS_FA[inc.status] ?? inc.status}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: live && mins > 30 ? 'var(--danger)' : 'var(--muted)',
                          }}
                        >
                          {mins < 60 ? `${mins} دقیقه` : `${Math.floor(mins / 60)} ساعت`} پیش
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--muted)',
                          display: 'flex',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>{inc.type}</span>
                        <span>ایستگاه: {stationName(inc.stationId)}</span>
                        {inc.reporterPhone ? <span>{inc.reporterPhone}</span> : null}
                        {/* ⚠️ فقط وقتی ناصفر است — دلیلش بالای فایل. */}
                        {inc.casualties > 0 ? (
                          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                            {inc.casualties} فوتی
                          </span>
                        ) : null}
                        {inc.injuries > 0 ? (
                          <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                            {inc.injuries} مصدوم
                          </span>
                        ) : null}
                      </div>

                      {inc.description ? (
                        <div style={{ fontSize: 14 }}>{inc.description}</div>
                      ) : null}

                      {live ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {inc.status === 'REPORTED' ? (
                            <button
                              type="button"
                              style={{ ...BTN_SM, fontWeight: 700 }}
                              disabled={busy === inc.id}
                              onClick={() => dispatch(inc)}
                            >
                              {t('fdDispatch')}
                            </button>
                          ) : null}
                          {(NEXT[inc.status] ?? []).map((step) => (
                            <button
                              key={step.to}
                              type="button"
                              style={BTN_SM}
                              disabled={busy === inc.id}
                              onClick={() => move(inc, step.to)}
                            >
                              {step.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'resources' ? (
          <>
            <section style={CARD}>
              <h2 style={H2}>ایستگاه‌ها ({stations.length})</h2>
              {stations.length === 0 ? (
                <p style={EMPTY}>{t('fdNoStations')}</p>
              ) : (
                <Table
                  head={['کد', 'نام', 'نشانی', 'تلفن', 'آتش‌نشان کشیک']}
                  rows={stations.map((s) => [
                    s.code,
                    s.name,
                    s.address ?? '—',
                    s.phone ?? '—',
                    String(
                      fighters.filter((f) => f.stationId === s.id && f.isActive && f.isOnDuty).length,
                    ),
                  ])}
                />
              )}
            </section>

            <section style={CARD}>
              <h2 style={H2}>ناوگان ({vehicles.length})</h2>
              {vehicles.length === 0 ? (
                <p style={EMPTY}>{t('fdNoVehicles')}</p>
              ) : (
                <Table
                  head={['پلاک', 'نام', 'نوع', 'ایستگاه', 'وضعیت']}
                  rows={vehicles.map((v) => [
                    v.plateNo,
                    v.name,
                    v.vehicleType,
                    stationName(v.stationId),
                    VEHICLE_FA[v.status] ?? v.status,
                  ])}
                  danger={vehicles.map((v) => v.status === 'FAILED')}
                />
              )}
            </section>

            <section style={CARD}>
              <h2 style={H2}>آتش‌نشانان ({fighters.filter((f) => f.isActive).length})</h2>
              {fighters.length === 0 ? (
                <p style={EMPTY}>{t('fdNoFighters')}</p>
              ) : (
                <Table
                  head={['نام', 'درجه', 'ایستگاه', 'تلفن', 'کشیک']}
                  rows={fighters
                    .filter((f) => f.isActive)
                    .map((f) => [
                      `${f.firstName} ${f.lastName}`,
                      f.rank,
                      stationName(f.stationId),
                      f.phone ?? '—',
                      f.isOnDuty ? 'بله' : 'خیر',
                    ])}
                />
              )}
            </section>
          </>
        ) : null}

        {tab === 'inspections' ? (
          <section style={CARD}>
            <h2 style={H2}>{t('fdSafetyInspections')}</h2>
            {inspections.length === 0 ? (
              <p style={EMPTY}>{t('fdNoInspections')}</p>
            ) : (
              <Table
                head={['ملک', 'مالک', 'نشانی', 'نتیجه', 'گواهی', 'اعتبار تا']}
                rows={inspections.map((i) => [
                  i.propertyName,
                  i.ownerName,
                  i.address,
                  i.result === 'PASSED' ? 'قبول' : 'مردود',
                  i.certificateNo ?? '—',
                  i.validUntil ? new Date(i.validUntil).toLocaleDateString('fa-IR') : '—',
                ])}
                danger={inspections.map((i) => i.result !== 'PASSED')}
              />
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'bad' | 'warn';
}) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color:
            tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warning)' : 'inherit',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Table({
  head,
  rows,
  danger,
}: {
  head: string[];
  rows: string[][];
  danger?: boolean[];
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} style={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  style={{
                    ...TD,
                    color: danger?.[r] && c === row.length - 1 ? 'var(--danger)' : 'inherit',
                    fontWeight: danger?.[r] && c === row.length - 1 ? 700 : 400,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

const STATS: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
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

const BTN_SM: React.CSSProperties = {
  ...BTN,
  padding: '6px 12px',
  fontSize: 13,
  minHeight: 36,
};

const CHIP: React.CSSProperties = {
  ...BTN,
  padding: '6px 14px',
  fontSize: 13,
  minHeight: 36,
};

const CHIP_ON: React.CSSProperties = {
  ...CHIP,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
};

const TH: React.CSSProperties = {
  textAlign: 'start',
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--muted)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid var(--border)',
};

const EMPTY: React.CSSProperties = {
  padding: 32,
  textAlign: 'center',
  color: 'var(--muted)',
};

const ALERT: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
  color: 'var(--danger)',
};
