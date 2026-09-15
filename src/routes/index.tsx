import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inspection Automation Platform</h1>
      <p className="max-w-2xl text-graphite-700">
        Phase 0 scaffold is live. Dimensional (ST/QC/02) and Protective Coating
        (ST/QC/04) modules arrive in subsequent phases on top of this structure.
      </p>
      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-sm border border-graphite-100 bg-paper-raised p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-graphite-500">
            Design tokens
          </div>
          <div className="mt-2 flex gap-2">
            <span className="h-6 w-6 rounded-xs bg-graphite-900" />
            <span className="h-6 w-6 rounded-xs bg-accent" />
            <span className="h-6 w-6 rounded-xs bg-status-pass" />
            <span className="h-6 w-6 rounded-xs bg-status-warn" />
            <span className="h-6 w-6 rounded-xs bg-status-fail" />
          </div>
        </div>
        <div className="rounded-sm border border-graphite-100 bg-paper-raised p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-graphite-500">
            Domain engines
          </div>
          <p className="mt-2 text-sm text-graphite-700">
            Tolerance parser · Dew point · DFT stats · Batch state machine —
            unit + property tested.
          </p>
        </div>
        <div className="rounded-sm border border-graphite-100 bg-paper-raised p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-graphite-500">
            Offline ready
          </div>
          <p className="mt-2 text-sm text-graphite-700">
            PWA manifest + service worker wired; Dexie sync queue schema staged.
          </p>
        </div>
      </div>
    </div>
  );
}
