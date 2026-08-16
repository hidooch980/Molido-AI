'use client';

/**
 * حالت ضبط پیوسته.
 *
 * چرا لازم شد: حد نصاب پیکره ۶۹۰ ضبط است — ۴۶ عبارت × ۵ ضبط × ۳ گوینده.
 * در فهرست معمولی، گوینده باید هر بار دنبال عبارت بگردد، دکمه‌اش را
 * پیدا کند و برگردد.  دویست‌وسی بار.
 *
 * اینجا یک عبارت بزرگ روی صفحه است: نگه‌دار، بگو، رها کن.  خودکار
 * می‌رود بعدی.  همان کار، بدون گشتن.
 *
 * عبارتی که این گوینده قبلاً گفته رد می‌شود — نه اینکه دوباره بپرسد.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_URL, api, getToken } from '../../lib/api';

type Phrase = {
  id: string;
  kind: 'PRODUCT' | 'NUMBER' | 'COMMAND';
  textFa: string;
  textTarget: string | null;
  mine: string | number;
};

const KIND_LABEL: Record<string, string> = {
  PRODUCT: 'کالا',
  NUMBER: 'عدد',
  COMMAND: 'عبارت',
};

type State = 'idle' | 'recording' | 'saving';

export default function Session({
  dialect,
  speaker,
  onClose,
  onSaved,
}: {
  dialect: string;
  speaker: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [queue, setQueue] = useState<Phrase[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<State>('idle');
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  /**
   * جریان میکروفن یک بار گرفته می‌شود و باز می‌ماند.
   *
   * `getUserMedia` برای هر ضبط، در کروم چند صد میلی‌ثانیه طول می‌کشد و
   * ابتدای کلمه را می‌خورد.  در دویست ضبط پشت سر هم، همان تأخیر یعنی
   * نیمی از ضبط‌ها ناقص‌اند.
   */
  const stream = useRef<MediaStream | null>(null);

  // ---------- ساخت صف ----------

  useEffect(() => {
    let cancelled = false;

    api<Phrase[]>(
      `/voice/phrases?dialect=${dialect}&speakerTag=${encodeURIComponent(speaker)}`,
    )
      .then((all) => {
        if (cancelled) return;
        // فقط عبارتی که متن بلوچی دارد و این گوینده هنوز نگفته.
        // بدون متن، گوینده نمی‌داند چه بگوید.
        setQueue(all.filter((p) => p.textTarget && Number(p.mine ?? 0) === 0));
      })
      .catch((caught) => !cancelled && setError((caught as Error).message));

    return () => {
      cancelled = true;
    };
  }, [dialect, speaker]);

  // ---------- میکروفن ----------

  useEffect(() => {
    return () => {
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const current = queue[index];

  const save = useCallback(
    async (blob: Blob, durationMs: number, phraseId: string) => {
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
    },
    [speaker],
  );

  const start = useCallback(async () => {
    if (!current || state !== 'idle') return;
    setError('');

    try {
      if (!stream.current) {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const media = new MediaRecorder(stream.current);
      chunks.current = [];
      startedAt.current = Date.now();
      const phraseId = current.id;

      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };

      media.onstop = async () => {
        const durationMs = Date.now() - startedAt.current;
        const blob = new Blob(chunks.current, { type: 'audio/webm' });

        if (durationMs < 300) {
          setState('idle');
          setError('خیلی کوتاه بود — نگه دارید و بگویید');
          return;
        }

        setState('saving');
        try {
          await save(blob, durationMs, phraseId);
          setDone((n) => n + 1);
          // پیش‌رفتن پس از ذخیره، نه پیش از آن: اگر ذخیره شکست بخورد
          // گوینده باید همان عبارت را دوباره بگوید، نه عبارت بعدی را.
          setIndex((i) => i + 1);
          onSaved();
        } catch (caught) {
          setError((caught as Error).message);
        } finally {
          setState('idle');
        }
      };

      media.start();
      recorder.current = media;
      setState('recording');

      window.setTimeout(() => {
        if (media.state === 'recording') media.stop();
      }, 25_000);
    } catch {
      setError('دسترسی به میکروفن داده نشد');
      setState('idle');
    }
  }, [current, state, save, onSaved]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  // ---------- صفحه‌کلید ----------

  /**
   * نگه‌داشتن Space ضبط می‌کند.
   *
   * روی رایانهٔ صندوق، دست روی صفحه‌کلید است نه روی صفحهٔ لمسی؛ و
   * نگه‌داشتن یک کلید از هدف‌گیری دکمه با موس سریع‌تر است.
   */
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      event.preventDefault();
      void start();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      stop();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [start, stop]);

  // ---------- نمایش ----------

  if (error && !queue.length) {
    return <Shell onClose={onClose}><p style={{ color: '#b91c1c' }}>{error}</p></Shell>;
  }

  if (!queue.length) {
    return (
      <Shell onClose={onClose}>
        <p style={{ fontSize: 18 }}>
          چیزی برای ضبط نمانده — همهٔ عبارت‌هایی که متن بلوچی دارند را گفته‌اید.
        </p>
        <p style={{ color: 'var(--muted)' }}>
          اگر عبارت تازه‌ای می‌خواهید، اول متن بلوچی‌اش را در بخش بازبینی وارد کنید.
        </p>
      </Shell>
    );
  }

  if (!current) {
    return (
      <Shell onClose={onClose}>
        <p style={{ fontSize: 22, fontWeight: 700 }}>تمام شد ✅</p>
        <p style={{ fontSize: 18 }}>{done} ضبط در این نشست.</p>
      </Shell>
    );
  }

  const percent = Math.round((index / queue.length) * 100);

  return (
    <Shell onClose={onClose}>
      <div style={{ display: 'grid', gap: 6, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {index + 1} از {queue.length} · {KIND_LABEL[current.kind]} · گوینده: {speaker}
        </div>
        <div
          style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
      </div>

      {/* متن بلوچی بزرگ است چون همان چیزی است که باید گفته شود.
          فارسی کوچک‌تر، فقط برای اینکه گوینده بداند منظور چیست. */}
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.3 }}>
          {current.textTarget}
        </div>
        <div style={{ fontSize: 20, color: 'var(--muted)', marginTop: 8 }}>
          {current.textFa}
        </div>
      </div>

      <button
        type="button"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        disabled={state === 'saving'}
        style={{
          width: '100%',
          minHeight: 96,
          borderRadius: 18,
          border: 'none',
          fontSize: 24,
          fontWeight: 700,
          color: '#fff',
          cursor: 'pointer',
          background:
            state === 'recording' ? '#b91c1c' : state === 'saving' ? '#6b7280' : 'var(--accent)',
          transform: state === 'recording' ? 'scale(0.98)' : 'none',
          transition: 'background 120ms ease, transform 120ms ease',
          touchAction: 'none',
        }}
      >
        {state === 'recording' ? 'در حال ضبط…' : state === 'saving' ? 'ذخیره…' : 'نگه دارید و بگویید'}
      </button>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        یا کلید <kbd>Space</kbd> را نگه دارید
      </p>

      {error ? (
        <p role="alert" style={{ textAlign: 'center', color: '#b91c1c', margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {/*
          «بلد نیستم» لازم است.  گوینده‌ای که واژه را نمی‌داند، اگر
          راه رد کردن نداشته باشد یا حدس می‌زند — که پیکره را خراب
          می‌کند — یا کل نشست را رها می‌کند.
        */}
        <button
          type="button"
          onClick={() => setIndex((i) => i + 1)}
          style={{
            minHeight: 44,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          بلد نیستم — بعدی
        </button>
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--muted)' }}>
          {done} ضبط شد
        </span>
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--bg)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div style={{ width: 'min(560px, 100%)', display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 44,
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            بستن
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
