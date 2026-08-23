import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase'; // We'll assume a generated type file

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

console.log(`🔌 Supabase Client Initialized. Configured URL: ${supabaseUrl}`);
