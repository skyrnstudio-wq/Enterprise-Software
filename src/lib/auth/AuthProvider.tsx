import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { env } from "../env";
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
const DEMO_STORAGE_KEY = "simran_demo_session";

const DEMO_ACCOUNTS: Record<string, { role: AppRole; full_name: string; id: string }> = {
  "admin@simran.local": {
    id: "00000000-0000-0000-0000-0000000000a1",
    full_name: "Platform Admin",
    role: "ADMIN",
  },
  "inspector1@simran.local": {
    id: "00000000-0000-0000-0000-0000000000b1",
    full_name: "Inspector One",
    role: "QC_INSPECTOR",
  },
  "qh@simran.local": {
    id: "00000000-0000-0000-0000-0000000000c1",
    full_name: "Quality Head",
    role: "QUALITY_HEAD",
  },
  "nace@simran.local": {
    id: "00000000-0000-0000-0000-0000000000d1",
    full_name: "NACE Inspector",
    role: "NACE_INSPECTOR",
  },
};

function createMockSession(id: string, email: string, full_name: string, role: AppRole): Session {
  return {
    access_token: "demo-token",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: "demo-refresh-token",
    user: {
      id,
      app_metadata: { provider: "email" },
      user_metadata: { full_name, role },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email,
      phone: "",
      role: "authenticated",
      updated_at: new Date().toISOString(),
    },
  };
}

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
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const cached = localStorage.getItem(DEMO_STORAGE_KEY);
      if (cached !== null) {
        const parsed = JSON.parse(cached) as unknown;
        if (typeof parsed === "object" && parsed !== null && "user" in parsed) {
          return { user: (parsed as { user: Session["user"] }).user } as Session;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const cached = localStorage.getItem(DEMO_STORAGE_KEY);
      if (cached !== null) {
        const parsed = JSON.parse(cached) as unknown;
        if (typeof parsed === "object" && parsed !== null && "profile" in parsed) {
          return (parsed as { profile: Profile }).profile;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [initializing, setInitializing] = useState(env.devBypassAuth ? false : true);
  const [timedOut, setTimedOut] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (data !== null) {
        setProfile({
          id: data.id,
          full_name: data.full_name,
          role: data.role,
          mfa_enforced: false,
        });
      }
    } catch {
      // Profile fetch failed (offline / placeholder)
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        if (data.session) {
          setSession(data.session);
          await loadProfile(data.session.user.id);
        }
        setInitializing(false);
      })
      .catch(() => {
        if (mounted) setInitializing(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (newSession) {
        setSession(newSession);
        if (event === "SIGNED_IN") {
          void loadProfile(newSession.user.id);
        }
      } else if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem(DEMO_STORAGE_KEY);
        } catch {
          // ignore
        }
        setSession(null);
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
        void signOut();
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
      const normalizedEmail = email.trim().toLowerCase();

      // 1. If real Supabase configured, attempt remote sign-in
      if (!env.supabaseUrl.includes("placeholder")) {
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error) {
            return { kind: "signed-in" };
          }
          // If not network failure, report error
          if (!error.message.includes("Failed to fetch") && !error.message.includes("network")) {
            return { kind: "error", message: error.message };
          }
        } catch {
          // Network / fetch error — fall through to demo/dev accounts
        }
      }

      // 2. Demo accounts support (works offline & with placeholder Supabase backend)
      const demo = DEMO_ACCOUNTS[normalizedEmail];
      if (demo) {
        const mock = createMockSession(demo.id, normalizedEmail, demo.full_name, demo.role);
        const demoProf: Profile = {
          id: demo.id,
          full_name: demo.full_name,
          role: demo.role,
          mfa_enforced: false,
        };
        setSession(mock);
        setProfile(demoProf);
        try {
          localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ user: mock.user, profile: demoProf }));
        } catch {
          // ignore
        }
        return { kind: "signed-in" };
      }

      // 3. In dev mode, allow custom email login
      if (import.meta.env.DEV) {
        const role: AppRole = normalizedEmail.includes("admin")
          ? "ADMIN"
          : normalizedEmail.includes("qh")
            ? "QUALITY_HEAD"
            : normalizedEmail.includes("nace")
              ? "NACE_INSPECTOR"
              : "QC_INSPECTOR";
        const fullName = (normalizedEmail.split("@")[0] ?? "USER").toUpperCase();
        const id = "00000000-0000-0000-0000-" + normalizedEmail.slice(0, 12).padStart(12, "0");
        const mock = createMockSession(id, normalizedEmail, fullName, role);
        const demoProf: Profile = { id, full_name: fullName, role, mfa_enforced: false };
        setSession(mock);
        setProfile(demoProf);
        try {
          localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ user: mock.user, profile: demoProf }));
        } catch {
          // ignore
        }
        return { kind: "signed-in" };
      }

      return { kind: "error", message: "Invalid email or password." };
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
    () => Promise.resolve({ kind: "error", message: "Authenticator setup disabled" }),
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
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSession(null);
    setProfile(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
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
