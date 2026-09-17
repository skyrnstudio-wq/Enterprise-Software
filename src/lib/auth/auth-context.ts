import { createContext, useContext } from "react";
import type { AuthState } from "./auth-types";

/**
 * Auth context instance + the component-free `useAuth` accessor — kept apart
 * from AuthProvider.tsx so that file stays component-only (react-refresh).
 * Throws when used outside the provider (fail-fast, §6 empty-state rule).
 */
export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
