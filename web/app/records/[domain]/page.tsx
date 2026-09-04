'use client';

/**
 * موتور مشترک حوزه‌های سادهٔ CRUD.
 *
 * ده ماژول باقی‌مانده همگی `BaseCrudService` خالص‌اند: همان پنج مسیر،
 * همان شکل پاسخ، فقط ستون‌های متفاوت.  ده صفحهٔ جداگانه یعنی ده نسخهٔ
 * تکراری از یک منطق، و ده جا که هر اصلاحی باید تکرار شود.
 *
 * پس یک موتور و ده تعریف در `config.ts`.
 *
 * ⚠️ این جایگزین صفحهٔ اختصاصی نیست.  حوزه‌ای که منطق خاص دارد —
 *    قرارداد با اقساطش، کارت‌خوان با چرخهٔ وضعیتش، آشپزخانه با
 *    تازه‌سازی خودکارش — صفحهٔ خودش را می‌گیرد.  این‌جا فقط جایی است که
 *    «فهرست، ساخت، ویرایش، حذف» واقعاً کافی است.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { notFound, useParams } from 'next/navigation';

import AppShell from '../../../components/AppShell';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n-context';
import { DOMAINS, type DomainDef, type FieldDef } from './config';

type Row = Record<string, unknown>;

const money = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('fa-IR');

/** تاریخ محلی — نه `toISOString` که در تهران یک روز عقب می‌رود. */
function localDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function emptyDraft(def: DomainDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) out[f.name] = f.kind === 'bool' ? 'false' : '';
  return out;
}

export default function RecordsPage() {
  const params = useParams<{ domain: string }>();
  const def = DOMAINS[params?.domain ?? ''];
  if (!def) notFound();
  return <Records def={def} />;
}

function Records({ def }: { def: DomainDef }) {
  const { t } = useI18n();
  const { locale } = useI18n();

  const [list, setList] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>(() => emptyDraft(def));
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /** ⚠️ در مسیر موفق خطا را پاک نمی‌کند — آن کارِ شروعِ هر عملیات است. */
  const load = useCallback(async () => {
    try {
      const data = await api<Row[] | { data: Row[] }>(def.endpoint);
      setList(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [def.endpoint]);

  useEffect(() => {
    setList([]);
    setDraft(emptyDraft(def));
    setEditing(null);
    setFilter('');
    setSearch('');
    void load();
  }, [def, load]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(''), 2500);
  };

  /**
   * تبدیل پیش‌نویسِ رشته‌ای به بدنهٔ درخواست.
   *
   * میدان خالی **فرستاده نمی‌شود** نه اینکه رشتهٔ خالی برود: نگهبانِ
   * `BaseCrudService` رشتهٔ خالی را به `null` بدل می‌کند، ولی عدد و
   * تاریخِ خالی همان‌جا خطا می‌دهند.
   */
  const buildBody = (): Record<string, unknown> | string => {
    const body: Record<string, unknown> = {};
    for (const f of def.fields) {
      const raw = (draft[f.name] ?? '').trim();

      if (f.kind === 'bool') {
        body[f.name] = raw === 'true';
        continue;
      }
      if (!raw) {
        if (f.required) return `«${f.label}» الزامی است`;
        continue;
      }
      if (f.kind === 'num' || f.kind === 'int') {
        const n = Number(raw);
        if (!Number.isFinite(n)) return `«${f.label}» باید عدد باشد`;
        if (f.kind === 'int' && !Number.isInteger(n)) return `«${f.label}» باید عدد صحیح باشد`;
        body[f.name] = n;
        continue;
      }
      body[f.name] = raw;
    }
    return body;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const body = buildBody();
    if (typeof body === 'string') {
      setError(body);
      return;
    }

    setBusy('save');
    try {
      if (editing) {
        await api(`${def.endpoint}/${editing}`, { method: 'PATCH', body });
        flash('ویرایش شد');
      } else {
        await api(def.endpoint, { method: 'POST', body });
        flash('ثبت شد');
      }
      setDraft(emptyDraft(def));
      setEditing(null);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (row: Row) => {
    setEditing(String(row.id));
    const d: Record<string, string> = {};
    for (const f of def.fields) {
      const v = row[f.name];
      d[f.name] =
        f.kind === 'bool'
          ? String(Boolean(v))
          : f.kind === 'date'
            ? localDate(v)
            : v === null || v === undefined
              ? ''
              : String(v);
    }
    setDraft(d);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (row: Row) => {
    const label = String(row[def.titleField] ?? row.id);
    if (!window.confirm(`«${label}» حذف شود؟`)) return;
    setError('');
    setBusy(String(row.id));
    try {
      await api(`${def.endpoint}/${row.id}`, { method: 'DELETE' });
      flash('حذف شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const statusOptions = def.statusField
    ? (def.fields.find((f) => f.name === def.statusField)?.options ?? [])
    : [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((row) => {
      if (filter && def.statusField && String(row[def.statusField] ?? '') !== filter) return false;
      if (!q) return true;
      return def.fields.some((f) =>
        String(row[f.name] ?? '')
          .toLowerCase()
          .includes(q),
      );
    });
  }, [list, filter, search, def]);

  const listFields = def.fields.filter((f) => f.inList);

  const render = (f: FieldDef, row: Row) => {
    const v = row[f.name];
    if (v === null || v === undefined || v === '') return '—';
    if (f.kind === 'bool') return v ? 'بله' : 'خیر';
    if (f.kind === 'num') return money(v);
    if (f.kind === 'int') return Number(v).toLocaleString('fa-IR');
    if (f.kind === 'date') {
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(locale);
    }
    if (f.kind === 'select') {
      return f.options?.find((o) => o.value === String(v))?.label ?? String(v);
    }
    return String(v);
  };

  return (
    <AppShell title={def.title}>
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
          <h2 style={H2}>{editing ? 'ویرایش' : 'ثبت تازه'}</h2>
          <form onSubmit={submit} style={FORM}>
            {def.fields.map((f) => (
              <label
                key={f.name}
                style={{
                  display: 'grid',
                  gap: 4,
                  gridColumn: f.kind === 'textarea' ? '1 / -1' : undefined,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>

                {f.kind === 'select' ? (
                  <select
                    value={draft[f.name] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
                    style={INPUT}
                  >
                    <option value="">—</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.kind === 'bool' ? (
                  <select
                    value={draft[f.name] ?? 'false'}
                    onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
                    style={INPUT}
                  >
                    <option value="true">{t('recYes')}</option>
                    <option value="false">{t('recNo')}</option>
                  </select>
                ) : f.kind === 'textarea' ? (
                  <textarea
                    value={draft[f.name] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
                    style={{ ...INPUT, minHeight: 80, resize: 'vertical' }}
                  />
                ) : (
                  <input
                    type={f.kind === 'date' ? 'date' : 'text'}
                    inputMode={f.kind === 'num' || f.kind === 'int' ? 'numeric' : undefined}
                    value={draft[f.name] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
                    style={INPUT}
                  />
                )}
              </label>
            ))}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button type="submit" disabled={busy === 'save'} style={BTN_PRIMARY}>
                {busy === 'save' ? '…' : editing ? 'ذخیره' : 'افزودن'}
              </button>
              {editing ? (
                <button
                  type="button"
                  style={BTN}
                  onClick={() => {
                    setEditing(null);
                    setDraft(emptyDraft(def));
                  }}
                >
                  {t('cancel')}
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {statusOptions.length > 0 ? (
            <>
              <button type="button" onClick={() => setFilter('')} style={filter ? CHIP : CHIP_ON}>
                همه ({list.length})
              </button>
              {statusOptions.map((o) => {
                const n = list.filter(
                  (r) => String(r[def.statusField!] ?? '') === o.value,
                ).length;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setFilter(o.value)}
                    style={filter === o.value ? CHIP_ON : CHIP}
                  >
                    {o.label} ({n})
                  </button>
                );
              })}
            </>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{list.length} رکورد</span>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجو…"
            style={{ ...INPUT, minWidth: 180, marginInlineStart: 'auto' }}
          />
        </div>

        {visible.length === 0 ? (
          <p style={EMPTY}>{t('recNone')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>{def.fields.find((f) => f.name === def.titleField)?.label ?? '—'}</th>
                  {listFields
                    .filter((f) => f.name !== def.titleField)
                    .map((f) => (
                      <th key={f.name} style={TH}>
                        {f.label}
                      </th>
                    ))}
                  <th style={TH} />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const status = def.statusField ? String(row[def.statusField] ?? '') : '';
                  return (
                    <tr key={String(row.id)}>
                      <td style={TD}>
                        <strong>{String(row[def.titleField] ?? '—')}</strong>
                      </td>
                      {listFields
                        .filter((f) => f.name !== def.titleField)
                        .map((f) => (
                          <td
                            key={f.name}
                            style={{
                              ...TD,
                              textAlign: f.kind === 'num' || f.kind === 'int' ? 'left' : 'start',
                              // فقط ستون وضعیت رنگ می‌گیرد؛ رنگ روی همه
                              // یعنی رنگ روی هیچ.
                              color:
                                f.name === def.statusField
                                  ? (def.statusColors?.[status] ?? 'var(--text)')
                                  : undefined,
                              fontWeight: f.name === def.statusField ? 700 : 400,
                            }}
                          >
                            {render(f, row)}
                          </td>
                        ))}
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => startEdit(row)} style={BTN_SM}>
                          {t('edit')}
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          disabled={busy === String(row.id)}
                          style={{ ...BTN_SM, color: 'var(--danger)' }}
                        >
                          {t('delete')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
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

const FORM: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  alignItems: 'end',
};

const INPUT: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 15,
  fontFamily: 'inherit',
  minHeight: 40,
  width: '100%',
  boxSizing: 'border-box',
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

const TABLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 640,
};

const TH: React.CSSProperties = {
  textAlign: 'start',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--muted)',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
};

const TD: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: 14,
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
