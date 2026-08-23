export interface LabelSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
  popular?: boolean;
}

/**
 * Common thermal shipping label sizes used in India & globally.
 * Base pixel dimensions assume ~96 DPI screen rendering:
 *   1 mm ≈ 3.78px at 96 DPI.
 * We use a 4px/mm ratio for crisp display.
 */
export const LABEL_SIZES: LabelSize[] = [
  {
    id: '100x150',
    name: '100 × 150 mm',
    widthMm: 100,
    heightMm: 150,
    description: '4×6 inch — Standard Shipping Label (Delhivery, BlueDart, India Post)',
    popular: true
  },
  {
    id: '100x100',
    name: '100 × 100 mm',
    widthMm: 100,
    heightMm: 100,
    description: '4×4 inch — Square Label (Flipkart, Amazon Fulfilled)'
  },
  {
    id: '75x100',
    name: '75 × 100 mm',
    widthMm: 75,
    heightMm: 100,
    description: '3×4 inch — Compact Shipping Label (DTDC, Ekart)'
  },
  {
    id: '80x130',
    name: '80 × 130 mm',
    widthMm: 80,
    heightMm: 130,
    description: '3.1×5.1 inch — Wide Compact Label (Shiprocket, NimbusPost)'
  },
  {
    id: '100x200',
    name: '100 × 200 mm',
    widthMm: 100,
    heightMm: 200,
    description: '4×8 inch — Extended Shipping Label (International Courier, FedEx)'
  },
  {
    id: '62x100',
    name: '62 × 100 mm',
    widthMm: 62,
    heightMm: 100,
    description: '2.4×4 inch — Narrow Label (Document Mailers, DTDC Lite)'
  },
  {
    id: '50x30',
    name: '50 × 30 mm',
    widthMm: 50,
    heightMm: 30,
    description: '2×1.2 inch — Small Barcode / Price Tag Label'
  },
  {
    id: '40x25',
    name: '40 × 25 mm',
    widthMm: 40,
    heightMm: 25,
    description: '1.6×1 inch — Mini SKU / Inventory Tag'
  }
];

export const DEFAULT_LABEL_SIZE = LABEL_SIZES[0];

/** Convert mm to screen pixels at 4px/mm ratio */
export const mmToPx = (mm: number) => Math.round(mm * 4);
