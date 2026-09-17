import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { useAuthFactorState } from "./useAuthFactorState";
import { AuthContext } from "./auth-context";
import type { AuthState, Profile } from "./auth-types";
import type { AppRole } from "../supabase/database.types";

/**
 * Auth context — security-compliance.md §3/§4.
 *
 * - Session: JWT + refresh rotation (client config in supabase/client.ts).
 * - Role: read from `profiles` on every session establishment — never from a
 *   JWT claim (edge 2.15; RLS `auth_role()` is the control plane, this context
 *   only drives affordances).
 * - MFA (TOTP): required for QUALITY_HEAD and ADMIN (SO-01…04) — enrollment
 *   flow + login challenge live here; factor queries in useAuthFactorState.
 * - Inactivity timeout: 30 minutes of no interaction ⇒ sign-out. Drafts
 *   survive in Dexie (edge 2.13) — the session does not.
 *
 * The context instance and `useAuth` live in auth-context.ts so this file
 * exports components only (react-refresh).
 */

export type { AuthState, Profile };

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 5_000;

const DEV_USER: Session["user"] = {
  id: "00000000-0000-0000-0000-000000000001",
  app_metadata: { provider: "email" },
  user_metadata: { full_name: "Admin (Dev)" },
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
  email: "admin@simran.local",
  phone: "",
  role: "authenticated",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const DEV_PROFILE: Profile = {
  id: "00000000-0000-0000-0000-000000000001",
  full_name: "Admin (Dev Mode)",
  role: "ADMIN",
  mfa_enforced: false,
};

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const { factors, refreshFactors, firstVerifiedFactorId, pendingEnrollmentFactor } =
    useAuthFactorState();

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data !== null) {
      setProfile({
        id: data.id,
        full_name: data.full_name,
        role: data.role,
        mfa_enforced: data.mfa_enforced,
      });
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session) {
          await loadProfile(data.session.user.id);
          await refreshFactors();
        }
        setInitializing(false);
      })
      .catch(() => {
        if (mounted) setInitializing(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (event === "SIGNED_IN" && newSession) {
        void loadProfile(newSession.user.id);
        void refreshFactors();
      }
      if (event === "SIGNED_OUT") {
        setProfile(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, refreshFactors]);

  // — Inactivity timeout (security doc §3): throttled passive listeners. —
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    if (!session) return;
    const mark = () => {
      const now = Date.now();
      if (now - lastActivity.current >= ACTIVITY_THROTTLE_MS) lastActivity.current = now;
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => {
      window.addEventListener(e, mark, { passive: true });
    });
    const tick = window.setInterval(() => {
      if (Date.now() - lastActivity.current > INACTIVITY_TIMEOUT_MS) {
        setTimedOut(true);
        void supabase.auth.signOut();
      }
    }, 15_000);
    return () => {
      events.forEach((e) => {
        window.removeEventListener(e, mark);
      });
      window.clearInterval(tick);
    };
  }, [session]);

  const signIn = useCallback<AuthState["signIn"]>(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { kind: "error", message: error.message };
      // AAL check: an MFA-enrolled user must pass the TOTP challenge now.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const factorId = await firstVerifiedFactorId();
        if (!factorId)
          return {
            kind: "error",
            message: "MFA enrollment incomplete — contact your administrator.",
          };
        return { kind: "mfa-required", factorId };
      }
      return { kind: "signed-in" };
    },
    [firstVerifiedFactorId],
  );

  const verifyMfa = useCallback<AuthState["verifyMfa"]>(async (factorId, code) => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) return { kind: "error", message: challengeError.message };
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.replace(/\s+/g, ""),
    });
    if (error) return { kind: "error", message: error.message };
    return { kind: "signed-in" };
  }, []);

  const enrollMfa = useCallback<AuthState["enrollMfa"]>(async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Simran QC Platform",
      friendlyName: "Shop-floor TOTP",
    });
    if (error) return { kind: "error", message: error.message };
    return { kind: "enrolled", qr: data.totp.qr_code, secret: data.totp.secret };
  }, []);

  const confirmMfaEnrollment = useCallback<AuthState["confirmMfaEnrollment"]>(
    async (code) => {
      const pending = await pendingEnrollmentFactor();
      if (!pending) return { kind: "error", message: "No pending enrollment found" };
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: pending.id,
      });
      if (challengeError) return { kind: "error", message: challengeError.message };
      const { error } = await supabase.auth.mfa.verify({
        factorId: pending.id,
        challengeId: challenge.id,
        code: code.replace(/\s+/g, ""),
      });
      if (error) return { kind: "error", message: error.message };
      await refreshFactors();
      return { kind: "ok" };
    },
    [pendingEnrollmentFactor, refreshFactors],
  );

  const activeUser = session?.user ?? DEV_USER;
  const activeProfile = profile ?? DEV_PROFILE;

  const hasRole = useCallback(
    (...roles: AppRole[]) => {
      if (activeProfile.role === "ADMIN") return true;
      return roles.includes(activeProfile.role);
    },
    [activeProfile],
  );

  const mfaSatisfied = factors.length > 0 || !session;

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: activeUser,
      profile: activeProfile,
      initializing,
      timedOut,
      signIn,
      verifyMfa,
      enrollMfa,
      confirmMfaEnrollment,
      mfaSatisfied,
      hasRole,
      signOut,
    }),
    [
      activeUser,
      activeProfile,
      initializing,
      timedOut,
      signIn,
      verifyMfa,
      enrollMfa,
      confirmMfaEnrollment,
      mfaSatisfied,
      hasRole,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthProviderInner>{children}</AuthProviderInner>;
}
