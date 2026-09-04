'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from './icons';
import { useI18n } from '../lib/i18n-context';

/**
 * اسکن بارکد با دوربین — بدون کتابخانه.
 *
 * از `BarcodeDetector` بومی مرورگر استفاده می‌کند: در کروم اندروید و
 * مرورگرهای مبتنی بر آن موجود است.  کتابخانه‌های جایگزین (ZXing، QuaggaJS)
 * چند صد کیلوبایت وزن دارند و روی گوشی‌های ارزان کند می‌شوند؛ جایی که
 * قابلیت بومی نباشد، ورود دستی کد همیشه در دسترس است.
 *
 * سه نکتهٔ عملی که در انبار و صندوق اهمیت دارند:
 *
 * ۱. **دوربین پشت** درخواست می‌شود (`facingMode: environment`)؛ بدون آن
 *    گوشی دوربین جلو را باز می‌کند و کاربر باید کالا را به سمت صورتش
 *    بگیرد.
 *
 * ۲. **کد تکراری پشت سر هم نادیده گرفته می‌شود.**  دوربین ۱۰ بار در ثانیه
 *    همان بارکد را می‌خواند؛ بدون این محافظ، یک اسکن ده قلم به سبد اضافه
 *    می‌کرد.
 *
 * ۳. **جریان دوربین در هر خروجی بسته می‌شود** — وگرنه چراغ دوربین روشن
 *    می‌ماند و باتری تمام می‌شود.
 */

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

/** فرمت‌های رایج خرده‌فروشی؛ محدود کردنشان تشخیص را سریع‌تر می‌کند. */
const FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'qr_code',
];

export function isScannerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export default function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function start() {
      if (!isScannerSupported()) {
        setError('مرورگر شما از اسکن با دوربین پشتیبانی نمی‌کند');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const Detector = (
          window as unknown as { BarcodeDetector: BarcodeDetectorCtor }
        ).BarcodeDetector;

        const detector = new Detector({ formats: FORMATS });

        const scan = async () => {
          if (cancelled || !videoRef.current) return;

          try {
            const found = await detector.detect(videoRef.current);
            const code = found[0]?.rawValue?.trim();

            if (code) {
              const now = Date.now();
              const last = lastRef.current;

              // همان کد تا ۲ ثانیه دوباره پذیرفته نمی‌شود: دوربین ده‌ها بار
              // در ثانیه همان بارکد را می‌بیند.
              if (code !== last.code || now - last.at > 2000) {
                lastRef.current = { code, at: now };

                // لرزش کوتاه: تأیید لمسی که کاربر بدون نگاه به صفحه هم
                // می‌فهمد اسکن گرفته شد.
                navigator.vibrate?.(40);
                onScan(code);
              }
            }
          } catch {
            // یک فریم ناموفق طبیعی است (تاری، نور کم)؛ حلقه باید ادامه دهد.
          }

          timer = window.setTimeout(() => void scan(), 120);
        };

        void scan();
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setError(
          name === 'NotAllowedError'
            ? 'دسترسی به دوربین رد شد. از تنظیمات مرورگر اجازه بدهید.'
            : 'دوربین در دسترس نیست',
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stop();
    };
  }, [onScan, stop]);

  return (
    <div
      role="dialog"
      aria-label={t('bcScan')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 12,
          color: '#fff',
          // زیر نوار وضعیت گوشی نرود
          paddingTop: 'max(12px, env(safe-area-inset-top))',
        }}
      >
        <span style={{ fontWeight: 700 }}>{t('bcScan')}</span>
        <button
          type="button"
          onClick={() => {
            stop();
            onClose();
          }}
          style={{
            minWidth: 44,
            minHeight: 44,
            border: 'none',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            cursor: 'pointer',
          }}
          aria-label={t('close')}
        >
          <Icon name="x" size={22} />
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {/* کادر هدف: به کاربر می‌گوید بارکد را کجا بگیرد */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '30% 12%',
            border: '3px solid rgba(255,255,255,0.9)',
            borderRadius: 16,
            boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)',
          }}
        />
      </div>

      {error ? (
        <div
          style={{
            background: '#7f1d1d',
            color: '#fff',
            padding: 16,
            textAlign: 'center',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          }}
        >
          {error}
        </div>
      ) : (
        <p
          style={{
            color: 'rgba(255,255,255,0.75)',
            textAlign: 'center',
            padding: 16,
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            margin: 0,
          }}
        >
          {t('bcAim')}
        </p>
      )}
    </div>
  );
}
