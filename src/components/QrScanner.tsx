import React, { useState, useRef, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface QrScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export const QrScanner: React.FC<QrScannerProps> = ({
  onScan,
  onError,
  className = ''
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const startScanning = () => {
    setIsScanning(true);
  };

  const stopScanning = () => {
    setIsScanning(false);
    readerRef.current = null;
  };

  useEffect(() => {
    if (isScanning && videoRef.current) {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      reader.decodeOnceFromVideoDevice(undefined, videoRef.current)
        .then(result => {
          if (result) {
            onScan(result.getText());
          }
          setIsScanning(false);
        })
        .catch(err => {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error('QR scanning error:', errorMsg);
          onError?.(errorMsg);
          setIsScanning(false);
        })
        .finally(() => {
          readerRef.current = null;
        });
    }
  }, [isScanning, onScan, onError]);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  if (!isScanning) {
    return (
      <button
        type="button"
        onClick={startScanning}
        className={`btn btn-ghost btn-sm ${className}`}
      >
        Scan QR Code
      </button>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width: '100%' }}>
      <video
        ref={videoRef}
        playsInline
        style={{
          width: '100%',
          height: '200px',
          backgroundColor: '#000'
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-black dark:text-white text-sm">
        Scanning... Point camera at QR code
      </div>
    </div>
  );
};