import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Sparkles, Volume2, VolumeX, FileText, SlidersHorizontal, Mic, ShoppingBag, Boxes, AlertTriangle, Undo2, Activity, Clock3, Copy, Check, X } from 'lucide-react';
import { useAssistant } from './useAssistant';
import { AGENT_CSS, Orb, Thinking, Rich, Sheet, SettingsPanel, ReportsPanel } from './AgentParts';

const TILES = [
  { icon: ShoppingBag, label: 'Orders', hint: 'Today and yesterday', q: 'How many orders were created today and yesterday?' },
  { icon: Boxes, label: 'Low stock', hint: 'What to refill', q: 'What is low in stock?' },
  { icon: AlertTriangle, label: 'Problems', hint: 'Found in your orders', q: 'Any problems in my orders?' },
  { icon: Undo2, label: 'Returns', hint: 'Who sent parcels back', q: 'Who returned this week?' },
  { icon: Activity, label: 'Sections', hint: 'Working or not', q: 'Is any section not working?' },
  { icon: Clock3, label: 'Unused', hint: 'Idle for 3 days', q: 'Which sections did we not use for 3 days?' },
];
const STATUS_TEXT = { idle: 'Ready', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' } as const;

export const AgentView: React.FC = () => {
  const a = useAssistant();
  const [sheet, setSheet] = useState<'settings' | 'reports' | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const empty = a.turns.length === 0 && !a.busy && !a.makingReport;

  useEffect(() => { if (!empty) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [a.turns, a.busy, a.makingReport, a.listening, empty]);

  const copy = async (i: number, t: string) => {
    try { await navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(null), 1800); } catch { /* clipboard blocked */ }
  };

  const listeningPanel = (
    <div className="ag-in k-card rounded-3xl px-5 py-7 text-center" role="status" aria-live="polite">
      <div className="grid place-items-center" style={{ height: 118 }}><Orb status="listening" size={84} onClick={a.mic} label="Stop and send" /></div>
      <p className="mt-4 text-[26px] leading-tight font-semibold k-display min-h-[2.4em] break-words">{a.text || 'Listening…'}</p>
      <p className="text-xs k-muted mt-2">Stop speaking and it sends by itself. Tap the button to send now.</p>
      <button type="button" onClick={a.cancelListening} className="k-btn k-btn-ghost h-11 px-5 text-sm mt-4"><X className="w-4 h-4" /> Cancel</button>
    </div>
  );

  return (
    <div className="kdash ag-page" style={{ background: 'transparent' }}>
      <style>{AGENT_CSS}</style>
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:gap-6">
        <section className="flex flex-col min-w-0 min-h-[calc(100dvh-57px-96px)] md:min-h-[calc(100dvh-57px-16px)]" aria-label="Assistant">
          {/* top bar */}
          <header className="flex items-center justify-between gap-3 py-3 md:pt-5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}><Sparkles className="w-5 h-5" aria-hidden="true" /></span>
              <div className="min-w-0">
                <h1 className="text-[22px] font-bold k-display leading-none">Assistant</h1>
                <p className="text-xs k-muted mt-1 truncate" aria-live="polite">{STATUS_TEXT[a.status]}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => { a.setSpeak(!a.speak); if (a.speak) a.stopSpeaking(); }} aria-pressed={a.speak} aria-label={a.speak ? 'Voice answers on' : 'Voice answers off'} className={`k-btn w-11 h-11 ${a.speak ? 'k-btn-lime' : 'k-btn-ghost'}`}>{a.speak ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}</button>
              <button type="button" onClick={() => setSheet('reports')} aria-label="Saved reports" className="k-btn k-btn-ghost w-11 h-11 lg:hidden"><FileText className="w-5 h-5" /></button>
              <button type="button" onClick={() => setSheet('settings')} aria-label="Language, voice and Telegram" className="k-btn k-btn-ghost w-11 h-11 lg:hidden"><SlidersHorizontal className="w-5 h-5" /></button>
            </div>
          </header>

          {/* stage */}
          <div className="flex-1 flex flex-col">
            {empty ? (
              a.listening ? <div className="my-auto py-4">{listeningPanel}</div> : (
                <div className="flex-1 flex flex-col justify-center py-2 sm:py-4 ag-in">
                  <div className="text-center">
                    <h2 className="text-[28px] sm:text-5xl leading-[1.05] font-bold k-display tracking-tight">Ask about<br />your shop.</h2>
                    <p className="hidden sm:block text-sm k-muted mt-3 max-w-xs mx-auto">I read your orders, stock and returns. I never change anything.</p>
                  </div>
                  <div className="grid place-items-center mt-4 sm:mt-6" style={{ height: 112 }}><Orb status={a.status} size={92} onClick={a.mic} label="Tap and speak" /></div>
                  <p className="text-center text-[13px] font-semibold -mt-0.5">Tap and speak</p>
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mt-4 sm:mt-6">
                    <button type="button" onClick={a.makeReport} disabled={a.makingReport} className="ag-tile col-span-3 rounded-3xl px-4 py-3 flex items-center gap-3.5 text-left" style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}>
                      <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: 'rgba(4,33,15,.12)' }}><FileText className="w-5 h-5" aria-hidden="true" /></span>
                      <span className="min-w-0"><span className="block text-lg font-bold leading-tight">Today's report</span><span className="block text-sm opacity-80">Orders, returns, stock, problems</span></span>
                    </button>
                    {TILES.map((t) => (
                      <button key={t.label} type="button" onClick={() => a.ask(t.q)} disabled={a.busy} className="ag-tile k-card rounded-3xl p-3 sm:p-4 text-left min-h-[84px] sm:min-h-[112px] flex flex-col justify-between">
                        <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl grid place-items-center k-card2"><t.icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" aria-hidden="true" /></span>
                        <span><span className="block font-bold text-[13.5px] sm:text-[15px] leading-tight">{t.label}</span><span className="hidden sm:block text-xs k-muted mt-0.5">{t.hint}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="flex-1 space-y-4 pt-2 pb-4" aria-live="polite">
                {a.turns.map((t, i) => t.role === 'user' ? (
                  <div key={i} className="flex justify-end ag-in"><div className="rounded-3xl rounded-br-md px-4 py-2.5 text-[15px] font-medium max-w-[86%] break-words" style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}>{t.content}</div></div>
                ) : (
                  <div key={i} className="ag-in">
                    <div className="k-card rounded-3xl rounded-bl-md p-4 sm:p-5 max-w-[98%]"><Rich text={t.content} /></div>
                    <button type="button" onClick={() => copy(i, t.content)} className="text-xs k-muted mt-1 ml-2 min-h-[40px] flex items-center gap-1.5" aria-label="Copy this answer to send to your developer">{copied === i ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy for my developer</>}</button>
                  </div>
                ))}
                {(a.busy || a.makingReport) && <Thinking label={a.makingReport ? 'Writing your report' : 'Checking your data'} />}
                {a.listening && listeningPanel}
                <div ref={endRef} className="scroll-mb-44" />
              </div>
            )}
          </div>

          {/* notes and the ask bar, stuck above the phone menu */}
          {!a.listening && (
            <div className="sticky z-20 max-md:bottom-[-20px] md:bottom-2 pt-2 pb-2" style={{ background: 'var(--bg)' }}>
              {a.err && <p role="alert" className="text-sm font-medium k-bad mb-2 px-1">{a.err}</p>}
              {a.voiceNote && <p role="status" className="text-xs k-muted mb-2 px-1">{a.voiceNote}</p>}
              <form onSubmit={(e) => { e.preventDefault(); void a.ask(a.text); }} className="flex items-center gap-2">
                <input value={a.text} onChange={(e) => a.setText(e.target.value)} placeholder="Ask about your shop" aria-label="Your question" maxLength={600} enterKeyHint="send" className="k-field !rounded-full !h-[52px] !pl-5 flex-1 min-w-0" />
                {!empty && <button type="button" onClick={a.mic} aria-label="Speak your question" className="k-btn w-[52px] h-[52px] shrink-0 rounded-full" style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}><Mic className="w-5 h-5" /></button>}
                <button type="submit" disabled={a.busy || !a.text.trim()} aria-label="Send" className="k-btn w-[52px] h-[52px] shrink-0 rounded-full" style={a.text.trim() ? { background: 'var(--ink)', color: 'var(--bg)' } : { background: 'var(--card2)', color: 'var(--muted)' }}><ArrowUp className="w-5 h-5" /></button>
              </form>
            </div>
          )}
        </section>

        {/* computer: settings and saved reports stay in view on the right */}
        <aside className="hidden lg:flex flex-col gap-4 py-3 self-start sticky top-2" aria-label="Settings and saved reports">
          <div className="k-card rounded-3xl p-5"><h2 className="font-bold text-lg mb-4">Voice and Telegram</h2><SettingsPanel a={a} /></div>
          <div className="k-card rounded-3xl p-5"><h2 className="font-bold text-lg mb-3">Saved reports</h2><ReportsPanel reports={a.reports} msg={a.reportsMsg} /></div>
        </aside>
      </div>

      {sheet === 'settings' && <Sheet title="Language and voice" onClose={() => setSheet(null)}><SettingsPanel a={a} /></Sheet>}
      {sheet === 'reports' && <Sheet title="Saved reports" onClose={() => setSheet(null)}><ReportsPanel reports={a.reports} msg={a.reportsMsg} /></Sheet>}
    </div>
  );
};
