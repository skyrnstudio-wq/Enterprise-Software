import { createClient } from "@supabase/supabase-js";
import { env } from "../env";
import type { Database } from "./database.types";

/**
 * Supabase client — technology-stack.md §3.7.
 * Types are generated from the live schema (`npm run db:types`) so that a
 * schema change is a compile error, not a runtime 500.
 *
 * Environment validation lives in src/lib/env.ts — F-05 closed: this module no
 * longer re-checks VITE_SUPABASE_* (a missing variable is env.ts's one loud
 * startup error, not a second divergent message).
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
