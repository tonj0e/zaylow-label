export type CardSizeOption = 'A6' | 'thermal' | 'compact';

export const CARD_DIMENSIONS: Record<CardSizeOption, { widthMm: number; heightMm: number; label: string }> = {
  A6: { widthMm: 105, heightMm: 148, label: 'A6 Postcard (105 × 148 mm) - Box Insert' },
  thermal: { widthMm: 100, heightMm: 150, label: '4×6" Thermal / Card (100 × 150 mm)' },
  compact: { widthMm: 85, heightMm: 125, label: 'Compact Box Insert (85 × 125 mm)' }
};
