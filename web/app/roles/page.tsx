'use client';

/**
 * اختیارات نقش‌ها.
 *
 * تا امروز نقش‌ها در کد ثابت بودند: فروشگاهی که می‌خواست صندوق‌دارش
 * گزارش فروش ببیند، باید کد را عوض می‌کرد و دوباره مستقر می‌شد.
 *
 * ⚠️ جدول عمداً **سه حالت** دارد، نه دو.
 *
 *    «پیش‌فرض» با «ممنوع» یکی نیست: اولی یعنی «هرچه سامانه گفته» و
 *    دومی یعنی «صریحاً نه».  اگر فقط تیک بود، مدیر نمی‌فهمید کدام
 *    تنظیم را خودش گذاشته و کدام پیش‌فرض بوده — و برگرداندن به حالت
 *    اولیه ناممکن می‌شد.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { useI18n } from '../../lib/i18n-context';
import { api } from '../../lib/api';

type Role = { code: string; label: string };

type Item = {
  key: string;
  label: string;
  defaultRoles: string[];
  overrides: Record<string, boolean | undefined>;
};

type Group = { group: string; label: string; items: Item[] };

type Catalog = { roles: Role[]; groups: Group[] };

/** سه حالتِ یک خانه. */
type State = 'default' | 'allow' | 'deny';

function stateOf(item: Item, role: string): State {
  const o = item.overrides[role];
  if (o === undefined) return 'default';
  return o ? 'allow' : 'deny';
}

/** آیا در حالت پیش‌فرض، این نقش اجازه دارد؟ */
function defaultAllows(item: Item, role: string): boolean {
  return item.defaultRoles.includes(role);
}

export default function RolesPage() {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /** ⚠️ در مسیر موفق خطا را پاک نمی‌کند — آن کارِ شروعِ هر عملیات است. */
  const load = useCallback(async () => {
    try {
      setCatalog(await api<Catalog>('/roles/permissions'));
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

  /**
   * چرخهٔ سه‌حالته: پیش‌فرض → مجاز → ممنوع → پیش‌فرض.
   *
   * «بازگشت به پیش‌فرض» ردیف را **حذف** می‌کند، نه اینکه ممنوع
   * بگذارد — وگرنه نامش با کارش نمی‌خواند.
   */
  const cycle = async (item: Item, role: string) => {
    if (role === 'SUPER_ADMIN') return;

    const current = stateOf(item, role);
    const next: State =
      current === 'default' ? 'allow' : current === 'allow' ? 'deny' : 'default';

    setError('');
    setBusy(`${role}:${item.key}`);
    try {
      if (next === 'default') {
        await api(`/roles/${role}/${item.key}`, { method: 'DELETE' });
        flash('به پیش‌فرض برگشت');
      } else {
        await api('/roles', {
          method: 'PUT',
          body: { role, permission: item.key, allowed: next === 'allow' },
        });
        flash(next === 'allow' ? 'اجازه داده شد' : 'اجازه گرفته شد');
      }
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!catalog) {
    return (
      <AppShell title="اختیارات نقش‌ها">
        {error ? (
          <div role="alert" style={ALERT}>
            {error}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)' }}>در حال بارگذاری…</p>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell title="اختیارات نقش‌ها">
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

        <div style={{ ...CARD, gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            {t('rolCycleHint')}
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
            <span><Chip state="default" /> پیش‌فرض سامانه</span>
            <span><Chip state="allow" /> اجازه داده شده</span>
            <span><Chip state="deny" /> اجازه گرفته شده</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            «پیش‌فرض» با «ممنوع» فرق دارد: اولی یعنی هرچه سامانه گفته، دومی یعنی
            صریحاً نه. مدیر ارشد همیشه همه‌چیز را دارد و قابل تغییر نیست.
          </p>
        </div>

        {catalog.groups.map((group) => (
          <section key={group.group} style={{ display: 'grid', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{group.label}</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, minWidth: 180 }}>{t('rolAction')}</th>
                    {catalog.roles.map((r) => (
                      <th key={r.code} style={{ ...TH, textAlign: 'center' }}>
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.key}>
                      <td style={TD}>
                        <strong>{item.label}</strong>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.key}</div>
                      </td>
                      {catalog.roles.map((r) => {
                        const state = stateOf(item, r.code);
                        const locked = r.code === 'SUPER_ADMIN';
                        return (
                          <td key={r.code} style={{ ...TD, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => void cycle(item, r.code)}
                              disabled={locked || busy === `${r.code}:${item.key}`}
                              title={
                                locked
                                  ? 'مدیر ارشد قابل محدود کردن نیست'
                                  : state === 'default'
                                    ? defaultAllows(item, r.code)
                                      ? 'پیش‌فرض: اجازه دارد'
                                      : 'پیش‌فرض: اجازه ندارد'
                                    : state === 'allow'
                                      ? 'اجازه داده شده'
                                      : 'اجازه گرفته شده'
                              }
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: locked ? 'not-allowed' : 'pointer',
                                padding: 4,
                                opacity: locked ? 0.5 : 1,
                              }}
                            >
                              <Chip
                                state={state}
                                muted={state === 'default' && !defaultAllows(item, r.code)}
                              />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

/**
 * نشانهٔ حالت.
 *
 * حالتِ «پیش‌فرض» دو شکل دارد: پیش‌فرضی که اجازه می‌دهد و پیش‌فرضی که
 * نمی‌دهد.  هر دو «دست‌نخورده»اند ولی مدیر باید بداند نتیجه‌شان چیست —
 * وگرنه نمی‌فهمد چرا صندوق‌دارش نمی‌تواند کاری را بکند.
 */
function Chip({ state, muted }: { state: State; muted?: boolean }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    width: 22,
    height: 22,
    lineHeight: '22px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center',
  };

  if (state === 'allow') {
    return <span style={{ ...style, background: 'color-mix(in srgb, var(--success) 13%, transparent)', color: 'var(--success)' }}>✓</span>;
  }
  if (state === 'deny') {
    return <span style={{ ...style, background: 'color-mix(in srgb, var(--danger) 13%, transparent)', color: 'var(--danger)' }}>✕</span>;
  }
  return (
    <span
      style={{
        ...style,
        background: 'var(--border)',
        color: muted ? 'var(--muted)' : 'var(--text)',
      }}
    >
      {muted ? '–' : '·'}
    </span>
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

const TH: React.CSSProperties = {
  textAlign: 'start',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--muted)',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
};

const TD: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 14,
  borderBottom: '1px solid var(--border)',
};

const ALERT: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
  color: 'var(--danger)',
};
