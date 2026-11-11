import { indiaStatesAndDistricts } from '../constants/indiaStates';

export interface ParsedAddress {
  name: string; phone: string; addressLine: string; landmark: string; city: string; pinCode: string; state: string; district: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,.\-:;|]+|[\s,.\-:;|]+$/g, '').trim();
const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// the first two digits of a PIN code tell the state
const PIN_STATE: [RegExp, string][] = [
  [/^(1[2-3])/, 'Haryana'], [/^(1[4-6])/, 'Punjab'], [/^17/, 'Himachal Pradesh'], [/^(18|19)/, 'Jammu and Kashmir'],
  [/^(2[0-8])/, 'Uttar Pradesh'], [/^2(4[4-9]|6)/, 'Uttarakhand'], [/^(3[0-4])/, 'Rajasthan'], [/^(3[6-9])/, 'Gujarat'],
  [/^(4[0-4])/, 'Maharashtra'], [/^403/, 'Goa'], [/^(4[5-8])/, 'Madhya Pradesh'], [/^49/, 'Chhattisgarh'], [/^50/, 'Telangana'],
  [/^(5[1-3])/, 'Andhra Pradesh'], [/^(5[6-9])/, 'Karnataka'], [/^(6[0-4])/, 'Tamil Nadu'], [/^(6[7-9])/, 'Kerala'],
  [/^(7[0-4])/, 'West Bengal'], [/^(7[5-7])/, 'Odisha'], [/^78/, 'Assam'], [/^79[0-4]/, 'Meghalaya'], [/^79[5]/, 'Manipur'], [/^796/, 'Mizoram'],
  [/^797/, 'Nagaland'], [/^799/, 'Tripura'], [/^737/, 'Sikkim'], [/^791/, 'Arunachal Pradesh'], [/^(8[0-5])/, 'Bihar'],
];
const stateFromPin = (pin: string) => {
  if (/^73[7]/.test(pin)) return 'Sikkim';
  if (/^8[1-3]/.test(pin)) return 'Jharkhand';
  if (/^(80|84|85)/.test(pin)) return 'Bihar';
  if (/^(24[4-9]|26)/.test(pin)) return 'Uttarakhand';
  for (const [re, st] of PIN_STATE) if (re.test(pin)) return st;
  return '';
};

const STATES = Object.keys(indiaStatesAndDistricts);
const STATE_WORDS: [string, string][] = [
  ...STATES.map((s) => [norm(s), s] as [string, string]),
  ['tamilnadu', 'Tamil Nadu'], ['tamil nadu', 'Tamil Nadu'], ['t n', 'Tamil Nadu'], ['kerela', 'Kerala'], ['orissa', 'Odisha'], ['uttaranchal', 'Uttarakhand'], ['jammu kashmir', 'Jammu and Kashmir'], ['j k', 'Jammu and Kashmir'], ['bengal', 'West Bengal'], ['up', 'Uttar Pradesh'], ['mp', 'Madhya Pradesh'], ['ap', 'Andhra Pradesh'], ['hp', 'Himachal Pradesh'],
];

// other spellings people use for the same district
const ALIAS: Record<string, string> = {
  gurgaon: 'Gurugram', alleppey: 'Alappuzha', cherthala: 'Alappuzha', chertala: 'Alappuzha', trivandrum: 'Thiruvananthapuram', cochin: 'Ernakulam', kochi: 'Ernakulam', calicut: 'Kozhikode', trichur: 'Thrissur',
  bangalore: 'Bengaluru Urban', bengaluru: 'Bengaluru Urban', mysore: 'Mysuru', madras: 'Chennai', pondicherry: 'Puducherry', bombay: 'Mumbai', poona: 'Pune', vizag: 'Visakhapatnam', coimbatore: 'Coimbatore',
};

/** The district from the PIN's position on the map. Loaded only when needed. */
export const districtFromPin = async (pin: string, state: string): Promise<string> => {
  try {
    const [pins, dists] = await Promise.all([import('../data/inPincodes.json'), import('../data/indiaDistricts.json')]);
    const at = (pins.default as unknown as Record<string, [number, number]>)[pin];
    if (!at) return '';
    const [lat, lng] = at;
    type G = { type: string; coordinates: number[][][] | number[][][][] };
    const inPoly = (g: G) => {
      const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as number[][][][];
      return polys.some((poly) => {
        let inside = false;
        const r = poly[0];
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i], [xj, yj] = r[j];
          if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      });
    };
    const hit = (dists.default as unknown as { features: { properties: { d: string; s: string }; geometry: G }[] }).features.find((f) => inPoly(f.geometry));
    if (!hit) return '';
    const list = indiaStatesAndDistricts[state] || [];
    const want = norm(hit.properties.d);
    return list.find((d) => norm(d) === want) || list.find((d) => norm(d).startsWith(want) || want.startsWith(norm(d))) || '';
  } catch { return ''; }
};

/** Reads a pasted WhatsApp message (or any block of text) and picks out the order details. */
export const parseAddress = (raw: string): ParsedAddress => {
  const out: ParsedAddress = { name: '', phone: '', addressLine: '', landmark: '', city: '', pinCode: '', state: '', district: '' };
  if (!raw.trim()) return out;
  // WhatsApp adds "[11:42, 11/11/2026] Name: " at the start; emojis and decorations are removed
  let text = raw.replace(/\r/g, '').replace(/^\s*\[?\d{1,2}[:.]\d{2}.*?\]?\s*[-–]?\s*[^:\n]{1,40}:\s*/gm, '').replace(/\p{Extended_Pictographic}|\uFE0F|[*_~•●▪]/gu, ' ');

  // phone: the first Indian mobile number
  const ph = text.match(/(?:\+?\s*91[\s-]*)?\b([6-9]\d{4}[\s-]?\d{5})\b/);
  if (ph) { out.phone = ph[1].replace(/\D/g, ''); text = text.replace(ph[0], '\n'); }
  else { const alt = text.match(/\b(?:\+?91[\s-]*)?([6-9](?:[\s-]?\d){9})\b/); if (alt) { out.phone = alt[1].replace(/\D/g, ''); text = text.replace(alt[0], '\n'); } }
  // other numbers (a second phone, landline) must not be mistaken for a PIN
  const pins = [...text.matchAll(/(?<![\d])([1-9]\d{2}\s?\d{3})(?![\d])/g)];
  const pinHit = pins[pins.length - 1];
  if (pinHit) { out.pinCode = pinHit[1].replace(/\s/g, ''); text = text.slice(0, pinHit.index) + '\n' + text.slice((pinHit.index || 0) + pinHit[0].length); }

  const LABELS: [keyof ParsedAddress, RegExp][] = [
    ['name', /^(?:full\s*name|customer\s*name|customer|name|nm)\b\s*[:\-=]\s*(.*)$/i],
    ['phone', /^(?:phone|mobile|mob|contact|whats\s*app|number|ph|cell)(?:\s*(?:no|number))?\b\s*[:\-=]\s*(.*)$/i],
    ['addressLine', /^(?:full\s*address|address|addr|add|house|door\s*no)\b\s*[:\-=]\s*(.*)$/i],
    ['landmark', /^(?:landmark|land\s*mark|near(?:by)?|lm)\b\s*[:\-=]\s*(.*)$/i],
    ['city', /^(?:city|place|town|village|post\s*office|post|po|location)\b\s*[:\-=]\s*(.*)$/i],
    ['pinCode', /^(?:pin\s*code|pincode|pin|zip|postal\s*code)\b\s*[:\-=]\s*(.*)$/i],
    ['state', /^(?:state)\b\s*[:\-=]\s*(.*)$/i],
    ['district', /^(?:district|dist|dt)\b\s*[:\-=]\s*(.*)$/i],
  ];
  const free: string[] = [];
  const labelled: Partial<Record<keyof ParsedAddress, string>> = {};
  for (const line of text.split('\n').map(clean).filter(Boolean)) {
    let used = false;
    for (const [key, re] of LABELS) {
      const m = line.match(re);
      if (!m) continue;
      const v = clean(m[1]);
      if (key !== 'phone' && key !== 'pinCode' && v) labelled[key] = labelled[key] ? `${labelled[key]}, ${v}` : v;
      used = true; break;
    }
    if (!used) free.push(line);
  }

  // state: written out, or from the PIN
  const whole = norm(text);
  const found = STATE_WORDS.find(([w]) => w.length > 3 && new RegExp(`(^| )${w}( |$)`).test(whole));
  const labelledState = labelled.state ? STATE_WORDS.find(([w]) => norm(labelled.state || '') === w) : undefined;
  out.state = labelledState?.[1] || found?.[1] || stateFromPin(out.pinCode);

  // district: written out in the message
  const dList = indiaStatesAndDistricts[out.state] || [];
  out.district = dList.find((d) => new RegExp(`(^| )${norm(d)}( |$)`).test(whole)) || '';
  if (!out.district) {
    for (const [word, d] of Object.entries(ALIAS)) if (new RegExp(`(^| )${word}( |$)`).test(whole) && dList.includes(d)) { out.district = d; break; }
  }

  // what is left is the name and the address
  const dropWords = (s: string) => {
    let v = s;
    if (out.state) v = v.replace(new RegExp(out.state.replace(/ /g, '\\s*'), 'ig'), '');
    for (const [w, st] of STATE_WORDS) if (w.length > 4 && st === out.state) v = v.replace(new RegExp(`\\b${w.replace(/ /g, '\\s*')}\\b`, 'ig'), '');
    return clean(v);
  };
  const BARE = /^(phone|mobile|mob|contact|whats\s*app|number|ph|pin|pin\s*code|pincode|zip|state|name|address|landmark|city|district|dist|dt|add)$/i;
  const rest = free.map(dropWords).filter((l) => l && !BARE.test(l));
  let nameLine = labelled.name || '';
  if (!nameLine) {
    const i = rest.findIndex((l) => !/\d/.test(l) && l.split(' ').length <= 4 && l.length <= 36);
    if (i >= 0) { nameLine = rest[i]; rest.splice(i, 1); }
  }
  out.name = clean(nameLine).replace(/\b\w/g, (c) => c.toUpperCase());
  out.landmark = labelled.landmark ? clean(labelled.landmark) : '';
  if (!out.landmark) {
    const i = rest.findIndex((l) => /^(near|opp|opposite|behind|beside)\b/i.test(l));
    if (i >= 0) { out.landmark = rest[i]; rest.splice(i, 1); }
  }
  const addrParts = [labelled.addressLine, ...rest].filter(Boolean).join(', ').split(',').map(clean).filter(Boolean);
  // district name mentioned inside the address is taken out of it
  const cleanedParts = addrParts.filter((p) => !(out.district && norm(p) === norm(out.district)));
  // city: labelled, or the last piece of the address
  let city = labelled.city ? clean(labelled.city) : '';
  if (!city) {
    const po = cleanedParts.find((q) => /\bp\.?\s?o\.?$/i.test(q));
    if (po) city = clean(po.replace(/\bp\.?\s?o\.?$/i, ''));
  }
  if (!city && cleanedParts.length >= 3) city = cleanedParts.pop() || '';
  if (!city && cleanedParts.length >= 1 && !/\d/.test(cleanedParts[cleanedParts.length - 1])) city = cleanedParts[cleanedParts.length - 1];
  out.city = city;
  out.addressLine = cleanedParts.join(', ');
  if (BARE.test(out.name)) out.name = '';
  if (!out.district && labelled.district) out.district = dList.find((d) => norm(d) === norm(labelled.district || '')) || '';
  return out;
};
