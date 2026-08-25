'use client';

/**
 * کلیدهای API.
 *
 * شش مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد.
 *
 * ⚠️ چرا این یکی با موتورِ `[domain]` ساخته **نشد**؟
 *
 *    جدولِ `ApiKey` ستونِ `keyHash` دارد و رابطِ CRUD عمومی همهٔ
 *    ستون‌ها را نشان می‌دهد و همه را هم قابلِ نوشتن می‌کند.  یعنی هم
 *    درهم‌سازی دیده می‌شد، هم کاربر می‌توانست خودش تعیینش کند.
 *
 *    کلیدِ API تنها چیزی در این پروژه است که **یک بار** دیده می‌شود و
 *    دیگر هرگز.  آن رفتار را فرمِ عمومی نمی‌تواند بسازد.
 *
 * ⚠️ چیزی که این صفحه باید بی‌درنگ جواب بدهد:
 *    **کدام کلید هنوز کار می‌کند و کدام مدت‌هاست استفاده نشده.**
 *    کلیدِ فراموش‌شده‌ای که فعال مانده، بزرگ‌ترین ریسکِ این جدول است.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

/** پاسخِ ساخت — تنها جایی که متنِ خام وجود دارد. */
type CreatedKey = ApiKey & { key: string };

const DAY = 86_400_000;

/** «۳ روز پیش» به‌جای تاریخِ خام: سؤال «چقدر بی‌استفاده مانده» است. */
function sinceDays(iso: string | null): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.floor((Date.now() - at) / DAY);
}

function expiryState(iso: string | null): 'none' | 'soon' | 'expired' {
  if (!iso) return 'none';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return 'none';
  if (at < Date.now()) return 'expired';
  return at - Date.now() < 7 * DAY ? 'soon' : 'none';
}

export default function ApiKeysPage() {
  const { t } = useI18n();

  const [list, setList] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * کلیدِ تازه‌ساخته‌شده.
   *
   * ⚠️ در state می‌ماند و **هرگز دوباره از سرور نمی‌آید**.  اگر کاربر
   *    صفحه را ببندد، رفته است.  همین باعث می‌شود هشدارِ زیرش لازم
   *    باشد، نه تزئینی.
   */
  const [fresh, setFresh] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<ApiKey[]>('/api-keys'));
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('نام کلید الزامی است');
      return;
    }

    const body: Record<string, unknown> = { name: name.trim() };
    if (expiresAt) body.expiresAt = expiresAt;

    setBusy('save');
    try {
      const created = await api<CreatedKey>('/api-keys', { method: 'POST', body });
      setFresh(created);
      setCopied(false);
      setName('');
      setExpiresAt('');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (key: ApiKey) => {
    setBusy(key.id);
    setError('');
    try {
      await api(`/api-keys/${key.id}`, {
        method: 'PATCH',
        body: { isActive: !key.isActive },
      });
      flash(key.isActive ? 'کلید غیرفعال شد' : 'کلید فعال شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (key: ApiKey) => {
    // ⚠️ حذفِ کلید هر مصرف‌کننده‌ای را بی‌درنگ می‌شکند و برگشت ندارد.
    if (!window.confirm(`کلید «${key.name}» برای همیشه حذف شود؟`)) return;
    setBusy(key.id);
    setError('');
    try {
      await api(`/api-keys/${key.id}`, { method: 'DELETE' });
      flash('کلید حذف شد');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.key);
      setCopied(true);
    } catch {
      // ⚠️ کلیپ‌بورد در بافتِ ناامن (http) کار نمی‌کند.  به‌جای پیامِ
      //    خطا، متن انتخاب‌پذیر است و کاربر دستی برمی‌دارد.
      setCopied(false);
    }
  };

  /** خلاصه‌ای که مدیر باید بدون کلیک ببیند. */
  const summary = useMemo(() => {
    const stale = list.filter((k) => {
      if (!k.isActive) return false;
      const days = sinceDays(k.lastUsedAt);
      // هرگز استفاده‌نشده‌ای که بیش از ۳۰ روز از ساختش گذشته، یا
      // کلیدی که ۹۰ روز است سکوت کرده.
      if (days === null) return (sinceDays(k.createdAt) ?? 0) > 30;
      return days > 90;
    });
    return {
      total: list.length,
      active: list.filter((k) => k.isActive).length,
      expired: list.filter((k) => k.isActive && expiryState(k.expiresAt) === 'expired').length,
      stale: stale.length,
    };
  }, [list]);

  return (
    <AppShell title={t('menuApiKeys')}>
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

        {/* ⚠️ تنها باری که متنِ خام دیده می‌شود.  اگر کاربر این را
            برندارد، دیگر هیچ‌جا نیست — چون سرور فقط درهم‌سازی دارد. */}
        {fresh ? (
          <div
            role="status"
            style={{
              ...CARD,
              borderColor: 'var(--success)',
              background: 'color-mix(in srgb, var(--success) 8%, var(--surface))',
            }}
          >
            <h2 style={H2}>کلید ساخته شد — همین حالا کپی کنید</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
              این کلید فقط همین یک بار نمایش داده می‌شود. سرور تنها
              درهم‌سازی‌اش را نگه می‌دارد، پس بازیابی‌اش ممکن نیست. اگر
              گمش کنید باید کلید تازه بسازید.
            </p>
            <code
              style={{
                display: 'block',
                padding: 12,
                borderRadius: 9,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 14,
                overflowWrap: 'anywhere',
                userSelect: 'all',
              }}
            >
              {fresh.key}
            </code>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={BTN_PRIMARY} onClick={() => void copy()}>
                {copied ? 'کپی شد ✓' : 'کپی'}
              </button>
              <button type="button" style={BTN} onClick={() => setFresh(null)}>
                برداشتم، ببند
              </button>
            </div>
          </div>
        ) : null}

        {/* دو چیزی که واقعاً فوری‌اند: کلیدِ منقضیِ هنوز فعال، و
            کلیدی که کسی دیگر استفاده‌اش نمی‌کند ولی باز مانده. */}
        {summary.expired > 0 || summary.stale > 0 ? (
          <div
            role="status"
            style={{
              ...ALERT,
              background: 'color-mix(in srgb, var(--warning) 13%, transparent)',
              color: 'var(--warning)',
              display: 'grid',
              gap: 4,
            }}
          >
            {summary.expired > 0 ? (
              <span>{summary.expired} کلید منقضی شده ولی هنوز فعال است</span>
            ) : null}
            {summary.stale > 0 ? (
              <span>{summary.stale} کلید فعال مدت‌هاست استفاده نشده</span>
            ) : null}
          </div>
        ) : null}

        <section style={CARD}>
          <h2 style={H2}>کلید تازه</h2>
          <form style={FORM} onSubmit={submit}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>نام</span>
              <input
                style={INPUT}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: اپ موبایل انبار"
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={LABEL}>انقضا (اختیاری)</span>
              <input
                style={INPUT}
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
            <button type="submit" style={BTN_PRIMARY} disabled={busy === 'save'}>
              {busy === 'save' ? 'در حال ساخت…' : 'ساخت کلید'}
            </button>
          </form>
        </section>

        <section style={CARD}>
          <h2 style={H2}>
            کلیدها{' '}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
              {summary.active} فعال از {summary.total}
            </span>
          </h2>

          {list.length === 0 ? (
            <p style={EMPTY}>هنوز کلیدی ساخته نشده است.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={TH}>نام</th>
                    <th style={TH}>پیشوند</th>
                    <th style={TH}>وضعیت</th>
                    <th style={TH}>آخرین استفاده</th>
                    <th style={TH}>انقضا</th>
                    <th style={TH}> </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((key) => {
                    const days = sinceDays(key.lastUsedAt);
                    const exp = expiryState(key.expiresAt);
                    return (
                      <tr key={key.id}>
                        <td style={TD}>{key.name}</td>
                        <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>
                          {key.prefix}…
                        </td>
                        <td style={TD}>
                          <span
                            style={{
                              color: key.isActive ? 'var(--success)' : 'var(--muted)',
                              fontWeight: 700,
                            }}
                          >
                            {key.isActive ? 'فعال' : 'غیرفعال'}
                          </span>
                        </td>
                        <td style={TD}>
                          {days === null ? (
                            <span style={{ color: 'var(--muted)' }}>هرگز</span>
                          ) : days === 0 ? (
                            'امروز'
                          ) : (
                            `${days} روز پیش`
                          )}
                        </td>
                        <td style={TD}>
                          {key.expiresAt ? (
                            <span
                              style={{
                                color:
                                  exp === 'expired'
                                    ? 'var(--danger)'
                                    : exp === 'soon'
                                      ? 'var(--warning)'
                                      : 'inherit',
                              }}
                            >
                              {new Date(key.expiresAt).toLocaleDateString('fa-IR')}
                              {exp === 'expired' ? ' (منقضی)' : ''}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>ندارد</span>
                          )}
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            style={BTN_SM}
                            disabled={busy === key.id}
                            onClick={() => void toggle(key)}
                          >
                            {key.isActive ? 'غیرفعال' : 'فعال'}
                          </button>{' '}
                          <button
                            type="button"
                            style={{ ...BTN_SM, color: 'var(--danger)' }}
                            disabled={busy === key.id}
                            onClick={() => void remove(key)}
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  alignItems: 'end',
};

const LABEL: React.CSSProperties = { fontSize: 13, color: 'var(--muted)' };

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
  padding: '6px 12px',
  fontSize: 13,
  minHeight: 36,
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
