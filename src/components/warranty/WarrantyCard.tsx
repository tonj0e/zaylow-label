import React from 'react';
import { Check, Feather, Flame, ShieldCheck, Waves, X } from 'lucide-react';
import { type CardSizeOption, CARD_DIMENSIONS } from '../../constants/warrantyCardSizes';
import { QRCodeComponent } from '../label/QRCodeComponent';

export interface WarrantyCardProps {
  customerName: string;
  purchaseDate: string;
  endDate?: string;
  warrantyPeriod?: string;
  productName?: string;
  orderId?: string;
  size?: CardSizeOption;
  scale?: number;
  productImage?: string;
  innerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

/**
 * Warranty certificate: pure black on white for a thermal printer.
 * Everything is sized in `em` and the card sets its own font size from the paper size,
 * so one design fills 4x6, A6 and compact paper without CSS transforms
 * (transforms break the PNG and PDF export).
 */
export const WarrantyCard: React.FC<WarrantyCardProps> = ({
  customerName = 'Nashid',
  purchaseDate = '01/10/2026',
  endDate = '01/10/2027',
  warrantyPeriod,
  productName = 'Period Cramps Relief Massager',
  orderId = '',
  size = 'thermal',
  scale = 1,
  productImage = '/warranty-product-belt.png',
  innerRef,
  className = '',
}) => {
  const dim = CARD_DIMENSIONS[size] || CARD_DIMENSIONS.thermal;
  const widthPx = Math.round(dim.widthMm * 3.7795 * scale);
  const heightPx = Math.round(dim.heightMm * 3.7795 * scale);
  // drawn for 378 x 567 px (4x6 in) at 10px per em; other papers shrink or grow it
  const fs = 10 * Math.min(widthPx / 378, heightPx / 567);
  const validUntil = warrantyPeriod || endDate || '01/10/2027';
  const shortId = orderId ? orderId.replace('ZYL-', '#') : '';
  const mono = 'ui-monospace, Menlo, monospace';

  const feature = (Icon: typeof Flame, a: string, b: string) => (
    <div key={a} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.35em' }}>
      <Icon style={{ width: '2em', height: '2em' }} strokeWidth={2.2} />
      <span style={{ fontSize: '0.95em', fontWeight: 800, lineHeight: 1.15 }}>{a}<br />{b}</span>
    </div>
  );

  const item = (ok: boolean, text: string) => (
    <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5em' }}>
      <span style={{ width: '1.3em', height: '1.3em', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ok ? '#000' : '#fff', color: ok ? '#fff' : '#000', border: '0.14em solid #000' }}>
        {ok ? <Check style={{ width: '0.85em', height: '0.85em' }} strokeWidth={4} /> : <X style={{ width: '0.85em', height: '0.85em' }} strokeWidth={4} />}
      </span>
      <span style={{ fontWeight: 800, fontSize: '1.05em', lineHeight: 1.15 }}>{text}</span>
    </div>
  );

  const notch = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', [side]: '-1em', width: '1.8em', height: '1.8em', marginTop: '-0.9em',
    borderRadius: '50%', background: '#fff', border: '0.2em solid #000', boxSizing: 'border-box',
  });

  return (
    <div
      ref={innerRef}
      className={`warranty-card-element select-none ${className}`}
      style={{
        width: `${widthPx}px`, height: `${heightPx}px`, boxSizing: 'border-box', fontSize: `${fs}px`, lineHeight: 1.2,
        background: '#fff', color: '#000', border: '0.25em solid #000', borderRadius: '1.1em', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", position: 'relative',
      }}
    >
      {/* Black header bar */}
      <div style={{ background: '#000', color: '#fff', padding: '0.95em 1.4em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55em' }}>
          <svg viewBox="0 0 100 100" fill="none" style={{ width: '2em', height: '2em' }} aria-hidden="true">
            <path d="M50 42 C50 42 50 25 38 18 C26 11 15 23 22 37 C29 51 45 49 50 42Z" fill="#fff" />
            <path d="M58 50 C58 50 75 50 82 38 C89 26 77 15 63 22 C49 29 51 45 58 50Z" fill="#fff" />
            <path d="M50 58 C50 58 50 75 62 82 C74 89 85 77 78 63 C71 49 55 51 50 58Z" fill="#fff" />
            <path d="M42 50 C42 50 25 50 18 62 C11 74 23 85 37 78 C51 71 49 55 42 50Z" fill="#fff" />
          </svg>
          <span style={{ fontWeight: 900, fontSize: '1.9em', letterSpacing: '0.24em', lineHeight: 1 }}>ZAYLOW</span>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.7em', fontWeight: 800, letterSpacing: '0.14em', lineHeight: 1.25 }}>WARRANTY<br />CERTIFICATE</div>
      </div>

      {/* 1 YEAR, and the product beside it */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', alignItems: 'center', gap: '1em', padding: '1.2em 1.4em 0.8em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
          <span style={{ fontWeight: 900, fontSize: '9.4em', lineHeight: 0.8, letterSpacing: '-0.06em' }}>1</span>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontWeight: 900, fontSize: '2.2em', letterSpacing: '0.02em' }}>YEAR</div>
            <div style={{ fontWeight: 800, fontSize: '1.05em', letterSpacing: '0.06em', marginTop: '0.15em' }}>WARRANTY</div>
          </div>
        </div>
        <div style={{ border: '0.17em solid #000', borderRadius: '1.1em', height: '9.8em', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0.3em', boxSizing: 'border-box' }}>
          <img
            src={productImage}
            alt={productName}
            crossOrigin="anonymous"
            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            onError={(e) => { const t = e.currentTarget; if (!t.src.includes('warranty-product-belt.png')) t.src = '/warranty-product-belt.png'; }}
          />
        </div>
      </div>

      {/* Product name pill */}
      <div style={{ margin: '0.2em 1.4em 0', border: '0.17em solid #000', borderRadius: '999px', padding: '0.5em 1em', textAlign: 'center', fontWeight: 900, fontSize: '1.2em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {productName}
      </div>

      {/* Four selling points */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4em', padding: '1em 1.2em 1em' }}>
        {feature(Flame, '3 heat', 'modes')}
        {feature(Waves, '4 massage', 'modes')}
        {feature(ShieldCheck, 'Safe &', 'reliable')}
        {feature(Feather, 'Light &', 'portable')}
      </div>

      {/* Tear line with notches */}
      <div style={{ position: 'relative', borderTop: '0.2em dashed #000', margin: '0.1em 0' }}>
        <span style={notch('left')} />
        <span style={notch('right')} />
      </div>

      {/* Issued to */}
      <div style={{ padding: '1em 1.4em 0' }}>
        <div style={{ fontSize: '0.85em', fontWeight: 800, letterSpacing: '0.18em' }}>ISSUED TO</div>
        <div style={{ fontWeight: 900, fontSize: '2.6em', lineHeight: 1.05, marginTop: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerName}</div>
      </div>

      {/* Dates */}
      <div style={{ margin: '0.8em 1.4em 0', border: '0.17em solid #000', borderRadius: '0.9em', padding: '0.6em 1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5em' }}>
        <div>
          <div style={{ fontSize: '0.78em', fontWeight: 800, letterSpacing: '0.14em' }}>BOUGHT ON</div>
          <div style={{ fontWeight: 900, fontSize: '1.65em', fontFamily: mono, letterSpacing: '-0.02em' }}>{purchaseDate}</div>
        </div>
        <span style={{ fontWeight: 900, fontSize: '1.5em' }}>→</span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.78em', fontWeight: 800, letterSpacing: '0.14em' }}>VALID UNTIL</div>
          <div style={{ fontWeight: 900, fontSize: '1.65em', fontFamily: mono, letterSpacing: '-0.02em' }}>{validUntil}</div>
        </div>
      </div>

      {/* Covers, and does not cover, side by side */}
      <div style={{ margin: '0.8em 1.4em 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8em' }}>
        <div style={{ border: '0.17em solid #000', borderRadius: '0.8em', overflow: 'hidden' }}>
          <div style={{ background: '#000', color: '#fff', fontWeight: 900, fontSize: '0.85em', letterSpacing: '0.06em', padding: '0.55em 0.8em' }}>WARRANTY COVERS</div>
          <div style={{ padding: '0.7em 0.7em', display: 'flex', flexDirection: 'column', gap: '0.65em' }}>
            {item(true, 'Manufacturer defects')}
            {item(true, 'Not working or charging problems')}
            {item(true, 'Repair or replacement in 1 year')}
          </div>
        </div>
        <div style={{ border: '0.17em solid #000', borderRadius: '0.8em', overflow: 'hidden' }}>
          <div style={{ fontWeight: 900, fontSize: '0.85em', letterSpacing: '0.01em', padding: '0.55em 0.5em 0.55em 0.8em', borderBottom: '0.17em solid #000', whiteSpace: 'nowrap' }}>WARRANTY DOES NOT COVER</div>
          <div style={{ padding: '0.7em 0.7em', display: 'flex', flexDirection: 'column', gap: '0.65em' }}>
            {item(false, 'Drops, knocks or other physical damage')}
            {item(false, 'Water or liquid damage')}
          </div>
        </div>
      </div>

      {/* Footer: QR on the left, thank you on the right */}
      <div style={{ marginTop: 'auto', padding: '0.8em 1.4em 1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', minWidth: 0 }}>
          {orderId && (
            <div style={{ lineHeight: 0, border: '0.12em solid #000', padding: '0.2em', borderRadius: '0.3em', flexShrink: 0 }}>
              <QRCodeComponent value={orderId} size={Math.round(5.2 * fs)} />
            </div>
          )}
          <div style={{ fontSize: '0.72em', fontWeight: 800, letterSpacing: '0.08em', lineHeight: 1.4 }}>
            SCAN TO CHECK<br />YOUR WARRANTY<br />{shortId}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Dancing Script', 'Alex Brush', cursive", fontSize: '2.6em', lineHeight: 0.95 }}>Thank you</div>
          <div style={{ fontSize: '0.68em', fontWeight: 800, letterSpacing: '0.08em', marginTop: '0.3em' }}>STAY COMFORTABLE ALWAYS</div>
        </div>
      </div>
    </div>
  );
};
