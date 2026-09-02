'use client';

import { useCallback, useRef, useState } from 'react';

import { api } from '../lib/api';
import { useI18n } from '../lib/i18n-context';
import { TOUCH } from './ui';

/**
 * پشتیبان و بازیابیِ **ساختار** — شعبه، انبار، کدینگ حساب، دسته‌بندی.
 *
 * ⚠️ جریان **دو مرحله‌ای و اجباری** است: اول دیدن، بعد نوشتن.
 *
 *    همان درسِ ورودِ کالا، ولی اینجا گران‌تر: حساب‌ها به سندها گره
 *    می‌خورند.  کاربر باید پیش از نوشتن ببیند چند ردیف تازه است و
 *    چند ردیف از قبل هست.
 *
 * ⚠️ فایل هرگز خودکار اعمال نمی‌شود.
 *
 *    انتخابِ فایل فقط پیش‌نمایش می‌گیرد.  دکمهٔ «اعمال» جداست، چون
 *    کلیکِ اشتباه روی یک فایلِ غلط، ساختاری می‌سازد که پاک کردنش از
 *    ساختنش سخت‌تر است.
 */

type PlanRow = {
  table: string;
  label: string;
  created: number;
  existing: number;
  skipped: number;
};

type Plan = {
  dryRun: boolean;
  tables: PlanRow[];
  created: number;
  existing: number;
  warnings: string[];
};

export default function StructureBackup() {
  const { t } = useI18n();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [foreignErrors, setForeignErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [file, setFile] = useState<unknown>(null);
  const pick = useRef<HTMLInputElement>(null);

  // ⚠️ نوعِ فایلِ نرم‌افزارِ دیگر باید **پیش از** انتخاب مشخص شود.
  //
  //    یک CSV با ستون‌های «کد، نام» هم می‌تواند کدینگ حساب باشد هم
  //    فهرست تأمین‌کننده.  حدس زدنش یعنی گاهی درست و گاهی فاجعه.
  const [kind, setKind] = useState<'Account' | 'Category' | 'Supplier'>('Account');
  const foreign = useRef<HTMLInputElement>(null);

  const download = useCallback(async () => {
    setBusy(true);
    setError('');
    setNote('');

    try {
      const data = await api<unknown>('/structure/export');

      // ⚠️ نامِ فایل تاریخ دارد.
      //
      //    بدونش، دانلودِ دوم روی اولی می‌افتد یا «(1)» می‌گیرد و
      //    کاربر نمی‌داند کدام تازه‌تر است — دقیقاً وقتی که اهمیت
      //    دارد، یعنی هنگام بازیابی.
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `molido-structure-${stamp}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setNote(t('structureSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('structureFailed'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const preview = useCallback(
    async (raw: string) => {
      setBusy(true);
      setError('');
      setNote('');
      setPlan(null);

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // ⚠️ خطای تجزیه پیش از تماس با سرور گرفته می‌شود: پیامِ
        //    «فایل خوانده نشد» از یک ۴۰۰ خشک روشن‌تر است.
        setBusy(false);
        setError(t('structureBadFile'));
        return;
      }

      try {
        const result = await api<Plan>('/structure/restore?dryRun=true', {
          method: 'POST',
          body: JSON.stringify(parsed),
        });
        setPlan(result);
        setFile(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('structureFailed'));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  /**
   * فایلِ نرم‌افزارِ دیگر ← همان پیش‌نمایشِ ساختار.
   *
   * ⚠️ به همان مسیر می‌ریزد، نه به مسیرِ دوم.  خروجیِ تبدیل دقیقاً
   *    فایلِ ساختار است، پس پیش‌نمایش و اعمالش همان کدِ آزموده است.
   */
  const convert = useCallback(
    async (csv: string) => {
      setBusy(true);
      setError('');
      setNote('');
      setPlan(null);

      try {
        const out = await api<{
          file: unknown;
          rows: number;
          matched: Record<string, string>;
          errors: Array<{ line: number; message: string }>;
        }>('/structure/convert', {
          method: 'POST',
          body: JSON.stringify({ kind, csv }),
        });

        if (!out.rows) {
          // ⚠️ صفر سطر یعنی ستون‌ها شناخته نشدند — و پیام باید همین
          //    را بگوید، نه «انجام نشد».  کاربر باید بداند در فایلش
          //    دنبال چه بگردد.
          setError(
            `${t('structureNoRows')} ${out.errors[0]?.message ?? ''}`.trim(),
          );
          return;
        }

        setForeignErrors(out.errors);
        await preview(JSON.stringify(out.file));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('structureFailed'));
      } finally {
        setBusy(false);
      }
    },
    [kind, preview, t],
  );

  const apply = useCallback(async () => {
    if (!file) return;

    setBusy(true);
    setError('');

    try {
      const result = await api<Plan>('/structure/restore', {
        method: 'POST',
        body: JSON.stringify(file),
      });
      setPlan(result);
      setFile(null);
      setNote(t('structureRestored'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('structureFailed'));
    } finally {
      setBusy(false);
    }
  }, [file, t]);

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h3 style={{ marginTop: 0 }}>{t('structureTitle')}</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('structureHint')}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn-sm" disabled={busy} onClick={() => void download()}>
          {t('structureExport')}
        </button>

        <button
          type="button"
          className="btn-sm ghost"
          disabled={busy}
          onClick={() => pick.current?.click()}
        >
          {t('structureChoose')}
        </button>

        <input
          ref={pick}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            // پاک کردن مقدار: بدون آن، انتخاب دوبارهٔ همان فایل هیچ
            // رویدادی نمی‌سازد.
            event.target.value = '';
            if (!chosen) return;
            void chosen.text().then((text) => preview(text));
          }}
        />

        {note ? <span className="muted">{note}</span> : null}
      </div>

      {/* ⚠️ مسیرِ نرم‌افزارِ دیگر جداست، نه در همان دکمه.
          فایلِ JSON ساختارِ مولیدو و فایلِ CSV نرم‌افزارِ دیگر دو چیز
          کاملاً متفاوت‌اند؛ یک دکمه برای هر دو یعنی کاربر فایلِ اشتباه
          بدهد و پیامِ نامفهوم بگیرد. */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
        }}
      >
        <span className="muted">{t('structureForeign')}</span>

        <select
          style={{ ...TOUCH, minHeight: 38 }}
          value={kind}
          disabled={busy}
          aria-label={t('structureKind')}
          onChange={(event) => setKind(event.target.value as typeof kind)}
        >
          <option value="Account">{t('structureAccounts')}</option>
          <option value="Category">{t('structureCategories')}</option>
          <option value="Supplier">{t('structureSuppliers')}</option>
        </select>

        <button
          type="button"
          className="btn-sm ghost"
          disabled={busy}
          onClick={() => foreign.current?.click()}
        >
          {t('structureForeignPick')}
        </button>

        <input
          ref={foreign}
          type="file"
          accept=".csv,.txt,text/csv"
          style={{ display: 'none' }}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = '';
            if (!chosen) return;
            setForeignErrors([]);
            void chosen.text().then((text) => convert(text));
          }}
        />
      </div>

      {/* سطرهایی که خوانده نشدند — با شمارهٔ خط، وگرنه کاربر نمی‌داند
          کجای فایلِ هزارسطری را نگاه کند. */}
      {foreignErrors.length ? (
        <details style={{ marginTop: 8 }}>
          <summary className="muted">
            {t('structureSkipped')}: {foreignErrors.length}
          </summary>
          <ul className="muted">
            {foreignErrors.slice(0, 20).map((row) => (
              <li key={row.line}>
                {t('line')} {row.line} — {row.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? <div className="error">{error}</div> : null}

      {plan ? (
        <div style={{ marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'start' }}>{t('structureKind')}</th>
                <th style={{ textAlign: 'start' }}>{t('structureNew')}</th>
                <th style={{ textAlign: 'start' }}>{t('structureExisting')}</th>
              </tr>
            </thead>
            <tbody>
              {plan.tables
                .filter((row) => row.created + row.existing + row.skipped > 0)
                .map((row) => (
                  <tr key={row.table}>
                    <td>{row.label}</td>
                    <td>{row.created}</td>
                    <td className="muted">{row.existing}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {plan.warnings.length ? (
            <ul className="muted" style={{ marginTop: 8 }}>
              {plan.warnings.slice(0, 10).map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {/* ⚠️ «اعمال» فقط پس از پیش‌نمایش دیده می‌شود، و پس از اعمال
              ناپدید می‌شود تا دوباره زده نشود. */}
          {plan.dryRun && file ? (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn-sm" disabled={busy} onClick={() => void apply()}>
                {t('structureApply')} ({plan.created})
              </button>
              <span className="muted">{t('structureSafe')}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
