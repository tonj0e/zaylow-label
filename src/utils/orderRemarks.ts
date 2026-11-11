/**
 * Orders keep their quantity, carton, product, advance, district and landmark packed
 * into one `remarks` text, e.g. "QTY:1 ADV:100 CTN:ab12 PRD:cd34 | DST:Ernakulam | LMK:Near temple".
 * Anything typed by a person comes BEFORE the "QTY:" part.
 */
export interface RemarkEdits {
  advancePaid: number;
  district: string;
  landmark: string;
  notes: string;
}

export const buildRemarks = (existing: string | null | undefined, e: RemarkEdits): string => {
  const remarks = existing || '';
  const pick = (re: RegExp) => remarks.match(re)?.[1];

  const parts = [`QTY:${pick(/QTY:(\d+)/) || '1'}`];
  if (e.advancePaid > 0) parts.push(`ADV:${Math.round(e.advancePaid)}`);
  const ctn = pick(/CTN:([^\s|]+)/);
  const prd = pick(/PRD:([^\s|]+)/);
  if (ctn) parts.push(`CTN:${ctn}`);
  if (prd) parts.push(`PRD:${prd}`);

  let tokens = parts.join(' ');
  if (e.district.trim()) tokens += ` | DST:${e.district.trim()}`;
  if (e.landmark.trim()) tokens += ` | LMK:${e.landmark.trim()}`;
  const delivered = pick(/DLV:(\d{4}-\d{2}-\d{2})/);
  if (delivered) tokens += ` | DLV:${delivered}`;
  const cardPrinted = pick(/WCP:(\d{4}-\d{2}-\d{2})/);
  if (cardPrinted) tokens += ` | WCP:${cardPrinted}`;

  const notes = e.notes.trim();
  return notes ? `${notes} ${tokens}` : tokens;
};
