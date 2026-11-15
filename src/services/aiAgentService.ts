import { supabase } from './supabase';

const db = supabase as any;

/** The name the function was deployed under in Supabase (it has a trailing dash) */
const FUNCTION_NAME = 'ai-agent-';

export type AgentLang = 'en' | 'ml' | 'hi';
export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface SavedReport { id: string; report_date: string; text: string; created_at: string }

/** Plain sentence for the usual problems, so the owner knows what to do next */
export const agentError = (e: any): string => {
  const m = String(e?.message || e || '');
  if (/^The AI (service|model)|Could not reach the AI/i.test(m)) return /\b404\b/.test(m) ? `${m}. NVIDIA does not know this model name. Check the AI_MODEL secret (the name after build.nvidia.com/ on the model page).` : m;
  if (/not set|AI_API_KEY/i.test(m)) return 'The AI key is not set yet. Add AI_API_KEY in Supabase > Edge Functions > Secrets.';
  if (/Failed to send a request|FunctionsFetchError|404|not found|NetworkError|Failed to fetch/i.test(m)) return 'Could not get an answer. The assistant may be too slow or not deployed. In Supabase open Functions > ai-agent- > Logs to see why.';
  if (/Sign in first|401/i.test(m)) return 'Your sign-in ended. Sign in again.';
  return m || 'Something went wrong. Try again.';
};

const call = async (body: Record<string, unknown>): Promise<any> => {
  const { data, error } = await db.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    // the function sends its own sentence inside the error response
    try { const j = await error.context?.json?.(); if (j?.error) throw new Error(j.error); } catch (inner) { if (inner instanceof Error && inner.message !== 'Unexpected end of JSON input') throw inner; }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

export const AiAgentService = {
  async ask(question: string, history: ChatTurn[], language: AgentLang): Promise<string> {
    const d = await call({ mode: 'chat', question, history, language });
    if (d.ms) console.info('[assistant] data ms', d.ms.data, 'AI ms', d.ms.ai);
    return String(d.answer || '');
  },
  async makeReport(language: AgentLang): Promise<{ text: string; telegram: boolean; telegramError?: string; saved: boolean }> {
    const d = await call({ mode: 'report', language });
    return { text: String(d.answer || ''), telegram: !!d.telegram, telegramError: d.telegramError, saved: d.saved !== false };
  },
  /** Is Telegram connected on the server? (only yes or no, never the token) */
  async status(): Promise<{ telegram: boolean; model: string | null }> {
    const d = await call({ mode: 'status' });
    return { telegram: !!d.telegram, model: d.model ?? null };
  },
  async telegramTest(): Promise<void> { await call({ mode: 'telegram_test' }); },
  /** Natural voice from NVIDIA (English and Hindi). Returns a WAV as base64. */
  async speak(text: string, language: AgentLang): Promise<{ audio: string; voice: string }> {
    const d = await call({ mode: 'speak', text, language });
    return { audio: String(d.audio || ''), voice: String(d.voice || '') };
  },
  async reports(): Promise<SavedReport[]> {
    const { data, error } = await db.from('ai_reports').select('id, report_date, text, created_at').order('report_date', { ascending: false }).limit(14);
    if (error) throw error;
    return (data || []) as SavedReport[];
  },
};
