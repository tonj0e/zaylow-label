import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeProps {
  value: string;
  size?: number;
}

export const QRCodeComponent: React.FC<QRCodeProps> = ({ value, size = 80 }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (value) {
      QRCode.toDataURL(value, {
        width: size * 2, // Double DPI resolution for sharp thermal printing
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
        .then(url => setDataUrl(url))
        .catch(err => console.error('QR code generation error:', err));
    }
  }, [value, size]);

  if (!dataUrl) {
    return <div style={{ width: size, height: size }} className="bg-gray-100 animate-pulse" />;
  }

  return (
    <img
      src={dataUrl}
      alt="Shipping QR Code"
      style={{ width: size, height: size }}
      className="object-contain border border-black p-0.5"
    />
  );
};
