import React, { useEffect, useState } from 'react';
import { Download, Share, MoreVertical, X, Smartphone } from 'lucide-react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** "Install the app" for iPhone/iPad and Android. Android shows the real install prompt; iPhone needs Add to Home Screen. */
export const InstallApp: React.FC = () => {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [done, setDone] = useState(false);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const installed = () => { setDone(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', installed); };
  }, []);

  if (isStandalone()) return null;

  const click = async () => {
    if (evt) { await evt.prompt(); const r = await evt.userChoice; if (r.outcome === 'accepted') setDone(true); setEvt(null); }
    else setHelp(true);
  };

  return (
    <>
      <button type="button" onClick={() => void click()} className="k-btn k-btn-ghost w-full py-3 text-sm">
        {done ? <Smartphone className="w-4 h-4" /> : <Download className="w-4 h-4" />} {done ? 'App installed' : 'Install the app on your phone'}
      </button>
      {help && (
        <div role="dialog" aria-modal="true" aria-label="Install the app" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setHelp(false)}>
          <div className="k-card w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg k-display">Install ZAYLOW</h2>
              <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="k-btn k-btn-ghost w-9 h-9"><X className="w-4 h-4" /></button>
            </div>
            {ios ? (
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3 items-start"><span className="k-pill-n">1</span><span>Open this page in <b>Safari</b>.</span></li>
                <li className="flex gap-3 items-start"><span className="k-pill-n">2</span><span>Tap the <b>Share</b> button <Share className="w-4 h-4 inline -mt-1" /> at the bottom.</span></li>
                <li className="flex gap-3 items-start"><span className="k-pill-n">3</span><span>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
              </ol>
            ) : (
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3 items-start"><span className="k-pill-n">1</span><span>Open this page in <b>Chrome</b>.</span></li>
                <li className="flex gap-3 items-start"><span className="k-pill-n">2</span><span>Tap the menu <MoreVertical className="w-4 h-4 inline -mt-1" /> at the top right.</span></li>
                <li className="flex gap-3 items-start"><span className="k-pill-n">3</span><span>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</span></li>
              </ol>
            )}
            <p className="text-xs k-muted">The ZAYLOW icon then opens like a normal app, full screen.</p>
          </div>
        </div>
      )}
      <style>{`.k-pill-n{width:1.5rem;height:1.5rem;border-radius:999px;background:var(--lime);color:var(--on-lime);font-weight:700;font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}`}</style>
    </>
  );
};
