import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { AuthState } from "./lib/auth/auth-types";

/**
 * Router factory (kept separate from App.tsx for testability). The auth
 * context is injected at render time via `<RouterProvider context={{ auth }} />`
 * (App.tsx) — `beforeLoad` guards read `context.auth`; the render-side guard
 * lives in routes/_authenticated.tsx.
 */
export function createAppRouter() {
  return createRouter({
    routeTree,
    context: { auth: undefined as AuthState | undefined },
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
