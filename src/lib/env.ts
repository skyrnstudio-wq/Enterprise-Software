/**
 * Central environment access. Everything reads config from here so a missing
 * variable is one loud startup error, not a scattered set of undefined strings.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY", import.meta.env.VITE_SUPABASE_ANON_KEY),
  appEnv: import.meta.env.VITE_APP_ENV ?? "development",
} as const;
