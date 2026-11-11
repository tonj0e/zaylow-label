import React, { useEffect, useRef, useState } from 'react';
import { CameraOff, Loader2 } from 'lucide-react';

interface ScannerDisplayProps {
  label: string;
  onScan: (text: string) => void;
}

/** Same code seen again within this time is ignored, so one QR does not fire twenty times. */
const REPEAT_MS = 2500;

/**
 * Live camera reader. It starts once and keeps running: the scan handler is held in a ref,
 * so the parent re-rendering never restarts the camera (that was what made scans get missed).
 */
export const ScannerDisplay: React.FC<ScannerDisplayProps> = ({ label, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handlerRef = useRef(onScan);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [message, setMessage] = useState('');

  useEffect(() => { handlerRef.current = onScan; }, [onScan]);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    let lastText = '';
    let lastAt = 0;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera. Type the number below instead.');
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.DATA_MATRIX]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        if (!videoRef.current || stopped) return;
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (!result || stopped) return;
            const text = result.getText().trim();
            const now = Date.now();
            if (!text || (text === lastText && now - lastAt < REPEAT_MS)) return;
            lastText = text; lastAt = now;
            handlerRef.current(text);
          },
        );
        if (stopped) c.stop(); else { controls = c; setStatus('ready'); }
      } catch (err: unknown) {
        if (stopped) return;
        const name = (err as { name?: string })?.name;
        setMessage(
          name === 'NotAllowedError' ? 'Camera is blocked. Allow camera for this site in the browser, or type the number below.'
          : name === 'NotFoundError' ? 'No camera found. Type the number below.'
          : name === 'NotReadableError' ? 'Another app is using the camera. Close it, or type the number below.'
          : (err as Error)?.message || 'The camera did not start. Type the number below.',
        );
        setStatus('error');
      }
    })();

    return () => { stopped = true; controls?.stop(); };
  }, []);

  if (status === 'error') {
    return (
      <div role="alert" className="k-card2 rounded-2xl flex flex-col items-center justify-center gap-2 py-8 px-5 text-center" style={{ border: '1px dashed var(--line)' }}>
        <CameraOff className="w-8 h-8 k-muted" />
        <p className="text-sm font-medium">{message}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden aspect-video" style={{ background: '#000' }}>
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
      {status === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm" style={{ color: '#fff' }}><Loader2 className="w-4 h-4 animate-spin" /> Starting camera…</div>
      )}
      <div className="absolute inset-[18%] pointer-events-none rounded-2xl" style={{ border: '2px solid var(--lime)', boxShadow: '0 0 0 999px rgba(0,0,0,.45)' }} />
      <p className="absolute bottom-2 left-0 right-0 text-center text-xs" style={{ color: '#fff' }}>Hold the {label} QR code inside the green box</p>
    </div>
  );
};
