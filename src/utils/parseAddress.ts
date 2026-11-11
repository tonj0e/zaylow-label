import { indiaStatesAndDistricts } from '../constants/indiaStates';

export interface ParsedAddress {
  name: string; phone: string; addressLine: string; landmark: string; city: string; pinCode: string; state: string; district: string;
  /** districts the message mentions or the PIN points to; offered as buttons, never filled in by themselves */
  districtHints: string[];
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
  const out: ParsedAddress = { name: '', phone: '', addressLine: '', landmark: '', city: '', pinCode: '', state: '', district: '', districtHints: [] };
  if (!raw.trim()) return out;
  // WhatsApp adds "[11:42, 11/11/2026] Name: " at the start; emojis and decorations are removed
  let text = raw.replace(/\r/g, '').replace(/^\s*\[?\d{1,2}[:.]\d{2}.*?\]?\s*[-–]?\s*[^:\n]{1,40}:\s*/gm, '').replace(/\p{Extended_Pictographic}|\uFE0F|[*_~•●▪]/gu, ' ');

  // landline lines ("Tel 0471 2345678") are not wanted
  text = text.replace(/^[^\n]*\b(?:tel|telephone|landline|std)\b[ \t:.-]*\d[\d \t-]*$/gim, '\n');
  // phone: a 10-digit Indian mobile number (starts with 6 to 9), written with or without spaces, dashes or +91
  const ph = text.match(/(?<!\d)(?:(?:\+|00)?\s?91[\s.-]?)?([6-9](?:[\s.-]?\d){9})(?!\d)/);
  if (ph) { out.phone = ph[1].replace(/\D/g, ''); text = text.replace(ph[0], '\n'); }
  // PIN: exactly 6 digits on their own. Any longer run of digits (a landline, a wrong number) is ignored, so it can never become a PIN.
  const forPin = text.replace(/(?<!\d)\d(?:[\s.-]?\d){6,}(?!\d)/g, ' ');
  const pins = [...forPin.matchAll(/(?<!\d)([1-9]\d{5}|[1-9]\d{2}[\s-]\d{3})(?!\d)/g)];
  const pinHit = pins[pins.length - 1];
  if (pinHit) { out.pinCode = pinHit[1].replace(/\D/g, ''); text = text.replace(pinHit[0], '\n'); }

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

  // district: filled in only when the message says "District: ...". Otherwise it is left for you to choose.
  const dList = indiaStatesAndDistricts[out.state] || [];
  const dAlias = (v: string) => { const n = norm(v); return dList.find((d) => norm(d) === n) || (ALIAS[n] && dList.includes(ALIAS[n]) ? ALIAS[n] : ''); };
  if (labelled.district) out.district = dAlias(labelled.district);
  // districts named anywhere in the message are offered as buttons
  const hints = new Set<string>();
  for (const d of dList) if (new RegExp(`(^| )${norm(d)}( |$)`).test(whole)) hints.add(d);
  for (const [word, d] of Object.entries(ALIAS)) if (dList.includes(d) && new RegExp(`(^| )${word}( |$)`).test(whole)) hints.add(d);
  out.districtHints = [...hints].filter((d) => d !== out.district);

  // what is left is the name and the address
  const dropWords = (s2: string) => {
    let v = s2;
    if (out.state) v = v.replace(new RegExp(out.state.replace(/ /g, '\\s*'), 'ig'), '');
    for (const [w, st] of STATE_WORDS) if (w.length > 4 && st === out.state) v = v.replace(new RegExp(`\\b${w.replace(/ /g, '\\s*')}\\b`, 'ig'), '');
    return clean(v);
  };
  const BARE = /^(phone|mobile|mob|contact|whats\s*app|number|ph|pin|pin\s*code|pincode|zip|state|name|address|landmark|city|district|dist|dt|add)$/i;
  const rest = free.map(dropWords).filter((l) => l && !BARE.test(l));

  // the name: written with a label, or the first line when it clearly looks like a name. Never guessed from the address.
  const ADDRESS_WORDS = /\b(house|home|villa|flat|apartment|apartments|road|rd|street|st|lane|nagar|colony|temple|church|mosque|school|hospital|market|junction|jn|po|p\.o|post|near|opp|opposite|behind|beside|ward|door|no|nr|bus|stand|building|complex|tower|plaza|park)\b/i;
  let nameLine = labelled.name || '';
  if (!nameLine && rest.length) {
    const l = rest[0];
    if (!/\d/.test(l) && !l.includes(',') && l.split(' ').length <= 4 && l.length <= 36 && !ADDRESS_WORDS.test(l)) { nameLine = l; rest.shift(); }
  }
  out.name = BARE.test(clean(nameLine)) ? '' : clean(nameLine).replace(/\b\w/g, (c) => c.toUpperCase());

  // split into pieces; "near ..." pieces are the landmark
  const pieces = [labelled.addressLine, ...rest].filter(Boolean).join(', ').split(',').map(clean).filter(Boolean);
  const LM = /^(near|nr|opp|opposite|behind|beside|landmark)\b/i;
  const lm = [labelled.landmark ? clean(labelled.landmark) : '', ...pieces.filter((q) => LM.test(q))].filter(Boolean);
  out.landmark = lm.join(', ');
  const addr = pieces.filter((q) => !LM.test(q));

  // city: written with a label, or the place before "P.O". Otherwise left empty for you.
  let city = labelled.city ? clean(labelled.city) : '';
  if (!city) {
    const po = addr.find((q) => /\bp\.?\s?o\.?$/i.test(q));
    if (po) { const words = clean(po.replace(/\bp\.?\s?o\.?$/i, '')).split(' '); city = words[words.length - 1] || ''; }
  }
  out.city = city;
  out.addressLine = addr.join(', ');
  return out;
};
