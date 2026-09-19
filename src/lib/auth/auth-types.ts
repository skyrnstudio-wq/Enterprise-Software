import type { Session } from "@supabase/supabase-js";
import type { AppRole } from "../supabase/database.types";

/**
 * Component-free auth types — shared between AuthProvider.tsx and router
 * context without importing React component code into non-component files.
 */

export interface Profile {
  id: string;
  full_name: string;
  role: AppRole;
  mfa_enforced: boolean;
}

export interface AuthState {
  user: Session["user"] | null;
  profile: Profile | null;
  /** Session/profile load in flight — routers wait on this before guarding. */
  initializing: boolean;
  /** True after the inactivity timer (not the user) ended the session. */
  timedOut: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<
    | { kind: "signed-in" }
    | { kind: "mfa-required"; factorId: string }
    | { kind: "error"; message: string }
  >;
  /**
   * Create an account. `full_name` rides in user metadata so the
   * `on_auth_user_created` trigger (migration 006) can fill the profile row.
   * - `signed-in`     → confirmation disabled; the session is live.
   * - `confirm-email` → the project requires email confirmation first.
   */
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<
    { kind: "signed-in" } | { kind: "confirm-email" } | { kind: "error"; message: string }
  >;
  verifyMfa: (
    factorId: string,
    code: string,
  ) => Promise<{ kind: "signed-in" } | { kind: "error"; message: string }>;
  enrollMfa: () => Promise<
    { kind: "enrolled"; qr: string; secret: string } | { kind: "error"; message: string }
  >;
  /** Second step of enrollment: confirm a code from the authenticator app. */
  confirmMfaEnrollment: (
    code: string,
  ) => Promise<{ kind: "ok" } | { kind: "error"; message: string }>;
  /** QH/Admin affordance gate (edge 2.14): a verified factor exists. */
  mfaSatisfied: boolean;
  hasRole: (...roles: AppRole[]) => boolean;
  signOut: () => Promise<void>;
}
