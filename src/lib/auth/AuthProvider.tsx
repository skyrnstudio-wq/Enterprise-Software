import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { env } from "../env";
import { AuthContext } from "./auth-context";
import type { AuthState, Profile } from "./auth-types";
import type { AppRole } from "../supabase/database.types";

/**
 * Auth context — standard Supabase auth flow with email/password.
 * MFA/OTP requirement has been removed per current operational specifications.
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
  const [initializing, setInitializing] = useState(env.devBypassAuth ? false : true);
  const [timedOut, setTimedOut] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data !== null) {
      setProfile({
        id: data.id,
        full_name: data.full_name,
        role: data.role,
        mfa_enforced: false,
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
      }
      if (event === "SIGNED_OUT") {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // — Inactivity timeout: throttled passive listeners. —
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
      return { kind: "signed-in" };
    },
    [],
  );

  const signUp = useCallback<AuthState["signUp"]>(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { kind: "error", message: error.message };
    return data.session ? { kind: "signed-in" } : { kind: "confirm-email" };
  }, []);

  const verifyMfa = useCallback<AuthState["verifyMfa"]>(
    () => Promise.resolve({ kind: "signed-in" }),
    [],
  );
  const enrollMfa = useCallback<AuthState["enrollMfa"]>(
    () => Promise.resolve({ kind: "error", message: "MFA disabled" }),
    [],
  );
  const confirmMfaEnrollment = useCallback<AuthState["confirmMfaEnrollment"]>(
    () => Promise.resolve({ kind: "ok" }),
    [],
  );

  const activeUser = session?.user ?? (env.devBypassAuth ? DEV_USER : null);
  const activeProfile = profile ?? (env.devBypassAuth ? DEV_PROFILE : null);
  const safeProfile = activeProfile ?? DEV_PROFILE;

  const hasRole = useCallback(
    (...roles: AppRole[]) => {
      if (safeProfile.role === "ADMIN") return true;
      return roles.includes(safeProfile.role);
    },
    [safeProfile],
  );

  const mfaSatisfied = true;

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
      signUp,
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
      signUp,
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
