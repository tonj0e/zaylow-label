/**
 * Orders keep the name a product had on the day it was sold ("MASSAGER", "premium quality 2nd carton"...).
 * This maps all of those old names to the real products, so reports and the dashboard count each product once.
 */
export const canonicalProduct = (name?: string | null): string => {
  const n = (name || '').toLowerCase();
  if (/premium/.test(n)) return 'Period Massager Premium';
  if (/mint|roller/.test(n)) return 'Mint Roller';
  if (/erase|sponge|razor/.test(n)) return 'ERASER';
  if (/massag/.test(n)) return 'Period Massager';
  return (name || '').trim() || 'Unnamed product';
};
