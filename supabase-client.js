// STORYVERSE cloud settings. Replace both values with your Supabase Project URL
// and Publishable key. Never put a Supabase Secret key in browser code.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://dtkcpvcparxlbnghlunr.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zXM_mo4SDRhr4s3Ptot5hQ_ZUi1iypX';

export const supabaseConfigured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('PASTE_YOUR') &&
  SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR');

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
