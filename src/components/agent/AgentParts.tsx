import React, { useEffect, useState } from 'react';
import { Mic, Square, Phone, X, ChevronDown, Send, ShieldCheck, Loader2 } from 'lucide-react';
import type { SavedReport } from '../../services/aiAgentService';
import { LANGS, type Status, type useAssistant } from './useAssistant';

type A = ReturnType<typeof useAssistant>;

export const AGENT_CSS = `
.ag-orb{position:relative;display:grid;place-items:center;border-radius:999px;background:var(--lime);color:var(--on-lime);border:0;cursor:pointer;transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .25s;box-shadow:0 14px 34px -12px color-mix(in srgb,var(--lime) 85%,transparent)}
.ag-orb:active{transform:scale(.94)}
.ag-orb[data-status=idle]{animation:ag-breathe 3.4s ease-in-out infinite}
.ag-orb .ag-ring{position:absolute;inset:0;border-radius:999px;border:2px solid var(--lime);opacity:0;pointer-events:none}
.ag-orb[data-status=listening] .ag-ring{animation:ag-ripple 1.7s cubic-bezier(.22,1,.36,1) infinite}
.ag-orb[data-status=listening] .ag-ring:nth-child(2){animation-delay:.55s}
.ag-orb[data-status=listening] .ag-ring:nth-child(3){animation-delay:1.1s}
.ag-orb[data-status=thinking]::after{content:'';position:absolute;inset:-7px;border-radius:999px;border:3px solid transparent;border-top-color:var(--lime);animation:ag-spin .9s linear infinite}
.ag-bars{display:flex;gap:3px;align-items:center;height:42%}
.ag-bars i{display:block;width:4px;border-radius:3px;background:currentColor;height:30%;animation:ag-bar .9s ease-in-out infinite}
.ag-bars i:nth-child(2){animation-delay:.12s}.ag-bars i:nth-child(3){animation-delay:.24s}.ag-bars i:nth-child(4){animation-delay:.36s}.ag-bars i:nth-child(5){animation-delay:.48s}
.ag-dots i{display:inline-block;width:7px;height:7px;border-radius:99px;background:var(--muted);margin:0 2px;animation:ag-dot 1.1s ease-in-out infinite}
.ag-dots i:nth-child(2){animation-delay:.15s}.ag-dots i:nth-child(3){animation-delay:.3s}
.ag-in{animation:ag-in .32s cubic-bezier(.22,1,.36,1) both}
.ag-tile{transition:transform .16s cubic-bezier(.22,1,.36,1),background .15s}
.ag-tile:active{transform:scale(.97)}
@keyframes ag-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
@keyframes ag-ripple{0%{transform:scale(1);opacity:.55}100%{transform:scale(2.1);opacity:0}}
@keyframes ag-spin{to{transform:rotate(360deg)}}
@keyframes ag-bar{0%,100%{height:28%}50%{height:100%}}
@keyframes ag-dot{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-5px);opacity:1}}
@keyframes ag-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ag-orb,.ag-orb .ag-ring,.ag-orb::after,.ag-bars i,.ag-dots i,.ag-in{animation:none!important}.ag-orb[data-status=listening] .ag-ring{opacity:.35;transform:scale(1.5)}}
`;

/** The voice button: the one memorable thing on the page. It breathes, ripples while listening, spins while thinking, dances while speaking. */
export const Orb: React.FC<{ status: Status; size: number; onClick: () => void; label: string }> = ({ status, size, onClick, label }) => (
  <button type="button" onClick={onClick} data-status={status} aria-label={label} className="ag-orb" style={{ width: size, height: size }}>
    <span className="ag-ring" /><span className="ag-ring" /><span className="ag-ring" />
    {status === 'speaking' ? <span className="ag-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      : status === 'listening' ? <Square className="relative" style={{ width: size * 0.3, height: size * 0.3 }} fill="currentColor" aria-hidden="true" />
      : <Mic className="relative" style={{ width: size * 0.4, height: size * 0.4 }} aria-hidden="true" />}
  </button>
);

export const Thinking: React.FC<{ label?: string }> = ({ label = 'Checking your data' }) => (
  <div className="flex ag-in"><div className="k-card rounded-2xl rounded-bl-md px-4 py-3 text-sm k-muted flex items-center gap-2"><span className="ag-dots" aria-hidden="true"><i /><i /><i /></span>{label}</div></div>
);

// ── Answer formatter: headings, bullets, bold and returned-customer cards (no HTML injection, plain React nodes) ──
const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>));

type Row = { date: string; name: string; phone: string; pin: string; rest: string };
const parseRow = (line: string): Row => {
  const p = line.replace(/^\s*[•\-*]\s*/, '').split(' · ').map((x) => x.trim());
  const pinAt = p.findIndex((x) => /^PIN\b/i.test(x));
  return { date: p[0] || '', name: p[1] || '', phone: (p[2] || '').replace(/\D/g, ''), pin: pinAt > -1 ? p[pinAt].replace(/^PIN\s*/i, '') : '', rest: p.slice(pinAt > -1 ? pinAt + 1 : 3).join(' · ') };
};

export const Rich: React.FC<{ text: string }> = ({ text }) => {
  const report = /Section health|Do tomorrow|How the day went|For the developer/i.test(text);
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let firstDone = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    if (/^Returned customers/i.test(line)) {
      const rows: Row[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) { const l = lines[j].trim(); if (!l) continue; if (/^[•\-*]/.test(l)) rows.push(parseRow(l)); else if (/^No returns/i.test(l)) { j++; break; } else break; }
      i = j - 1;
      out.push(
        <div key={`r${i}`} className="mt-4">
          <p className="text-xs font-semibold k-muted mb-2">Returned customers, last 7 days</p>
          {rows.length === 0 ? <p className="text-sm k-muted">No returns in the last 7 days.</p> : (
            <ul className="space-y-2">
              {rows.map((r, k) => (
                <li key={k} className="k-card2 rounded-2xl px-3.5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{r.name || 'No name'}</p>
                    <p className="text-xs k-muted">{[r.date, r.pin && `PIN ${r.pin}`, r.rest].filter(Boolean).join(' · ')}</p>
                  </div>
                  {r.phone && <a href={`tel:${r.phone}`} className="k-btn k-btn-soft h-10 px-3 text-sm shrink-0" aria-label={`Call ${r.name}`}><Phone className="w-3.5 h-3.5" /> {r.phone}</a>}
                </li>
              ))}
            </ul>
          )}
        </div>,
      );
      continue;
    }
    const num = line.match(/^(\d+)[.)]\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (report && num && !/[.!]$/.test(num[2]) && num[2].length <= 46 && !/:\s*\S/.test(num[2])) {
      out.push(<h4 key={i} className="mt-4 first:mt-0 text-[15px] font-bold flex items-center gap-2"><span className="w-1.5 h-4 rounded-full" style={{ background: 'var(--lime)' }} aria-hidden="true" />{num[2].replace(/\*\*/g, '')}</h4>);
    } else if (bullet || num) {
      const body = bullet ? bullet[1] : num![2];
      out.push(
        <p key={i} className="text-sm leading-relaxed flex gap-2.5 mt-1.5">
          {num && !bullet ? <span className="font-semibold k-muted tabular-nums shrink-0 w-4">{num[1]}.</span> : <span className="mt-[0.5rem] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--lime)' }} aria-hidden="true" />}
          <span className="min-w-0">{bold(body)}</span>
        </p>,
      );
    } else {
      const lead = !firstDone && !report;
      firstDone = true;
      out.push(<p key={i} className={lead ? 'text-[17px] font-semibold leading-snug' : 'text-sm leading-relaxed mt-2'}>{bold(line)}</p>);
    }
  }
  return <div>{out}</div>;
};

/** Bottom sheet on a phone, centred card on a bigger screen */
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div className="k-card relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-b-none sm:rounded-b-[20px] p-5 pb-8 ag-in" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-xl font-bold k-display">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-11 h-11"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative w-12 h-7 rounded-full shrink-0 transition-colors" style={{ background: on ? 'var(--lime)' : 'var(--line)' }}>
    <span className="absolute top-1 w-5 h-5 rounded-full transition-all" style={{ left: on ? '1.5rem' : '0.25rem', background: on ? 'var(--on-lime)' : 'var(--muted)' }} />
  </button>
);

/** Language, voice and Telegram. Shown in the side column on a computer and in a sheet on a phone. */
export const SettingsPanel: React.FC<{ a: A }> = ({ a }) => (
  <div className="space-y-5">
    <div>
      <p className="k-label">Language</p>
      <div className="flex flex-wrap gap-2">{LANGS.map((l) => <button key={l.id} type="button" className="k-chip" aria-pressed={a.lang === l.id} onClick={() => a.setLang(l.id)} style={{ minHeight: 40 }}>{l.label}</button>)}</div>
    </div>
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">Speak the answers</p><p className="text-xs k-muted">The assistant reads each answer aloud.</p></div>
      <Switch on={a.speak} onChange={(v) => { a.setSpeak(v); if (!v) a.stopSpeaking(); }} label="Speak the answers" />
    </div>
    {a.speak && a.lang !== 'ml' && (
      <div>
        <p className="k-label">Voice type</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="k-chip" aria-pressed={a.engine === 'browser'} onClick={() => { a.setEngine('browser'); a.stopSpeaking(); }} style={{ minHeight: 40 }}>Phone voice</button>
          <button type="button" className="k-chip" aria-pressed={a.engine === 'nvidia'} onClick={() => { a.setEngine('nvidia'); a.stopSpeaking(); }} style={{ minHeight: 40 }}>Natural voice</button>
        </div>
      </div>
    )}
    {a.speak && (a.engine === 'browser' || a.lang === 'ml') && (
      a.langVoices.length > 0 ? (
        <label className="block"><span className="k-label">Phone voice</span>
          <select value={a.voiceName || a.best?.name || ''} onChange={(e) => a.setVoiceName(e.target.value)} aria-label="Voice" className="k-field">
            {a.langVoices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </label>
      ) : <p className="text-xs k-muted">No {LANGS.find((l) => l.id === a.lang)!.label} voice on this device.</p>
    )}
    <div className="k-card2 rounded-2xl p-4">
      <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: a.tg ? 'var(--lime)' : 'var(--muted)' }} aria-hidden="true" /><p className="text-sm font-semibold">Telegram {a.tg === true ? 'is connected' : a.tg === false ? 'is not connected' : ''}</p></div>
      <p className="text-xs k-muted mt-1.5">{a.tg === false ? 'In Supabase, Edge Functions, Secrets, add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.' : a.tg === true ? 'The daily report is sent there too.' : 'Checking…'}</p>
      {a.tgMsg && <p role="status" className="text-xs font-medium mt-2">{a.tgMsg}</p>}
      {a.tg !== null && <button type="button" onClick={a.testTelegram} disabled={a.tgBusy || a.tg === false} className="k-btn k-btn-soft h-10 px-4 text-sm mt-3">{a.tgBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send test message</button>}
    </div>
    <p className="text-xs k-muted flex items-start gap-2"><ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" /> It can only read. It sees totals, never customer names, phones or addresses. Customer details are added by the app after the answer.</p>
  </div>
);

const dmy = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

export const ReportsPanel: React.FC<{ reports: SavedReport[]; msg: string }> = ({ reports, msg }) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {msg && <p className="text-sm k-muted">{msg}</p>}
      {!msg && reports.length === 0 && <p className="text-sm k-muted">No saved report yet. Tap Today's report to make the first one.</p>}
      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.id} className="k-card2 rounded-2xl">
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="w-full flex items-center justify-between gap-3 px-4 min-h-[48px] text-left"><span className="font-semibold text-sm">{dmy(r.report_date)}</span><ChevronDown className={`w-4 h-4 transition-transform ${open === r.id ? 'rotate-180' : ''}`} /></button>
            {open === r.id && <div className="px-4 pb-4"><Rich text={r.text} /></div>}
          </li>
        ))}
      </ul>
    </div>
  );
};
