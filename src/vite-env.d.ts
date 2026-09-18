/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_ENV?: "development" | "staging" | "production";
  /** Dev-builds-only login bypass (see env.ts) — unset in any deployed build. */
  readonly VITE_DEV_BYPASS_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
