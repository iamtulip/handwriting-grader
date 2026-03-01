// apps/api/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// ใช้ Service Role Key เพื่อข้าม RLS ฝั่ง Backend
export const getServiceSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("Missing Supabase Env Variables in API");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};