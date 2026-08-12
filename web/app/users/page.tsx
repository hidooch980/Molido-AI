'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import {
  DataTable,
  ROW,
  StatCard,
  TD,
  TOUCH,
  Tabs,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
};

type AuditEntry = {
  id: string;
  userEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
};

const TABS = [
  { key: 'users', label: 'tabUsers' },
  { key: 'roles', label: 'tabRoles' },
  { key: 'audit', label: 'tabAudit' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * نقش‌ها به‌ترتیب دسترسی، از کم به زیاد.  متن «چه چیزی می‌بیند» از روی
 * `@Roles(...)` واقعی در بک‌اند نوشته شده، نه حدس — تا آنچه اینجا نوشته
 * می‌شود با آنچه سرور اجرا می‌کند یکی باشد.
 */
const ROLES = [
  { key: 'EMPLOYEE', access: 'accessReadOnly', color: 'var(--text-dim)' },
  { key: 'SALES', access: 'accessSales', color: 'var(--accent)' },
  { key: 'CASHIER', access: 'accessSales', color: 'var(--accent)' },
  { key: 'INVENTORY', access: 'accessInventory', color: 'var(--accent)' },
  { key: 'ACCOUNTANT', access: 'accessFinance', color: 'var(--warning)' },
  { key: 'MANAGER', access: 'accessAll', color: 'var(--warning)' },
  { key: 'ADMIN', access: 'accessAll', color: 'var(--danger)' },
  { key: 'SUPER_ADMIN', access: 'accessAll', color: 'var(--danger)' },
] as const;

export default function UsersPage() {
  const { t, locale } = useI18n();

  const [tab, setTab] = useState<TabKey>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    role: 'CASHIER',
  });

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const list = <T,>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [];

  const load = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([
        api<User[]>('/users'),
        // گزارش فعالیت ممکن است برای نقش فعلی مجاز نباشد؛ نبودنش نباید کل
        // صفحه را خراب کند.
        api<AuditEntry[]>('/audit-log').catch(() => []),
      ]);

      setUsers(list<User>(u));
      setAudit(list<AuditEntry>(a));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      users: users.length,
      active: users.filter((item) => item.status === 'ACTIVE').length,
      roles: new Set(users.map((item) => item.role)).size,
      activity: audit.length,
    }),
    [users, audit],
  );

  async function createUser() {
    if (!form.firstName || !form.email || form.password.length < 8) {
      setError(t('passwordHint'));
      return;
    }

    setBusy(true);
    try {
      await api('/users', {
        method: 'POST',
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          role: form.role,
        },
      });

      setForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        role: 'CASHIER',
      });
      setShowForm(false);
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  /** کاربر حذف نمی‌شود، غیرفعال می‌شود: حذف، رد حسابرسی را می‌برد. */
  async function toggleStatus(user: User) {
    setBusy(true);
    try {
      await api(`/users/${user.id}`, {
        method: 'PATCH',
        body: { status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      });
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('usersTitle')}
      subtitle={t('usersSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <StatCard icon="👤" label={t('statUsers')} value={fa(stats.users)} />
        <StatCard
          icon="✅"
          label={t('statActiveUsers')}
          value={fa(stats.active)}
          accent="var(--success)"
        />
        <StatCard icon="🔑" label={t('statRoles')} value={fa(stats.roles)} />
        <StatCard icon="📝" label={t('statActivity')} value={fa(stats.activity)} />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} t={t} />

      {/* کاربران */}
      {tab === 'users' ? (
        <div className="card">
          <div style={{ marginBottom: 14 }}>
            <button
              type="button"
              style={TOUCH}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? t('close') : t('newUser')}
            </button>
          </div>

          {showForm ? (
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 18,
                padding: 14,
                borderRadius: 'var(--radius)',
                background: 'var(--panel-strong)',
              }}
            >
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder={t('firstName')}
                style={{ ...TOUCH, minWidth: 150 }}
              />
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder={t('lastName')}
                style={{ ...TOUCH, minWidth: 150 }}
              />
              <input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder={t('email')}
                style={{ ...TOUCH, minWidth: 200 }}
              />
              <input
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t('phone')}
                style={{ ...TOUCH, minWidth: 150 }}
              />
              <input
                type="password"
                dir="ltr"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={t('passwordHint')}
                style={{ ...TOUCH, minWidth: 180 }}
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={{ ...TOUCH, minWidth: 170 }}
              >
                {ROLES.map((item) => (
                  <option key={item.key} value={item.key}>
                    {t(`role${item.key}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={TOUCH}
                disabled={busy}
                onClick={() => void createUser()}
              >
                {t('createUser')}
              </button>
            </div>
          ) : null}

          <DataTable
            headers={[
              t('name'),
              t('email'),
              t('phone'),
              t('role'),
              t('status'),
              t('actions'),
            ]}
            empty={t('noUsers')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={users.length}
          >
            {users.map((row) => {
              const role = ROLES.find((item) => item.key === row.role);

              return (
                <tr key={row.id} style={ROW}>
                  <td style={TD}>
                    {row.firstName} {row.lastName}
                  </td>
                  <td style={TD} dir="ltr">
                    {row.email}
                  </td>
                  <td style={TD} dir="ltr">
                    {row.phone ?? '—'}
                  </td>
                  <td
                    style={{
                      ...TD,
                      color: role?.color ?? 'var(--text-dim)',
                      fontWeight: 600,
                    }}
                  >
                    {t(`role${row.role}`)}
                  </td>
                  <td
                    style={{
                      ...TD,
                      color:
                        row.status === 'ACTIVE'
                          ? 'var(--success)'
                          : 'var(--danger)',
                    }}
                  >
                    {t(`uStatus${row.status}`)}
                  </td>
                  <td style={TD}>
                    <button
                      type="button"
                      className="ghost"
                      style={TOUCH}
                      disabled={busy}
                      onClick={() => void toggleStatus(row)}
                    >
                      {row.status === 'ACTIVE' ? t('deactivate') : t('activate')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : null}

      {/* سطوح دسترسی */}
      {tab === 'roles' ? (
        <div className="card">
          <p className="muted" style={{ marginBottom: 14 }}>
            {t('rolePermissions')}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {ROLES.map((item) => {
              const count = users.filter((u) => u.role === item.key).length;

              return (
                <div
                  key={item.key}
                  className="stat-card"
                  style={{ borderTop: `3px solid ${item.color}` }}
                >
                  <div style={{ fontWeight: 800, fontSize: 17 }}>
                    {t(`role${item.key}`)}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                    {t(item.access)}
                  </div>
                  <div style={{ marginTop: 10, color: item.color, fontWeight: 700 }}>
                    {fa(count)} {t('user')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* گزارش فعالیت */}
      {tab === 'audit' ? (
        <div className="card">
          <DataTable
            headers={[
              t('date'),
              t('user'),
              t('action'),
              t('entity'),
              t('ipAddress'),
            ]}
            empty={t('noAudit')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={audit.length}
          >
            {audit.map((row) => (
              <tr key={row.id} style={ROW}>
                <td style={TD} className="muted">
                  {new Date(row.createdAt).toLocaleString(locale)}
                </td>
                <td style={TD} dir="ltr">
                  {row.userEmail ?? '—'}
                </td>
                <td style={TD}>{row.action}</td>
                <td style={TD} className="muted">
                  {row.entity ?? '—'}
                </td>
                <td style={TD} dir="ltr" className="muted">
                  {row.ipAddress ?? '—'}
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}
    </AppShell>
  );
}
