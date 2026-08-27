import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ScannerDisplayProps {
  label: string;
  onScan: (text: string) => void;
}

export const ScannerDisplay: React.FC<ScannerDisplayProps> = ({ label, onScan }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let controls: any = null;
    let mounted = true;

    const startScanner = async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const codeReader = new BrowserQRCodeReader();

        if (!videoRef.current || !mounted) return;

        const constraints = { 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        };

        await codeReader.decodeFromConstraints(constraints, videoRef.current, (result, error, ctrl) => {
          if (!controls && ctrl) {
            controls = ctrl;
          }
          if (result && mounted) {
            onScan(result.getText());
          }
        });
      } catch (err: any) {
        if (mounted) {
          console.error('Camera error:', err);
          setCameraError('Camera access denied or not available. Please enter the ID manually.');
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (controls) {
        controls.stop();
      }
    };
  }, [onScan]);

  if (cameraError) {
    return (
      <div className="relative w-full rounded-2xl border-2 border-dashed border-red-500/40 bg-slate-50 dark:bg-slate-950/60 flex flex-col items-center justify-center py-8 mb-4 overflow-hidden">
        <AlertTriangle className="w-10 h-10 mb-2 text-red-400" />
        <p className="text-sm text-red-400 text-center px-4">{cameraError}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl border-2 border-emerald-500/40 bg-slate-50 dark:bg-slate-950 overflow-hidden mb-4 aspect-video flex items-center justify-center">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="w-full h-full border-[40px] border-slate-950/50" />
      </div>
      <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-emerald-400 z-20" />
      <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-emerald-400 z-20" />
      <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-emerald-400 z-20" />
      <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-emerald-400 z-20" />
      <div className="absolute bottom-2 left-0 right-0 z-20 text-center">
        <p className="text-xs text-black dark:text-white bg-white dark:bg-slate-900/80 inline-block px-3 py-1 rounded-full backdrop-blur-sm shadow-sm">
          Point camera at <span className="text-emerald-400 font-bold">{label}</span> QR code
        </p>
      </div>
    </div>
  );
};
