import { useMemo } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppRouter } from "./router";
import { AuthProvider } from "./lib/auth/AuthProvider";
import { useAuth } from "./lib/auth/auth-context";
import { ToastProvider } from "./components/ui/DataTable";

// TanStack Query — server state (technology-stack.md §3.4).
// Moderate staleness: shop-floor data changes via explicit submissions, not chatter.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createAppRouter();

/** Bridges live auth state into the router context (see router.ts). */
function RouterBridge() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth }} />;
}

/** Composition root — providers wrap the router (ui-ux-plan §2 shell). */
export default function App() {
  const element = useMemo(
    () => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <RouterBridge />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    ),
    [],
  );
  return element;
}
