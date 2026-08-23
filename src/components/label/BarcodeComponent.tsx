import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeProps {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
}

export const BarcodeComponent: React.FC<BarcodeProps> = ({
  value,
  height = 45,
  width = 1.8,
  fontSize = 12,
  displayValue = true
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width,
          height,
          displayValue,
          fontSize,
          font: 'monospace',
          fontOptions: 'bold',
          textMargin: 2,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        console.error('Barcode rendering error:', err);
      }
    }
  }, [value, height, width, fontSize, displayValue]);

  return <svg ref={svgRef} className="w-full max-h-[60px]" />;
};
