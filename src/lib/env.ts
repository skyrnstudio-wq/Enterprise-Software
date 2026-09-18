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

/**
 * Dev-only auth bypass (ui-ux-plan demo convenience). Double-gated: the flag
 * must be present AND the build must be a dev build — it can never reach a
 * staging/production bundle, whatever a developer leaves in their .env.local.
 */
function devBypassEnabled(): boolean {
  const flag = import.meta.env.VITE_DEV_BYPASS_AUTH;
  return import.meta.env.DEV && typeof flag === "string" && flag !== "" && flag !== "false";
}

export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY", import.meta.env.VITE_SUPABASE_ANON_KEY),
  appEnv: import.meta.env.VITE_APP_ENV ?? "development",
  devBypassAuth: devBypassEnabled(),
} as const;
