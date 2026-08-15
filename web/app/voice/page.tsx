'use client';

/**
 * پیکرهٔ صوتی بلوچی — ضبط نام کالاها به زبان مادری.
 *
 * چرا این صفحه در سامانهٔ فروشگاه است: گلوگاهِ ساختن موتور گفتار بلوچی
 * **داده** است نه الگوریتم.  فهرست کالا اینجاست و صندوق‌دارها
 * بلوچ‌زبان‌اند — یعنی هم متن هست هم گوینده.
 *
 * صفحه عمداً دو نیمه دارد: نیمهٔ راست کارِ مدیر (ساخت فهرست، ورود
 * واژه‌نامه، بازبینی) و نیمهٔ چپ کارِ گوینده (ضبط).  ضبط باید بتواند
 * روی تبلت صندوق، بدون آموزش، انجام شود.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { TOUCH } from '../../components/ui';
import { API_URL, api, getToken } from '../../lib/api';

type Dialect = { code: string; label: string };

type Phrase = {
  id: string;
  kind: 'PRODUCT' | 'NUMBER' | 'COMMAND';
  textFa: string;
  textTarget: string | null;
  approved: string | number;
  pending: string | number;
  speakers: string | number;
};

type Status = {
  ready: number;
  total: number;
  percent: number;
  samples: number;
  speakers: number;
  minutes: number;
  canTrain: boolean;
  advice: string;
  dialectLabel: string;
};

type Suggestion = {
  phraseId: string;
  textFa: string;
  kind: string;
  suggestion: string;
  notes: string[];
};

type PendingSample = {
  id: string;
  textFa: string;
  textTarget: string | null;
  audioUrl: string;
  speakerTag: string;
  durationMs: number | null;
};

const KIND_LABEL: Record<string, string> = {
  PRODUCT: 'کالا',
  NUMBER: 'عدد',
  COMMAND: 'فرمان',
};

/** حد نصاب هر عبارت — همان عددی که سرور هم اجرا می‌کند. */
const MIN_SAMPLES = 5;
const MIN_SPEAKERS = 3;

const num = (value: unknown) => Number(value ?? 0);

export default function VoicePage() {
  const [dialects, setDialects] = useState<Dialect[]>([]);
  const [dialect, setDialect] = useState('SARHADDI');
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<'record' | 'review' | 'import'>('record');
  const [kindFilter, setKindFilter] = useState<'ALL' | Phrase['kind']>('ALL');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * برچسب گوینده در همین مرورگر می‌ماند.
   *
   * نام واقعی نمی‌خواهیم — فقط باید بشود «چند گویندهٔ متفاوت» را شمرد.
   * ماندنش در مرورگر یعنی هر تبلت یک گوینده است و کسی مجبور نیست هر
   * بار چیزی تایپ کند.
   */
  const [speaker, setSpeaker] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem('molido_speaker_tag');
    if (saved) {
      setSpeaker(saved);
      return;
    }
    const fresh = `گوینده-${Math.random().toString(36).slice(2, 6)}`;
    window.localStorage.setItem('molido_speaker_tag', fresh);
    setSpeaker(fresh);
  }, []);

  const load = useCallback(async () => {
    try {
      const query = `?dialect=${dialect}`;
      const [list, stat] = await Promise.all([
        api<Phrase[]>(`/voice/phrases${query}`),
        api<Status>(`/voice/status${query}`),
      ]);
      setPhrases(list);
      setStatus(stat);
      setError('');
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [dialect]);

  useEffect(() => {
    api<Dialect[]>('/voice/dialects')
      .then(setDialects)
      .catch(() => setDialects([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await action();
      setNote(label);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const visible =
    kindFilter === 'ALL' ? phrases : phrases.filter((p) => p.kind === kindFilter);

  return (
    <AppShell title="پیکرهٔ صوتی بلوچی">
      <div style={{ display: 'grid', gap: 16 }}>
        <Header
          dialects={dialects}
          dialect={dialect}
          onDialect={setDialect}
          status={status}
        />

        {error ? <Banner tone="bad" text={error} /> : null}
        {note ? <Banner tone="good" text={note} /> : null}

        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(
            [
              ['record', 'ضبط'],
              ['review', 'بازبینی'],
              ['import', 'واژه‌نامه'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                ...TOUCH,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: tab === key ? 'var(--accent)' : 'var(--surface)',
                color: tab === key ? '#fff' : 'var(--text)',
                fontWeight: tab === key ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'record' ? (
          <>
            <Toolbar
              busy={busy}
              speaker={speaker}
              onSpeaker={(value) => {
                setSpeaker(value);
                window.localStorage.setItem('molido_speaker_tag', value);
              }}
              kindFilter={kindFilter}
              onKindFilter={setKindFilter}
              onBuild={() =>
                run('فهرست عبارت‌ها ساخته شد', () =>
                  api(`/voice/phrases/build?dialect=${dialect}`, { method: 'POST' }),
                )
              }
            />
            <PhraseList
              phrases={visible}
              speaker={speaker}
              onRecorded={load}
              onError={setError}
            />
          </>
        ) : null}

        {tab === 'review' ? (
          <Review dialect={dialect} onChanged={load} onError={setError} />
        ) : null}

        {tab === 'import' ? (
          <Import dialect={dialect} onDone={load} onError={setError} />
        ) : null}
      </div>
    </AppShell>
  );
}

// --------------------------------------------------------------- سربرگ

function Header({
  dialects,
  dialect,
  onDialect,
  status,
}: {
  dialects: Dialect[];
  dialect: string;
  onDialect: (value: string) => void;
  status: Status | null;
}) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 700 }}>گویش:</label>
        {dialects.map((d) => (
          <button
            key={d.code}
            type="button"
            onClick={() => onDialect(d.code)}
            style={{
              ...TOUCH,
              borderRadius: 10,
              cursor: 'pointer',
              border:
                dialect === d.code
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border)',
              background: dialect === d.code ? 'var(--accent-soft)' : 'transparent',
              color: 'var(--text)',
              fontWeight: dialect === d.code ? 700 : 400,
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/*
        پیکرهٔ هر گویش جداست.  گفتنش لازم است چون کسی که گویش را عوض
        می‌کند و فهرست خالی می‌بیند، فکر می‌کند داده‌اش پاک شده.
      */}
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        هر گویش پیکرهٔ جداگانه دارد — ضبط سرحدی به مکرانی ربطی ندارد.
      </p>

      {status ? (
        <>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Stat label="عبارت کامل" value={`${status.ready} از ${status.total}`} />
            <Stat label="ضبط تأییدشده" value={String(status.samples)} />
            <Stat label="گوینده" value={String(status.speakers)} />
            <Stat label="دقیقه صدا" value={String(status.minutes)} />
          </div>

          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: 'var(--border)',
              overflow: 'hidden',
            }}
            role="progressbar"
            aria-valuenow={status.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="پیشرفت پیکره"
          >
            <div
              style={{
                width: `${status.percent}%`,
                height: '100%',
                background: status.canTrain ? '#047857' : 'var(--accent)',
                transition: 'width 240ms ease',
              }}
            />
          </div>

          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{status.percent}٪</strong> — {status.advice}
          </p>
        </>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Banner({ tone, text }: { tone: 'good' | 'bad'; text: string }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      style={{
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${tone === 'bad' ? '#b91c1c' : '#047857'}`,
        background: tone === 'bad' ? '#b91c1c14' : '#04785714',
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}

// --------------------------------------------------------------- ابزار

function Toolbar({
  busy,
  speaker,
  onSpeaker,
  kindFilter,
  onKindFilter,
  onBuild,
}: {
  busy: boolean;
  speaker: string;
  onSpeaker: (value: string) => void;
  kindFilter: string;
  onKindFilter: (value: 'ALL' | Phrase['kind']) => void;
  onBuild: () => void;
}) {
  return (
    <section
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}
    >
      <div>
        <label htmlFor="speaker" style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
          برچسب گوینده
        </label>
        <input
          id="speaker"
          value={speaker}
          onChange={(event) => onSpeaker(event.target.value)}
          style={{ ...TOUCH, borderRadius: 10, border: '1px solid var(--border)', width: 180 }}
        />
      </div>

      <div>
        <label htmlFor="kind" style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
          نوع
        </label>
        <select
          id="kind"
          value={kindFilter}
          onChange={(event) => onKindFilter(event.target.value as 'ALL')}
          style={{ ...TOUCH, borderRadius: 10, border: '1px solid var(--border)' }}
        >
          <option value="ALL">همه</option>
          <option value="COMMAND">فرمان</option>
          <option value="NUMBER">عدد</option>
          <option value="PRODUCT">کالا</option>
        </select>
      </div>

      <button
        type="button"
        onClick={onBuild}
        disabled={busy}
        style={{
          ...TOUCH,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <Icon name="refresh" /> ساخت فهرست از کالاها
      </button>
    </section>
  );
}

// -------------------------------------------------------------- عبارت‌ها

function PhraseList({
  phrases,
  speaker,
  onRecorded,
  onError,
}: {
  phrases: Phrase[];
  speaker: string;
  onRecorded: () => void;
  onError: (message: string) => void;
}) {
  if (!phrases.length) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        هنوز عبارتی ساخته نشده — «ساخت فهرست از کالاها» را بزنید.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {phrases.map((phrase) => (
        <PhraseRow
          key={phrase.id}
          phrase={phrase}
          speaker={speaker}
          onRecorded={onRecorded}
          onError={onError}
        />
      ))}
    </div>
  );
}

function PhraseRow({
  phrase,
  speaker,
  onRecorded,
  onError,
}: {
  phrase: Phrase;
  speaker: string;
  onRecorded: () => void;
  onError: (message: string) => void;
}) {
  const approved = num(phrase.approved);
  const speakers = num(phrase.speakers);
  const pending = num(phrase.pending);
  const complete =
    Boolean(phrase.textTarget) && approved >= MIN_SAMPLES && speakers >= MIN_SPEAKERS;

  return (
    <article
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: complete ? '#04785710' : 'var(--surface)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 999,
          background: 'var(--border)',
          color: 'var(--muted)',
        }}
      >
        {KIND_LABEL[phrase.kind] ?? phrase.kind}
      </span>

      <div style={{ minWidth: 180, flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{phrase.textFa}</div>
        {phrase.textTarget ? (
          <div style={{ fontSize: 15, color: 'var(--accent)' }}>{phrase.textTarget}</div>
        ) : (
          // بدون متن بلوچی، گوینده نمی‌داند چه بگوید.
          <div style={{ fontSize: 13, color: '#b45309' }}>متن بلوچی وارد نشده</div>
        )}
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)', minWidth: 150 }}>
        {approved} از {MIN_SAMPLES} ضبط · {speakers} از {MIN_SPEAKERS} گوینده
        {pending > 0 ? ` · ${pending} در انتظار` : ''}
      </div>

      <RecordButton
        phraseId={phrase.id}
        speaker={speaker}
        disabled={!phrase.textTarget}
        onDone={onRecorded}
        onError={onError}
      />
    </article>
  );
}

// ----------------------------------------------------------------- ضبط

/**
 * دکمهٔ ضبط.
 *
 * فشار بده و نگه دار، نه کلیک/کلیک.  گوینده باید دستش روی دکمه باشد
 * تا بداند دارد ضبط می‌شود؛ حالت کلیک/کلیک میکروفن را باز جا می‌گذارد
 * و ضبط‌های سی‌ثانیه‌ای می‌سازد که سرور ردشان می‌کند.
 */
function RecordButton({
  phraseId,
  speaker,
  disabled,
  onDone,
  onError,
}: {
  phraseId: string;
  speaker: string;
  disabled: boolean;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'saving'>('idle');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state === 'recording') {
      recorder.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    if (disabled || state !== 'idle') return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      onError('این مرورگر ضبط صدا ندارد');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      chunks.current = [];
      startedAt.current = Date.now();

      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };

      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const durationMs = Date.now() - startedAt.current;
        const blob = new Blob(chunks.current, { type: 'audio/webm' });

        // کوتاه‌تر از حد سرور را همین‌جا می‌گیریم: پیام خطای محلی
        // سریع‌تر و روشن‌تر از ۴۰۰ سرور است.
        if (durationMs < 300) {
          setState('idle');
          onError('ضبط خیلی کوتاه بود — دکمه را نگه دارید و بگویید');
          return;
        }

        setState('saving');
        try {
          const form = new FormData();
          form.append('file', blob, `voice-${Date.now()}.webm`);
          form.append('entityType', 'VOICE_SAMPLE');
          form.append('entityId', phraseId);

          const uploaded = await fetch(`${API_URL}/uploads`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken() ?? ''}` },
            body: form,
          });
          if (!uploaded.ok) throw new Error('بارگذاری صدا ناموفق بود');
          const attachment = (await uploaded.json()) as { filePath: string };

          await api('/voice/samples', {
            method: 'POST',
            body: {
              phraseId,
              audioUrl: attachment.filePath,
              speakerTag: speaker,
              durationMs: Math.min(durationMs, 29_000),
              sizeBytes: blob.size,
            },
          });
          onDone();
        } catch (caught) {
          onError((caught as Error).message);
        } finally {
          setState('idle');
        }
      };

      media.start();
      recorder.current = media;
      setState('recording');

      // بند ایمنی: اگر انگشت برداشته نشد یا رویداد گم شد، سرور
      // ضبط بلندتر از ۳۰ ثانیه را رد می‌کند و کار هدر می‌رود.
      window.setTimeout(() => {
        if (media.state === 'recording') media.stop();
      }, 25_000);
    } catch {
      onError('دسترسی به میکروفن داده نشد');
      setState('idle');
    }
  }, [disabled, state, phraseId, speaker, onDone, onError]);

  const label =
    state === 'recording' ? 'در حال ضبط…' : state === 'saving' ? 'ذخیره…' : 'ضبط';

  return (
    <button
      type="button"
      disabled={disabled || state === 'saving'}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      title={disabled ? 'اول متن بلوچی این عبارت را وارد کنید' : 'نگه دارید و بگویید'}
      style={{
        ...TOUCH,
        minWidth: 120,
        borderRadius: 12,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontWeight: 700,
        color: '#fff',
        background: state === 'recording' ? '#b91c1c' : 'var(--accent)',
        transform: state === 'recording' ? 'scale(0.97)' : 'none',
        transition: 'transform 120ms ease, background 120ms ease',
        touchAction: 'none',
      }}
    >
      {label}
    </button>
  );
}

// ------------------------------------------------------------- بازبینی

function Review({
  dialect,
  onChanged,
  onError,
}: {
  dialect: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [samples, setSamples] = useState<PendingSample[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const load = useCallback(async () => {
    try {
      const [pending, suggested] = await Promise.all([
        api<PendingSample[]>(`/voice/samples/pending?dialect=${dialect}`),
        api<Suggestion[]>(`/voice/phrases/suggest?dialect=${dialect}`),
      ]);
      setSamples(pending);
      setSuggestions(suggested);
    } catch (caught) {
      onError((caught as Error).message);
    }
  }, [dialect, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, approved: boolean) => {
    try {
      await api(`/voice/samples/${id}`, {
        method: 'PATCH',
        body: { approved, ...(approved ? {} : { reason: 'بازبین رد کرد' }) },
      });
      await load();
      onChanged();
    } catch (caught) {
      onError((caught as Error).message);
    }
  };

  const accept = async (phraseId: string, textTarget: string) => {
    try {
      await api(`/voice/phrases/${phraseId}`, { method: 'PATCH', body: { textTarget } });
      await load();
      onChanged();
    } catch (caught) {
      onError((caught as Error).message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h2 style={{ fontSize: 16 }}>ضبط‌های در انتظار ({samples.length})</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
          ضبط نویزی یا اشتباه، مدل را بدتر می‌کند نه بهتر — پس بازبینی پیش از
          آموزش لازم است، نه بعدش.
        </p>
        {samples.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>چیزی در انتظار نیست.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {samples.map((sample) => (
              <div
                key={sample.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 160, flex: 1 }}>
                  <strong>{sample.textTarget ?? sample.textFa}</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {sample.textFa} · {sample.speakerTag}
                    {sample.durationMs ? ` · ${(sample.durationMs / 1000).toFixed(1)}s` : ''}
                  </div>
                </div>
                <audio controls preload="none" src={`${API_URL}${sample.audioUrl}`} />
                <button
                  type="button"
                  onClick={() => review(sample.id, true)}
                  style={{ ...TOUCH, borderRadius: 10, border: 'none', background: '#047857', color: '#fff', cursor: 'pointer' }}
                >
                  <Icon name="check" /> تأیید
                </button>
                <button
                  type="button"
                  onClick={() => review(sample.id, false)}
                  style={{ ...TOUCH, borderRadius: 10, border: 'none', background: '#b91c1c', color: '#fff', cursor: 'pointer' }}
                >
                  <Icon name="x" /> رد
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16 }}>پیشنهاد املای بلوچی ({suggestions.length})</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
          این‌ها حدسِ ماشین است بر پایهٔ قاعدهٔ املایی — بلوچی حروف ویژهٔ عربی
          (ص، ض، ط، ظ، ذ، ث، ح، ع) را ندارد. هیچ‌کدام ذخیره نشده؛ تا شما تأیید
          نکنید وارد پیکره نمی‌شود.
        </p>
        {suggestions.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>پیشنهادی نیست.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {suggestions.slice(0, 60).map((item) => (
              <div
                key={item.phraseId}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 200, flex: 1 }}>
                  <span style={{ color: 'var(--muted)' }}>{item.textFa}</span>
                  {' ← '}
                  <strong style={{ fontSize: 17 }}>{item.suggestion}</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {item.notes.join(' · ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => accept(item.phraseId, item.suggestion)}
                  style={{ ...TOUCH, borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
                >
                  درست است
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------ واژه‌نامه

function Import({
  dialect,
  onDone,
  onError,
}: {
  dialect: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<{
    words: number;
    matched: number;
    skipped: number;
    changes: Array<{ textFa: string; textTarget: string; kind: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    setBusy(true);
    try {
      const response = await api<typeof result>('/voice/dictionary', {
        method: 'POST',
        body: { csv: text, dialect },
      });
      setResult(response);
      onDone();
    } catch (caught) {
      onError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        فایل دو ستونی: فارسی و بلوچی. سرستون اختیاری است.
      </p>

      <input
        type="file"
        accept=".csv,.txt"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          setCsv(text);
          await send(text);
        }}
        style={{ ...TOUCH }}
      />

      <textarea
        value={csv}
        onChange={(event) => setCsv(event.target.value)}
        rows={8}
        dir="rtl"
        placeholder={'فارسی,بلوچی\nنان,نگن\nآب,آپ'}
        style={{
          borderRadius: 10,
          border: '1px solid var(--border)',
          padding: 10,
          fontFamily: 'inherit',
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      />

      <button
        type="button"
        disabled={busy || !csv.trim()}
        onClick={() => send(csv)}
        style={{
          ...TOUCH,
          borderRadius: 10,
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          cursor: busy ? 'wait' : 'pointer',
          justifySelf: 'start',
        }}
      >
        ورود واژه‌نامه
      </button>

      {result ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>
            {result.words} واژه خوانده شد · {result.matched} عبارت پر شد ·{' '}
            {result.skipped} سطر رد شد
          </p>
          {/*
            فهرست تغییرها، نه فقط عدد.  واژه‌نامه‌های بلوچیِ در دسترس با
            گذر از انگلیسی ساخته می‌شوند و گذر، ابهام فارسی را به خطا
            بدل می‌کند: «نه» هم عدد ۹ است هم نفی.
          */}
          {result.changes?.length ? (
            <>
              <p style={{ margin: 0, fontSize: 13, color: '#b45309' }}>
                این‌ها را بخوانید — ترجمه‌ای که از راه انگلیسی آمده باشد ممکن
                است واژهٔ هم‌شکل را اشتباه گرفته باشد.
              </p>
              <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 14 }}>
                {result.changes.slice(0, 40).map((change) => (
                  <li key={`${change.kind}-${change.textFa}`}>
                    <span style={{ color: 'var(--muted)' }}>
                      [{KIND_LABEL[change.kind] ?? change.kind}]
                    </span>{' '}
                    {change.textFa} ← <strong>{change.textTarget}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
