'use client';

/**
 * پیامک: ارسال گروهی، انصراف مشتری، تاریخچه و قالب.
 *
 * چرا پیش‌نمایش قدم اول است و ارسال قدم دوم: دکمه‌ای که مستقیم به هزار
 * مشتری پیام می‌دهد بدون اینکه بگوید چند نفر و چند قبض، دیر یا زود یک
 * اشتباه گران می‌سازد — و پیامکِ فرستاده‌شده برنمی‌گردد.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { StatCard, TOUCH } from '../../components/ui';
import { useI18n } from '../../lib/i18n-context';
import { api } from '../../lib/api';
import { amountOnly } from '../../lib/money';

const fa = (value: unknown) => amountOnly(value);

type Stats = {
  sent: string;
  failed: string;
  skipped: string;
  queued: string;
  sent30d: string;
  optedOut: string;
};

type Message = {
  id: string;
  phone: string;
  body: string;
  status: string;
  skipReason: string | null;
  error: string | null;
  kind: string;
  createdAt: string;
};

type Template = { id: string; name: string; body: string };

type OptOut = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  smsOptOutAt: string | null;
};

type Preview = {
  total: number;
  willSend: number;
  segments: number;
  segmentsPerMessage: number;
  sample: Array<{ phone: string; body: string }>;
  skipped: { optedOut: number; invalidPhone: number; duplicate: number };
};

const TABS = ['send', 'history', 'optout', 'templates'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  send: 'ارسال',
  history: 'تاریخچه',
  optout: 'انصراف‌ها',
  templates: 'قالب‌ها',
};

const STATUS_LABEL: Record<string, string> = {
  SENT: 'ارسال شد',
  FAILED: 'ناموفق',
  SKIPPED: 'نرفت',
  QUEUED: 'در صف',
};

const SKIP_LABEL: Record<string, string> = {
  OPTED_OUT: 'انصراف داده',
  INVALID_PHONE: 'شمارهٔ نامعتبر',
  DUPLICATE: 'تکراری',
};

export default function SmsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('send');
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);

  // ---------- فرم ارسال ----------
  const [body, setBody] = useState('');
  const [phones, setPhones] = useState('');
  const [toAll, setToAll] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // ---------- قالب تازه ----------
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState('');

  // ---------- انصراف ----------
  const [optPhone, setOptPhone] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, h, tpl, opt] = await Promise.all([
        api<Stats>('/sms/stats'),
        api<Message[]>('/sms/history?limit=100'),
        api<Template[]>('/sms/templates'),
        api<OptOut[]>('/sms/opt-out'),
      ]);
      setStats(s);
      setHistory(h);
      setTemplates(tpl);
      setOptOuts(opt);
    } catch {
      setError('بارگذاری اطلاعات پیامک ناموفق بود');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** فهرست شماره‌ها از متن چندخطی؛ خط، ویرگول و فاصله همه جداکننده‌اند. */
  function phoneList(): string[] {
    return phones
      .split(/[\n,;،\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  async function doPreview() {
    setError('');
    setFlash('');
    setPreview(null);

    if (!body.trim()) {
      setError('متن پیام را وارد کنید');
      return;
    }

    setBusy(true);
    try {
      const list = phoneList();
      const result = await api<Preview>('/sms/preview', {
        method: 'POST',
        // بدون شماره یعنی «همهٔ مشتریان» — سرور همان را می‌فهمد.
        body: { body, ...(toAll || !list.length ? {} : { phones: list }) },
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'پیش‌نمایش ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  async function doSend() {
    if (!preview) return;

    setBusy(true);
    setError('');
    try {
      const list = phoneList();
      const result = await api<{ sent: number; failed: number; skipped: number }>('/sms/send', {
        method: 'POST',
        body: {
          body,
          ...(toAll || !list.length ? {} : { phones: list }),
          // سقف ایمنی از خودِ پیش‌نمایش: اگر بین پیش‌نمایش و ارسال چیزی
          // عوض شد و تعداد بالا رفت، ارسال انجام نمی‌شود.
          maxRecipients: preview.willSend,
          kind: 'CAMPAIGN',
        },
      });
      setFlash(
        `${fa(result.sent)} پیام ارسال شد` +
          (result.failed ? ` · ${fa(result.failed)} ناموفق` : '') +
          (result.skipped ? ` · ${fa(result.skipped)} نرفت` : ''),
      );
      setPreview(null);
      setBody('');
      setPhones('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ارسال ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!tplName.trim() || !tplBody.trim()) {
      setError('نام و متن قالب را وارد کنید');
      return;
    }
    try {
      await api('/sms/templates', { method: 'POST', body: { name: tplName, body: tplBody } });
      setTplName('');
      setTplBody('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ذخیرهٔ قالب ناموفق بود');
    }
  }

  async function setOptOut(phone: string, optOut: boolean) {
    try {
      await api('/sms/opt-out', { method: 'POST', body: { phone, optOut } });
      setOptPhone('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت انصراف ناموفق بود');
    }
  }

  const field: React.CSSProperties = {
    ...TOUCH,
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 14,
  };

  return (
    <AppShell
      title={t('menuSms')}
      subtitle="ارسال گروهی، انصراف مشتری، تاریخچه و قالب"
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('smsRefresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {flash ? (
        <div className="card" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>
          {flash}
        </div>
      ) : null}

      <div className="stats-grid">
        <StatCard icon="check" label={t('shipped')} value={fa(stats?.sent ?? 0)} />
        <StatCard icon="clock" label="۳۰ روز اخیر" value={fa(stats?.sent30d ?? 0)} />
        <StatCard
          icon="alert"
          label={t('taxFailed')}
          value={fa(stats?.failed ?? 0)}
          accent={Number(stats?.failed ?? 0) > 0 ? 'var(--warning)' : undefined}
        />
        <StatCard icon="x" label="انصراف داده" value={fa(stats?.optedOut ?? 0)} />
      </div>

      <div className="lang-pills" style={{ margin: '18px 0' }}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={`lang-pill${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------- ارسال */}
      {tab === 'send' && (
        <div className="card">
          <h3>{t('smsBulkSend')}</h3>

          <div style={{ marginTop: 12 }}>
            <label htmlFor="sms-body">{t('smsBody')}</label>
            <textarea
              id="sms-body"
              rows={4}
              style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="سلام {name} عزیز، تخفیف ویژهٔ این هفته…"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setPreview(null);
              }}
            />
            <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              {'{name}'} با نام مشتری جایگزین می‌شود. متن فارسی هر ۷۰ نویسه یک قبض است.
            </p>
          </div>

          <div style={{ marginTop: 12 }}>
            <label
              style={{
                ...TOUCH,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={toAll}
                onChange={(e) => {
                  setToAll(e.target.checked);
                  setPreview(null);
                }}
                style={{ width: 18, height: 18 }}
              />
              {t('smsToAll')}
            </label>
          </div>

          {!toAll && (
            <div style={{ marginTop: 12 }}>
              <label htmlFor="sms-phones">{t('smsNumbers')}</label>
              <textarea
                id="sms-phones"
                rows={3}
                style={{ ...field, resize: 'vertical', fontVariantNumeric: 'tabular-nums' }}
                placeholder="۰۹۱۲۱۲۳۴۵۶۷ — هر خط یک شماره، یا با ویرگول"
                value={phones}
                onChange={(e) => {
                  setPhones(e.target.value);
                  setPreview(null);
                }}
              />
            </div>
          )}

          {templates.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span id="grp-sms-tpl">{t('smsFromTemplate')}</span>
              <div role="group" aria-labelledby="grp-sms-tpl" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="btn-sm ghost"
                    onClick={() => {
                      setBody(tpl.body);
                      setPreview(null);
                    }}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className="ghost" onClick={() => void doPreview()} disabled={busy}>
              <Icon name="search" size={16} /> {t('smsPreview')}
            </button>
            {/* دکمهٔ ارسال تا پیش از پیش‌نمایش وجود ندارد.  کاربر باید
                ببیند چند نفر و چند قبض، پیش از اینکه بتواند بفرستد. */}
            {preview && preview.willSend > 0 && (
              <button type="button" onClick={() => void doSend()} disabled={busy}>
                ارسال به {fa(preview.willSend)} نفر ({fa(preview.segments)} قبض)
              </button>
            )}
          </div>

          {preview && (
            <div
              className="card"
              style={{ marginTop: 14, background: 'var(--panel-strong)' }}
            >
              <h4 style={{ margin: 0, fontSize: 14 }}>{t('smsPreviewEmpty')}</h4>
              <div style={{ display: 'grid', gap: 5, marginTop: 10, fontSize: 13 }}>
                <Row k="مخاطب" v={fa(preview.total)} />
                <Row k="ارسال می‌شود" v={fa(preview.willSend)} />
                <Row k="قبض هر پیام" v={fa(preview.segmentsPerMessage)} />
                <Row k="جمع قبض" v={fa(preview.segments)} />
                {preview.skipped.optedOut > 0 && (
                  <Row k="انصراف داده" v={fa(preview.skipped.optedOut)} />
                )}
                {preview.skipped.invalidPhone > 0 && (
                  <Row k="شمارهٔ نامعتبر" v={fa(preview.skipped.invalidPhone)} />
                )}
                {preview.skipped.duplicate > 0 && (
                  <Row k="تکراری" v={fa(preview.skipped.duplicate)} />
                )}
              </div>

              {preview.sample[0] && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: 'var(--bg)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                    نمونه — {preview.sample[0].phone}
                  </div>
                  {preview.sample[0].body}
                </div>
              )}

              {preview.willSend === 0 && (
                <p className="muted" style={{ marginTop: 10 }}>
                  {t('smsNoRecipients')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- تاریخچه */}
      {tab === 'history' && (
        <div className="card">
          <h3>{t('smsHistory')}</h3>
          <p className="muted">
            {t('smsHistoryHint')}
          </p>

          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={TH}>{t('smsColNumber')}</th>
                  <th style={TH}>{t('smsColBody')}</th>
                  <th style={TH}>{t('smsColStatus')}</th>
                  <th style={TH}>{t('smsColReason')}</th>
                  <th style={TH}>{t('smsColDate')}</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 26, textAlign: 'center', color: 'var(--muted)' }}>
                      {t('smsNoneSent')}
                    </td>
                  </tr>
                )}
                {history.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{m.phone}</td>
                    <td style={{ ...TD, maxWidth: 320 }}>{m.body}</td>
                    <td style={TD}>
                      <span
                        className="badge"
                        style={{
                          color:
                            m.status === 'SENT'
                              ? 'var(--success)'
                              : m.status === 'FAILED'
                                ? 'var(--danger)'
                                : 'var(--muted)',
                        }}
                      >
                        {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </td>
                    <td style={{ ...TD, color: 'var(--muted)' }}>
                      {m.skipReason ? (SKIP_LABEL[m.skipReason] ?? m.skipReason) : (m.error ?? '—')}
                    </td>
                    <td style={{ ...TD, color: 'var(--muted)' }}>
                      {new Date(m.createdAt).toLocaleString('fa-IR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- انصراف */}
      {tab === 'optout' && (
        <div className="card">
          <h3>{t('smsOptOut')}</h3>
          <p className="muted">
            {t('smsOptOutHint')}
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input
              style={{ ...field, maxWidth: 220, fontVariantNumeric: 'tabular-nums' }}
              placeholder="شمارهٔ موبایل"
              value={optPhone}
              onChange={(e) => setOptPhone(e.target.value)}
            />
            <button type="button" onClick={() => void setOptOut(optPhone, true)}>
              {t('smsAddOptOut')}
            </button>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={TH}>{t('smsColCustomer')}</th>
                  <th style={TH}>{t('smsColNumber')}</th>
                  <th style={TH}>{t('smsOptOutDate')}</th>
                  <th style={TH} />
                </tr>
              </thead>
              <tbody>
                {optOuts.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 26, textAlign: 'center', color: 'var(--muted)' }}>
                      {t('smsNoOptOut')}
                    </td>
                  </tr>
                )}
                {optOuts.map((c) => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={TD}>
                      {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{c.phone}</td>
                    <td style={{ ...TD, color: 'var(--muted)' }}>
                      {c.smsOptOutAt ? new Date(c.smsOptOutAt).toLocaleDateString('fa-IR') : '—'}
                    </td>
                    <td style={TD}>
                      <button
                        type="button"
                        className="btn-sm ghost"
                        onClick={() => void setOptOut(c.phone, false)}
                      >
                        {t('smsRestore')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- قالب */}
      {tab === 'templates' && (
        <div className="card">
          <h3>{t('smsTemplate')}</h3>
          <p className="muted">
            {t('smsTemplateHint')}
          </p>

          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <input
              style={field}
              placeholder="نام قالب — مثلاً «تخفیف نوروز»"
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
            />
            <textarea
              rows={3}
              style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="متن قالب با {name} و {code}"
              value={tplBody}
              onChange={(e) => setTplBody(e.target.value)}
            />
            <div>
              <button type="button" onClick={() => void saveTemplate()}>
                {t('smsSaveTemplate')}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            {templates.length === 0 && <p className="muted">{t('smsNoTemplate')}</p>}
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{tpl.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
                    {tpl.body}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-sm ghost"
                  onClick={() => {
                    void api(`/sms/templates/${tpl.id}`, { method: 'DELETE' }).then(load);
                  }}
                >
                  {t('smsDelete')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

const TH: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'right',
  fontSize: 12,
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = { padding: '8px 10px' };

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--muted)' }}>{k}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
}
