import { useCallback, useEffect, useRef, useState } from 'react';
import { AiAgentService, agentError, type AgentLang, type ChatTurn, type SavedReport } from '../../services/aiAgentService';

export const LANGS: { id: AgentLang; label: string; short: string; speech: string }[] = [
  { id: 'en', label: 'English', short: 'EN', speech: 'en-IN' },
  { id: 'ml', label: 'മലയാളം', short: 'മല', speech: 'ml-IN' },
  { id: 'hi', label: 'हिन्दी', short: 'हि', speech: 'hi-IN' },
];

export type Status = 'idle' | 'listening' | 'thinking' | 'speaking';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph)\b/i;
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const read = (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

/** Everything the assistant page does: asking, listening, speaking, reports, Telegram. The page itself only draws it. */
export const useAssistant = () => {
  const [lang, setLang] = useState<AgentLang>(() => (['en', 'ml', 'hi'].includes(read('zaylow_agent_lang')) ? (read('zaylow_agent_lang') as AgentLang) : 'en'));
  const [speak, setSpeak] = useState(() => read('zaylow_agent_speak') === '1');
  const [engine, setEngine] = useState<'browser' | 'nvidia'>(() => (read('zaylow_agent_engine') === 'browser' ? 'browser' : 'nvidia'));
  const [voiceName, setVoiceName] = useState(() => read('zaylow_agent_voice'));
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [err, setErr] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [reportsMsg, setReportsMsg] = useState('');
  const [makingReport, setMakingReport] = useState(false);
  const [tg, setTg] = useState<boolean | null>(null);
  const [tgMsg, setTgMsg] = useState('');
  const [tgBusy, setTgBusy] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakToken = useRef(0);
  const stopWait = useRef<(() => void) | null>(null);
  const recRef = useRef<any>(null);
  const cancelled = useRef(false);
  const askRef = useRef<(q: string) => Promise<void>>(async () => {});

  const speechLang = LANGS.find((l) => l.id === lang)!.speech;
  const status: Status = listening ? 'listening' : busy || makingReport ? 'thinking' : speaking ? 'speaking' : 'idle';

  useEffect(() => { store('zaylow_agent_lang', lang); }, [lang]);
  useEffect(() => { store('zaylow_agent_speak', speak ? '1' : '0'); }, [speak]);
  useEffect(() => { store('zaylow_agent_engine', engine); }, [engine]);
  useEffect(() => { store('zaylow_agent_voice', voiceName); }, [voiceName]);

  // phone / browser voices
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);
  const langVoices = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(speechLang.slice(0, 2).toLowerCase()) && !NOVELTY.test(v.name));
  // the nicest-sounding voice first: names with natural / enhanced / premium / google are usually better
  const best = [...langVoices].sort((a, b) => Number(/natural|neural|enhanced|premium|google/i.test(b.name)) - Number(/natural|neural|enhanced|premium|google/i.test(a.name)))[0];

  const loadReports = useCallback(() => {
    AiAgentService.reports().then((r) => { setReports(r); setReportsMsg(''); }).catch((e) => {
      setReportsMsg(/does not exist|schema cache|42P01|PGRST205/i.test(String(e?.message)) ? 'Saved reports are not set up yet. Run the AI agent SQL in Supabase.' : '');
    });
  }, []);
  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => { AiAgentService.status().then((s) => setTg(s.telegram)).catch(() => setTg(null)); }, []);
  useEffect(() => () => { cancelled.current = true; recRef.current?.abort?.(); speakToken.current++; window.speechSynthesis?.cancel(); audioRef.current?.pause(); }, []);

  /** iPhone only: a tap must "unlock" sound that starts later. Android and desktop do not need it, and playing sound
   *  while the microphone starts can block the microphone, so nothing is played there. */
  const unlockAudio = () => {
    if (!IOS) return;
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const a = audioRef.current;
      a.src = SILENT;
      void a.play().then(() => a.pause()).catch(() => undefined);
    } catch { /* no audio on this device */ }
  };
  /** One empty, silent sentence from inside a tap: phones then allow the phone voice to speak later */
  const speechUnlocked = useRef(false);
  const unlockSpeech = () => {
    if (speechUnlocked.current || !window.speechSynthesis) return;
    speechUnlocked.current = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* no voice on this device */ }
  };
  const stopSpeaking = useCallback(() => {
    speakToken.current++;
    window.speechSynthesis?.cancel();
    if (audioRef.current) audioRef.current.pause();
    stopWait.current?.(); stopWait.current = null; // let a waiting sentence loop end
    setSpeaking(false);
  }, []);

  const browserSay = (t: string) => {
    const synth = window.speechSynthesis;
    if (!synth) { setVoiceNote('This device has no phone voice. Use the natural voice in settings.'); return; }
    const token = speakToken.current;
    synth.cancel();
    // phones stop long sentences and drop a sentence spoken right after cancel(): short pieces, a tiny wait
    const parts = (t.replace(/[*_#`]/g, '').match(/[^.!?।]+[.!?।]*\s*/g) || [t]).reduce<string[]>((acc, sn) => { const last = acc[acc.length - 1]; if (last && (last + sn).length < 170) acc[acc.length - 1] = last + sn; else acc.push(sn); return acc; }, []).slice(0, 14);
    setTimeout(() => {
      if (token !== speakToken.current) return;
      const v = langVoices.find((x) => x.name === voiceName) || best;
      parts.forEach((part, i) => {
        const u = new SpeechSynthesisUtterance(part.trim());
        u.lang = speechLang; u.rate = 0.95;
        if (v) u.voice = v;
        if (i === 0) u.onstart = () => setSpeaking(true);
        if (i === parts.length - 1) u.onend = () => setSpeaking(false);
        u.onerror = (e: any) => { setSpeaking(false); if (e?.error === 'not-allowed') setVoiceNote('Your phone blocked the phone voice. Tap the speaker button, or choose Natural voice in settings.'); else if (e?.error && e.error !== 'canceled' && e.error !== 'interrupted') setVoiceNote(`The phone voice stopped (${e.error}). Choose Natural voice in settings.`); };
        synth.speak(u);
      });
    }, 80);
  };
  // the natural voice reads only the AI's own words, never the returned-customer list (names and phones)
  const spokenPart = (t: string) => t.split(/\n\s*Returned customers/i)[0].replace(/[*_#`•]/g, '').replace(/\s*\n+\s*/g, '. ').trim();
  // short first piece so the voice starts quickly, then longer pieces (no regex look-behind: older iPhones cannot read it)
  const chunks = (t: string) => {
    const sentences = t.match(/[^.!?।]+[.!?।]*\s*/g) || [t];
    const out: string[] = []; let cur = '';
    sentences.forEach((sn) => {
      const limit = out.length === 0 ? 110 : 300;
      if (cur && (cur + sn).length > limit) { out.push(cur.trim()); cur = sn; } else cur += sn;
    });
    if (cur.trim()) out.push(cur.trim());
    return out.slice(0, 6);
  };
  const say = async (full: string) => {
    if (!speak) return;
    stopSpeaking();
    const token = speakToken.current;
    const spoken = spokenPart(full);
    if (engine !== 'nvidia' || lang === 'ml') { browserSay(spoken); return; }
    setVoiceNote('');
    try {
      const parts = chunks(spoken);
      let next = AiAgentService.speak(parts[0], lang);
      next.catch(() => undefined); // a failed look-ahead must not be reported as a crash; the loop below handles it
      for (let i = 0; i < parts.length; i++) {
        const cur = await next;
        if (token !== speakToken.current) return;
        if (i + 1 < parts.length) { next = AiAgentService.speak(parts[i + 1], lang); next.catch(() => undefined); } // fetch the next sentence while this one plays
        const a = audioRef.current || (audioRef.current = new Audio());
        a.src = `data:audio/wav;base64,${cur.audio}`;
        setSpeaking(true);
        await new Promise<void>((res, rej) => { stopWait.current = res; a.onended = () => res(); a.onerror = () => rej(new Error('audio')); a.play().catch(rej); });
        if (token !== speakToken.current) return;
      }
      setSpeaking(false);
    } catch (e) {
      if (token !== speakToken.current) return;
      setSpeaking(false);
      setVoiceNote(`Natural voice did not work (${agentError(e).slice(0, 120)}). Using the phone voice.`);
      browserSay(spoken);
    }
  };

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    stopSpeaking(); unlockAudio(); unlockSpeech();
    setErr(''); setText(''); setBusy(true);
    const history = turns;
    setTurns((t) => [...t, { role: 'user', content: question }]);
    try {
      const a = await AiAgentService.ask(question, history, lang);
      setTurns((t) => [...t, { role: 'assistant', content: a }]);
      void say(a);
    } catch (e) { setErr(agentError(e)); } finally { setBusy(false); }
  };
  askRef.current = ask;

  /** Start listening, or stop and send what was heard */
  const mic = () => {
    if (listening) { recRef.current?.stop(); return; }
    if (!SR) { setErr('This browser cannot listen. Use Chrome or Safari, or type your question.'); return; }
    stopSpeaking(); unlockAudio(); unlockSpeech();
    try { if (recRef.current) { recRef.current.__dead = true; recRef.current.abort?.(); } } catch { /* old listener already gone */ }
    const r = new SR();
    r.lang = speechLang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let said = ''; let sent = false;
    cancelled.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };
    // the words appear while you speak; when you stop, the question is sent by itself
    r.onresult = (ev: any) => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      said = t.trim();
      setText(said);
    };
    r.onerror = (ev: any) => {
      if (r.__dead) return;
      clearTimers(); setListening(false);
      const code = String(ev?.error || '');
      if (code === 'not-allowed' || code === 'service-not-allowed') setErr('Microphone is blocked. Allow the microphone for this site in the browser settings, then tap again.');
      else if (code === 'audio-capture') setErr('The microphone is busy or missing. Close other apps that use it, then tap again.');
      else if (code === 'network') setErr('Listening needs the internet. Check your connection and tap again.');
      else if (code === 'no-speech') setErr('I did not hear anything. Tap the green button and speak.');
      else if (code !== 'aborted') setErr(`Could not hear you (${code || 'unknown'}). Tap and try again.`);
    };
    r.onend = () => {
      if (r.__dead) return; // an old listener ending late must not send its words or switch the new one off
      clearTimers(); setListening(false);
      if (!sent && !cancelled.current && said) { sent = true; void askRef.current(said); }
      else if (cancelled.current) setText('');
      else if (!said) setErr((e) => e || 'I did not hear anything. Tap the green button and speak.');
    };
    // some phones leave the microphone "listening" forever (nothing is heard, no end event): stop it after 12 seconds of silence
    timers.push(setTimeout(() => { if (!said && recRef.current === r) { try { r.abort(); } catch { /* already stopped */ } setListening(false); setErr('I did not hear anything. Tap the green button and speak.'); } }, 12000));
    recRef.current = r; setErr(''); setText(''); setListening(true);
    try { r.start(); } catch { clearTimers(); setListening(false); setErr('The microphone could not start. Tap again.'); }
  };
  const cancelListening = () => { cancelled.current = true; recRef.current?.abort?.(); setListening(false); setText(''); };

  const makeReport = async () => {
    stopSpeaking(); unlockAudio(); unlockSpeech();
    setMakingReport(true); setErr('');
    try {
      const r = await AiAgentService.makeReport(lang);
      setTurns((t) => [...t, { role: 'user', content: "Today's report" }, { role: 'assistant', content: r.text }]);
      void say(r.text); loadReports();
      if (r.telegram) setTg(true); else if (r.telegramError) setTgMsg(r.telegramError);
    } catch (e) { setErr(agentError(e)); } finally { setMakingReport(false); }
  };

  const testTelegram = async () => {
    setTgBusy(true); setTgMsg('');
    try { await AiAgentService.telegramTest(); setTgMsg('Test message sent. Check Telegram.'); setTg(true); }
    catch (e) { setTgMsg(agentError(e)); } finally { setTgBusy(false); }
  };

  return {
    lang, setLang, speak, setSpeak, engine, setEngine, voiceName, setVoiceName, langVoices, best,
    turns, text, setText, busy, makingReport, listening, speaking, status, err, voiceNote,
    reports, reportsMsg, tg, tgMsg, tgBusy,
    ask, mic, cancelListening, makeReport, testTelegram, stopSpeaking, speechLang,
  };
};
