'use client';

import { useCallback, useRef, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import StructureBackup from '../../components/StructureBackup';
import { NUM, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';
import { amountOnly } from '../../lib/money';

/**
 * ورود گروهی کالا از فایل.
 *
 * فروشگاهی که از نرم‌افزار دیگری می‌آید هزاران کالا دارد؛ بدون این،
 * راه‌اندازی یعنی هفته‌ها تایپ دستی.
 *
 * جریان کار **دو مرحله‌ای و اجباری** است: اول دیدن، بعد نوشتن.  فایلی که
 * ستون‌هایش اشتباه تشخیص داده شده هزاران کالای خراب می‌سازد، و پاک کردنشان
 * از خودِ ورود سخت‌تر است.
 */

type Row = {
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  categoryName: string | null;
  stock: number;
};

type RowError = { line: number; message: string; raw: string };

type Preview = {
  headers: string[];
  mapped: Record<string, string>;
  missing: string[];
  rows: Row[];
  errors: RowError[];
  total: number;
  willCreate: number;
  willUpdate: number;
};

type Result = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: RowError[];
};

const FIELD_LABEL: Record<string, string> = {
  name: 'name',
  sku: 'code',
  barcode: 'barcode',
  unit: 'unit',
  purchasePrice: 'purchasePrice',
  salePrice: 'salePrice',
  categoryName: 'category',
  stock: 'stockQty',
  minStock: 'lowStock',
};

export default function ImportPage() {
  const { t } = useI18n();

  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fa = useCallback((value: unknown) => amountOnly(value), []);

  /**
   * خواندن فایل در مرورگر.
   *
   * `UTF-8` صریح داده می‌شود: بدون آن، فایل اکسل فارسی با کدگذاری سیستم
   * خوانده می‌شود و همهٔ متن به علامت سؤال تبدیل می‌گردد.
   */
  function onFile(file: File) {
    setFileName(file.name);
    setPreview(null);
    setResult(null);
    setError('');

    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.onerror = () => setError(t('fileReadError'));
    reader.readAsText(file, 'UTF-8');
  }

  async function runPreview() {
    if (!csv.trim()) return;

    setBusy(true);
    setError('');
    setResult(null);

    try {
      setPreview(await api<Preview>('/products/import/preview', {
        method: 'POST',
        body: { csv },
      }));
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    setError('');

    try {
      setResult(await api<Result>('/products/import', {
        method: 'POST',
        body: { csv },
      }));
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t('importTitle')} subtitle={t('importSubtitle')}>
      {error ? <div className="error">{error}</div> : null}

      {/* ---------- گام ۱: فایل ---------- */}
      <div className="card">
        <h3>{t('importStep1')}</h3>
        <p className="muted">{t('importFormatHint')}</p>

        <div className="filters" style={{ marginTop: 10 }}>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
            }}
          />

          <button
            type="button"
            className="btn"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="inbox" size={17} /> {t('chooseFile')}
          </button>

          {fileName ? <span className="muted">{fileName}</span> : null}

          <button
            type="button"
            className="btn-sm"
            style={{ marginInlineStart: 'auto' }}
            disabled={busy || !csv.trim()}
            onClick={() => void runPreview()}
          >
            <Icon name="search" size={15} /> {t('importPreview')}
          </button>
        </div>

        {/* چسباندن مستقیم هم ممکن است: کاربری که فایل ندارد ولی جدول را
            از اکسل کپی کرده، نباید مجبور شود اول فایل بسازد. */}
        <textarea
          rows={4}
          style={{ ...TOUCH, width: '100%', marginTop: 10, fontFamily: 'monospace' }}
          placeholder={t('pasteHere')}
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setPreview(null);
            setResult(null);
          }}
        />
      </div>

      {/* ---------- گام ۲: پیش‌نمایش ---------- */}
      {preview ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Icon name="clipboard" size={22} />
              </div>
              <div className="stat-label">{t('importTotal')}</div>
              <div className="stat-value">{fa(preview.total)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <Icon name="plus" size={22} />
              </div>
              <div className="stat-label">{t('importWillCreate')}</div>
              <div className="stat-value">{fa(preview.willCreate)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <Icon name="refresh" size={22} />
              </div>
              <div className="stat-label">{t('importWillUpdate')}</div>
              <div className="stat-value">{fa(preview.willUpdate)}</div>
            </div>
            <div
              className="stat-card"
              style={
                preview.errors.length
                  ? { borderTop: '3px solid var(--danger)' }
                  : undefined
              }
            >
              <div className="stat-icon">
                <Icon name="alert" size={22} />
              </div>
              <div className="stat-label">{t('importRejected')}</div>
              <div className="stat-value">{fa(preview.errors.length)}</div>
            </div>
          </div>

          {/* نگاشت ستون‌ها باید دیده شود: تشخیص خودکار گاهی اشتباه می‌کند و
              تنها راه فهمیدنش، نشان دادن آن است. */}
          <div className="card">
            <h3>{t('importMapping')}</h3>
            <div className="chips-row">
              {Object.entries(preview.mapped).map(([field, header]) => (
                <span key={field} className="badge">
                  {t(FIELD_LABEL[field] ?? field)} ← {header}
                </span>
              ))}
            </div>
          </div>

          {preview.errors.length ? (
            <div className="card">
              <h3 style={{ color: 'var(--danger)' }}>{t('importRejectedRows')}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('line')}</th>
                      <th>{t('reason')}</th>
                      <th>{t('content')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((row) => (
                      <tr key={`${row.line}-${row.message}`} style={ROW}>
                        <td style={{ ...TD, ...NUM }}>{fa(row.line)}</td>
                        <td style={TD}>{row.message}</td>
                        <td style={TD} className="muted">
                          {row.raw}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="card">
            <h3>{t('importSample')}</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('name')}</th>
                    <th>{t('code')}</th>
                    <th>{t('unit')}</th>
                    <th>{t('purchasePrice')}</th>
                    <th>{t('salePrice')}</th>
                    <th>{t('stockQty')}</th>
                    <th>{t('category')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.sku} style={ROW}>
                      <td style={TD}>{row.name}</td>
                      <td style={TD}>{row.sku}</td>
                      <td style={TD}>{row.unit}</td>
                      <td style={{ ...TD, ...NUM }}>{fa(row.purchasePrice)}</td>
                      <td style={{ ...TD, ...NUM }}>{fa(row.salePrice)}</td>
                      <td style={{ ...TD, ...NUM }}>{fa(row.stock)}</td>
                      <td style={TD}>{row.categoryName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              className="btn"
              style={{ marginTop: 12 }}
              disabled={busy || preview.total === 0}
              onClick={() => void runImport()}
            >
              <Icon name="check" size={17} />{' '}
              {busy
                ? t('importing')
                : `${t('importConfirm')} ${fa(preview.total)} ${t('rowsWord')}`}
            </button>
          </div>
        </>
      ) : null}

      {/* ---------- نتیجه ---------- */}
      {result ? (
        <div
          className="card"
          style={{
            borderInlineStart: `4px solid ${
              result.failed ? 'var(--warning)' : 'var(--success)'
            }`,
          }}
        >
          <h3>{t('importDone')}</h3>
          <p>
            {t('importWillCreate')}: <strong>{fa(result.created)}</strong> —{' '}
            {t('importWillUpdate')}: <strong>{fa(result.updated)}</strong> —{' '}
            {t('importRejected')}: <strong>{fa(result.failed)}</strong>
          </p>

          {result.errors.length ? (
            <ul className="muted">
              {result.errors.slice(0, 10).map((row) => (
                <li key={`${row.line}-${row.message}`}>
                  {t('line')} {fa(row.line)}: {row.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ⚠️ ساختار زیرِ ورودِ کالاست، نه بالایش.
          فروشگاهی که از نرم‌افزار دیگری می‌آید اول ساختار را لازم
          دارد — ولی کاری که هر روز تکرار می‌شود ورودِ کالاست، و
          کارِ روزمره باید اول دیده شود. */}
      <StructureBackup />
    </AppShell>
  );
}
