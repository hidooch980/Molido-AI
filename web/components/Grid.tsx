'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Icon, type IconName } from './icons';

/**
 * شبکهٔ داده — برای فهرست‌های بزرگ.
 *
 * جدول قبلی برای فروشگاه کوچک نوشته شده بود: کارت‌های بلند، هشت ردیف در
 * صفحه، بدون مرتب‌سازی، بدون انتخاب گروهی، بدون جمع.  فروشگاهی که سه هزار
 * کالا و روزی چهارصد فاکتور دارد با آن کار نمی‌کند — نه از سر زیبایی،
 * از سر سرعت.
 *
 * چیزهایی که اینجا هست و آنجا نبود:
 *
 *   چگالی      سه حالت فشردگی؛ انباردار «فشرده» می‌خواهد، مدیر «راحت».
 *   سربرگ ثابت با اسکرول هزار ردیفی، ستون‌ها باید سر جایشان بمانند.
 *   مرتب‌سازی  کلیک روی سرستون؛ همان‌جا که کاربر انتظار دارد.
 *   انتخاب     چند ردیف، یک عمل — نه چهل بار کلیک.
 *   جمع پایین  جمعِ همان چیزی که فیلتر شده، نه کل پایگاه.
 *   ستون‌ها     نمایش/پنهان؛ هر نقش ستون‌های خودش را می‌خواهد.
 *   خروجی      CSV برای اکسل، چون همیشه یک گزارشی هست که ما نساخته‌ایم.
 *   صفحه‌کلید   جهت‌ها و Enter؛ دست از روی کیبورد برداشته نشود.
 */

export type Column<T> = {
  key: string;
  label: string;
  /** مقدار خام — برای مرتب‌سازی و خروجی. */
  value: (row: T) => string | number | null;
  /** نمایش؛ اگر نباشد از `value` استفاده می‌شود. */
  render?: (row: T) => ReactNode;
  align?: 'start' | 'end';
  /** عددی: راست‌چین با ارقام هم‌عرض. */
  numeric?: boolean;
  /**
   * در ردیف پایین جمع زده شود.
   *
   * جدا از `numeric` و **پیش‌فرض خاموش**: جمعِ «قیمت فروش» یعنی جمع
   * قیمت واحد سه کالای بی‌ربط، که عددی است بی‌معنا و بدتر از نبودن —
   * چون شبیه یک رقم واقعی به نظر می‌رسد.  فقط مقادیر انباشتنی (مبلغ
   * فاکتور، تعداد، موجودی) جمع می‌شوند.
   */
  total?: boolean;
  /** ستون‌های ثانویه که به‌صورت پیش‌فرض پنهان‌اند. */
  optional?: boolean;
  width?: number;
  /**
   * ویرایش درجا.
   *
   * تغییر قیمت سی کالا نباید سی بار «باز کردن فرم، عوض کردن یک عدد،
   * ذخیره، بستن» باشد.  دوبار کلیک روی سلول، تایپ، Enter — و سلول بعدی.
   *
   * ذخیره **بلافاصله** انجام می‌شود نه در پایان: فهرستی که سی تغییر
   * ذخیره‌نشده دارد، با یک تازه‌سازی تصادفی همه‌شان را می‌بازد.
   */
  editable?: {
    type: 'number' | 'text';
    save: (row: T, value: string) => Promise<void>;
  };
};

export type Density = 'compact' | 'normal' | 'relaxed';

const ROW_PADDING: Record<Density, string> = {
  compact: '4px 8px',
  normal: '8px 10px',
  relaxed: '13px 12px',
};

const FONT_SIZE: Record<Density, number> = {
  compact: 12.5,
  normal: 13.5,
  relaxed: 14.5,
};

type Props<T> = {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: string;
  /** انتخاب گروهی؛ نبودنش یعنی ستون تیک نمایش داده نمی‌شود. */
  onSelectionChange?: (keys: string[]) => void;
  onRowClick?: (row: T) => void;
  /** عمل‌های انتهای هر ردیف. */
  rowActions?: (row: T) => ReactNode;
  /** نام فایل خروجی؛ نبودنش دکمهٔ خروجی را برمی‌دارد. */
  exportName?: string;
  toolbar?: ReactNode;
  /** ترجمه — تا این کامپوننت به i18n گره نخورد. */
  t: (key: string) => string;
  /** ارتفاع ناحیهٔ اسکرول. `auto` یعنی بدون سقف. */
  height?: number | 'auto';
};

export function Grid<T>({
  rows,
  columns,
  rowKey,
  loading,
  empty,
  onSelectionChange,
  onRowClick,
  rowActions,
  exportName,
  toolbar,
  t,
  height = 560,
}: Props<T>) {
  const [density, setDensity] = useState<Density>('normal');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((column) => column.optional).map((column) => column.key)),
  );
  const [showColumns, setShowColumns] = useState(false);
  const [cursor, setCursor] = useState(-1);

  /** سلولی که در حال ویرایش است — `rowKey:columnKey`. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);

  // چگالی انتخابیِ کاربر باید بماند؛ هر بار تنظیم کردنش آزاردهنده است.
  useEffect(() => {
    const saved = window.localStorage.getItem('molido_grid_density');
    if (saved === 'compact' || saved === 'normal' || saved === 'relaxed') {
      setDensity(saved);
    }
  }, []);

  const changeDensity = useCallback((next: Density) => {
    setDensity(next);
    window.localStorage.setItem('molido_grid_density', next);
  }, []);

  const visible = useMemo(
    () => columns.filter((column) => !hidden.has(column.key)),
    [columns, hidden],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return rows;

    const column = columns.find((item) => item.key === sortKey);
    if (!column) return rows;

    // نسخهٔ تازه؛ مرتب‌سازی درجا آرایهٔ والد را عوض می‌کند.
    return [...rows].sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);

      // خالی همیشه ته فهرست، در هر دو جهت — وگرنه نصف صفحه خط تیره می‌شود.
      if (left === null || left === '') return 1;
      if (right === null || right === '') return -1;

      const result =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'fa');

      return sortDir === 'asc' ? result : -result;
    });
  }, [rows, columns, sortKey, sortDir]);

  const totals = useMemo(() => {
    const result: Record<string, number> = {};

    for (const column of visible) {
      if (!column.total) continue;
      result[column.key] = sorted.reduce(
        (sum, row) => sum + Number(column.value(row) ?? 0),
        0,
      );
    }

    return result;
  }, [sorted, visible]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectionChange?.([...next]);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next =
        prev.size === sorted.length ? new Set<string>() : new Set(sorted.map(rowKey));
      onSelectionChange?.([...next]);
      return next;
    });
  }

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * خروجی CSV.
   *
   * BOM لازم است: اکسل بدون آن فارسی را با کدگذاری ویندوزی می‌خواند و
   * متن به علامت سؤال تبدیل می‌شود.
   */
  function exportCsv() {
    const header = visible.map((column) => column.label);
    const lines = sorted.map((row) =>
      visible.map((column) => {
        const raw = column.value(row);
        const text = raw === null ? '' : String(raw);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      }),
    );

    const csv = [header, ...lines].map((cells) => cells.join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** پیمایش با صفحه‌کلید — دست از روی کیبورد برداشته نشود. */
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((index) => Math.min(index + 1, sorted.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((index) => Math.max(index - 1, 0));
    } else if (event.key === ' ' && cursor >= 0 && onSelectionChange) {
      event.preventDefault();
      toggleSelected(rowKey(sorted[cursor]));
    } else if (event.key === 'Enter' && cursor >= 0) {
      onRowClick?.(sorted[cursor]);
    }
  }

  // ردیفِ زیر مکان‌نما باید دیده شود، وگرنه پیمایش با کیبورد کور است.
  useEffect(() => {
    if (cursor < 0 || !bodyRef.current) return;
    bodyRef.current
      .querySelector(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const pad = ROW_PADDING[density];
  const size = FONT_SIZE[density];
  const hasTotals = visible.some((column) => column.total);

  return (
    <div className="grid-shell">
      <div className="grid-toolbar">
        {toolbar}

        <div className="grid-toolbar-end">
          {selected.size > 0 ? (
            <span className="grid-count">
              {selected.size.toLocaleString('fa-IR')} {t('selected')}
            </span>
          ) : (
            <span className="grid-count">
              {sorted.length.toLocaleString('fa-IR')} {t('rowsWord')}
            </span>
          )}

          <div className="seg seg-sm" role="group" aria-label={t('density')}>
            {(['compact', 'normal', 'relaxed'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={density === item ? 'active' : ''}
                onClick={() => changeDensity(item)}
                title={t(`density_${item}`)}
                aria-label={t(`density_${item}`)}
              >
                <Icon name={DENSITY_ICON[item]} size={15} />
              </button>
            ))}
          </div>

          <div className="grid-columns">
            <button
              type="button"
              className="btn-sm ghost"
              onClick={() => setShowColumns((open) => !open)}
              aria-expanded={showColumns}
            >
              <Icon name="settings" size={15} /> {t('columns')}
            </button>

            {showColumns ? (
              <div className="grid-columns-menu">
                {columns.map((column) => (
                  <label key={column.key}>
                    <input
                      type="checkbox"
                      checked={!hidden.has(column.key)}
                      onChange={() => toggleColumn(column.key)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {exportName ? (
            <button type="button" className="btn-sm ghost" onClick={exportCsv}>
              <Icon name="package" size={15} /> {t('exportCsv')}
            </button>
          ) : null}
        </div>
      </div>

      {/* خطای ذخیره باید جایی دیده شود که کاربر نگاه می‌کند، نه در کنسول. */}
      {saveError ? <div className="error grid-error">{saveError}</div> : null}

      {loading ? (
        <p className="muted grid-note">{t('loading')}</p>
      ) : sorted.length === 0 ? (
        <p className="muted grid-note">{empty ?? t('noData')}</p>
      ) : (
        <div
          className="grid-body"
          ref={bodyRef}
          style={height === 'auto' ? undefined : { maxHeight: height }}
          tabIndex={0}
          onKeyDown={onKeyDown}
          role="grid"
        >
          <table className="grid-table" style={{ fontSize: size }}>
            <thead>
              <tr>
                {onSelectionChange ? (
                  <th style={{ padding: pad, width: 34 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === sorted.length && sorted.length > 0}
                      onChange={toggleAll}
                      aria-label={t('selectAll')}
                    />
                  </th>
                ) : null}

                {visible.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      padding: pad,
                      width: column.width,
                      textAlign: column.numeric || column.align === 'end' ? 'end' : 'start',
                    }}
                  >
                    <button
                      type="button"
                      className="grid-sort"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.label}
                      {sortKey === column.key ? (
                        <Icon
                          name={sortDir === 'asc' ? 'trendUp' : 'trendDown'}
                          size={13}
                        />
                      ) : null}
                    </button>
                  </th>
                ))}

                {rowActions ? <th style={{ padding: pad, width: 1 }} /> : null}
              </tr>
            </thead>

            <tbody>
              {sorted.map((row, index) => {
                const key = rowKey(row);
                const isSelected = selected.has(key);

                return (
                  <tr
                    key={key}
                    data-row={index}
                    className={`${isSelected ? 'is-selected' : ''} ${
                      cursor === index ? 'is-cursor' : ''
                    }`}
                    onClick={() => {
                      setCursor(index);
                      onRowClick?.(row);
                    }}
                  >
                    {onSelectionChange ? (
                      <td style={{ padding: pad }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(key)}
                          aria-label={t('select')}
                        />
                      </td>
                    ) : null}

                    {visible.map((column) => {
                      const cellId = `${key}:${column.key}`;
                      const isEditing = editing === cellId;

                      return (
                        <td
                          key={column.key}
                          className={column.editable ? 'is-editable' : undefined}
                          style={{
                            padding: pad,
                            textAlign:
                              column.numeric || column.align === 'end' ? 'end' : 'start',
                            fontVariantNumeric: column.numeric
                              ? 'tabular-nums'
                              : undefined,
                          }}
                          onDoubleClick={
                            column.editable
                              ? (event) => {
                                  event.stopPropagation();
                                  setEditing(cellId);
                                  setDraft(String(column.value(row) ?? ''));
                                  setSaveError(null);
                                }
                              : undefined
                          }
                        >
                          {isEditing && column.editable ? (
                            <input
                              autoFocus
                              className="grid-edit"
                              type={column.editable.type}
                              value={draft}
                              disabled={saving === cellId}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setDraft(event.target.value)}
                              onBlur={() => setEditing(null)}
                              onKeyDown={async (event) => {
                                if (event.key === 'Escape') {
                                  setEditing(null);
                                  return;
                                }
                                if (event.key !== 'Enter') return;

                                event.preventDefault();
                                setSaving(cellId);

                                try {
                                  await column.editable!.save(row, draft);
                                  setEditing(null);
                                  setSaveError(null);
                                } catch (err) {
                                  // ویرایش باز می‌ماند: بستنش یعنی کاربر
                                  // فکر می‌کند ذخیره شد.
                                  setSaveError(
                                    err instanceof Error ? err.message : 'خطا',
                                  );
                                } finally {
                                  setSaving(null);
                                }
                              }}
                            />
                          ) : column.render ? (
                            column.render(row)
                          ) : (
                            (column.value(row) ?? '—')
                          )}
                        </td>
                      );
                    })}

                    {rowActions ? (
                      <td style={{ padding: pad }} onClick={(e) => e.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>

            {/* جمعِ همان چیزی که روی صفحه است — نه کل پایگاه.  عددی که با
                فیلتر عوض نشود، به‌جای کمک، گمراه می‌کند. */}
            {hasTotals ? (
              <tfoot>
                <tr>
                  {onSelectionChange ? <td style={{ padding: pad }} /> : null}
                  {visible.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        padding: pad,
                        textAlign: column.numeric ? 'end' : 'start',
                        fontVariantNumeric: column.numeric ? 'tabular-nums' : undefined,
                      }}
                    >
                      {column.total
                        ? totals[column.key].toLocaleString('fa-IR')
                        : null}
                    </td>
                  ))}
                  {rowActions ? <td style={{ padding: pad }} /> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </div>
  );
}

const DENSITY_ICON: Record<Density, IconName> = {
  compact: 'menu',
  normal: 'clipboard',
  relaxed: 'package',
};
