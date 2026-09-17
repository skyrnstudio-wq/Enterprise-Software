/**
 * Route constants — shared by login redirect and guards. Kept out of
 * AuthProvider.tsx so that file stays component-only (react-refresh).
 */

/** Post-login destination by role — silent routing, no role picker (§6.1). */
export function homeForRole(role: AppRoleLike): string {
  if (role === "ADMIN") return "/admin/items";
  return "/";
}

/** Structural role type — avoids importing AppRole (and React types) here. */
export type AppRoleLike = "ADMIN" | "QC_INSPECTOR" | "NACE_INSPECTOR" | "QUALITY_HEAD";

/** Roles that must enroll in MFA before their affordances unlock (edge 2.14). */
export const MFA_REQUIRED_ROLES: AppRoleLike[] = ["QUALITY_HEAD", "ADMIN"];
