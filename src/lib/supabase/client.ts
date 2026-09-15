import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Supabase client — technology-stack.md §3.7.
 * Types are generated from the live schema (`supabase gen types`) so that a
 * schema change is a compile error, not a runtime 500.
 *
 * Placeholder types for Phase 0; regenerate once the first migration lands.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Startup fail-fast: one loud error beats a scattered set of undefined strings.
  throw new Error(
    "Supabase environment variables are not set. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
