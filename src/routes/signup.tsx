import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Caption } from "@/components/ui/StatusChip";

export const Route = createFileRoute("/signup")({
  component: SignUpClosedPage,
});

/**
 * Self-service sign-up is disabled (access model: accounts are provisioned in
 * Supabase by the platform admin, one per role). The route stays alive so the
 * login page's link lands somewhere honest instead of 404ing, and so any
 * bookmarked /signup URL explains the model rather than offering a form.
 */
function SignUpClosedPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper-sunken px-4">
      <div className="w-full max-w-md rounded-sm border border-ink-300 bg-paper-raised p-8 text-center">
        <ShieldCheck size={28} className="mx-auto text-accent" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">Accounts are provisioned, not self-created</h1>
        <p className="mt-2 text-sm text-ink-700">
          Access to the Simran QC platform is issued by your platform administrator. Each
          account is created with exactly one role — QC Inspector, NACE Inspector, Quality
          Head, or Admin — and elevation is never self-service.
        </p>
        <p className="mt-2 text-sm text-ink-700">
          If you need an account, contact the platform administrator.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
      <div className="sr-only">
        <Caption>signup-disabled</Caption>
      </div>
    </div>
  );
}
