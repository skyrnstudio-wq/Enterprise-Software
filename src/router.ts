import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Router factory (kept separate from main.tsx for testability).
 * Auth context (user + role) is threaded here once Supabase Auth lands.
 */
export function createAppRouter() {
  return createRouter({ routeTree, context: { auth: undefined } });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
