import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthState } from "@/lib/auth/auth-types";

/** Router context — auth is injected at render time (main.tsx RouterBridge). */
export interface RouterAppContext {
  auth: AuthState | undefined;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: () => <Outlet />,
});
