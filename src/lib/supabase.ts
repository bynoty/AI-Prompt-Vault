import { createClient } from '@supabase/supabase-js';

// Retrieve environment variables with secure fallbacks for the AI Studio preview environment
const metaEnv = (import.meta as any).env || {};
const rawClientUrl = metaEnv.VITE_SUPABASE_URL as string;
const supabaseUrl = (rawClientUrl && rawClientUrl.startsWith('http')) ? rawClientUrl : 'https://ijpiebqfhsgalypfesti.supabase.co';

const rawClientKey = metaEnv.VITE_SUPABASE_ANON_KEY as string;
const supabaseAnonKey = (rawClientKey && rawClientKey.trim().length > 10) ? rawClientKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqcGllYnFmaHNnYWx5cGZlc3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NjA4NjcsImV4cCI6MjEwMDAzNjg2N30.hInRP9QQSD_FI0R0-aIUwDARHrG8vHfLYshEGXDFOno';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Client-side cloud storage connection may fail.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});
