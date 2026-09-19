/**
 * useAuthFactorState — MFA factor helpers extracted from AuthProvider.tsx.
 *
 * supabase-js types `listFactors()` rows as Factor<"totp", "verified"> —
 * the status literal is hardcoded, which makes status comparisons
 * tautologies to the type system while the runtime returns real DB state
 * (verified AND unverified). The result is cast once at this boundary to an
 * honest shape; everything downstream compares plain strings.
 */

import { useCallback, useState } from "react";
import { supabase } from "../supabase/client";

interface FactorRow {
  id: string;
  friendly_name?: string | null;
  status: string;
}

interface FactorListResult {
  data: { totp: FactorRow[] };
  /** supabase-js v2 returns errors at the TOP level, not inside `data`. */
  error: { message: string } | null;
}

export interface FactorInfo {
  id: string;
  friendlyName: string;
}

function toInfo(f: FactorRow): FactorInfo {
  return { id: f.id, friendlyName: f.friendly_name ?? "Authenticator" };
}

export function useAuthFactorState() {
  const [factors, setFactors] = useState<FactorInfo[]>([]);

  /** Only VERIFIED factors count — enrollment alone does not satisfy SO-01…04. */
  const refreshFactors = useCallback(async () => {
    const result = (await supabase.auth.mfa.listFactors()) as unknown as FactorListResult;
    // Error lives at the top level in supabase-js v2 — the previous
    // `result.data.error` check read `undefined !== null` (always true) and
    // silently zeroed every factor list, bricking the MFA login challenge.
    if (result.error !== null) return;
    setFactors(result.data.totp.filter((f) => f.status === "verified").map(toInfo));
  }, []);

  /** First verified TOTP factor, or null — used for the login challenge step. */
  const firstVerifiedFactorId = useCallback(async (): Promise<string | null> => {
    const result = (await supabase.auth.mfa.listFactors()) as unknown as FactorListResult;
    if (result.error !== null) return null;
    const verified = result.data.totp.filter((f) => f.status === "verified");
    return verified[0]?.id ?? null;
  }, []);

  /** Pending (unverified) enrollment, if any — completes the enroll-then-confirm flow. */
  const pendingEnrollmentFactor = useCallback(async (): Promise<FactorInfo | null> => {
    const result = (await supabase.auth.mfa.listFactors()) as unknown as FactorListResult;
    if (result.error !== null) return null;
    const pending = result.data.totp.filter((f) => f.status === "unverified");
    return pending[0] !== undefined ? toInfo(pending[0]) : null;
  }, []);

  return { factors, refreshFactors, firstVerifiedFactorId, pendingEnrollmentFactor };
}
