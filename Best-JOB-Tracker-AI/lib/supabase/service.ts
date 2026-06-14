import { createClient } from '@supabase/supabase-js';

// Service role client — bypasses RLS, server-side only, NEVER expose to client
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false } }
  );
}
