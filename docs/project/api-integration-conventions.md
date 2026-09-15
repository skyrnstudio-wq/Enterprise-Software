# API Integration Conventions
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `backend-architecture.md` (RPC contract), `technology-stack.md` §3.3–3.4 (state), `offline-sync-architecture.md` (offline writes)

---

## 1. Purpose

One page of rules for how frontend code talks to Supabase — so query hooks look the same in every feature, errors surface the same way, and the offline queue remains the **only** mutation path for drafts.

---

## 2. Layering

```
routes → features/*/components → features/*/api (TanStack Query hooks)
                              → features/*/store (Zustand, drafts only)
                     shared:  @/lib/supabase (client), @/domain (pure logic), @/lib/dexie
```

- Components never call `supabase` directly. Server access is **only** through Query hooks in `features/*/api/`.
- Draft (in-flight batch) data never touches TanStack Query — it lives in the Zustand + Dexie pipeline. Query is for **committed** server state only.
- Cross-feature reads go through the owning feature's exported hooks; no reaching into another feature's internals.

## 3. Query Conventions

- **Key grammar:** arrays, `[entity, scope?, params]` — e.g. `["items", { q }]`, `["batch", batchId]`, `["instruments"]`. Keys are exported as constants from the feature's `api/keys.ts`; building keys inline is forbidden.
- **Stale times:** reference data (items, instruments) 5 min; batch detail 30 s; sign-off state 0 (always fresh).
- **Invalidation:** mutations invalidate by entity, not by page — an approval invalidates `["batch", id]` and any `["batches", …]` list key.
- **Realtime invalidation:** Supabase Realtime events (QH decisions, submissions) call `queryClient.invalidateQueries` — dashboards update without refresh (`backend-architecture.md` §6).

## 4. Mutation Conventions

| Mutation | Path | Offline? |
|---|---|---|
| Draft cell edit | Zustand → Dexie (no network) | yes |
| Draft flush | `upsert_batch_draft` RPC via sync queue | queued |
| Submit batch | `submit_batch` RPC | blocked offline |
| Approve / Reject | `decide_batch` RPC | blocked offline |
| Item/revision/instrument admin | direct table upserts via RLS | online only |

Rules:

- Every mutation input passes its **Zod schema** before the call; server errors are never the first line of defense.
- Submissions and sign-offs are RPC-only — never raw table writes — because the transactional recomputation (`backend-architecture.md` §5) is the integrity boundary.
- Draft flushes go through the sync queue even when online: one write path, one conflict resolver.

## 5. Error Contract

- **Domain errors** (business rule violations from RPCs): raised as Postgres exceptions with stable codes, e.g. `P0001` + message class `BT_*`:

  | Code class | Meaning | UI behavior |
  |---|---|---|
  | `BT_LOCK` | ΔT < 3 °C lock-out, approved-batch mutation | red banner, blocking |
  | `BT_STATE` | Illegal transition (e.g. approve own submission) | inline, non-blocking |
  | `BT_VALID` | Recomputation mismatch / constraint violation | inline on the offending field where mappable |
  | `BT_AUTH` | RLS denial | redirect to login or 403 view |

- **Transport errors** (network, 5xx): TanStack Query retry (2× default) then error state; if offline, mutations enter the queue instead of erroring.
- **Every user-visible error** renders a human sentence + a stable code; raw `message` strings from Postgres never reach the DOM.
- Server errors are logged with the RPC name + batch id (never payload contents containing personal data).

## 6. Typing Contract

- All calls are typed against `Database` from `src/lib/supabase/database.types.ts` (generated). `supabase.from("batches")` with a typo is a compile error.
- RPCs are wrapped in thin typed helpers: `submitBatch(batchId): Promise<SubmitResult>` — call sites never assemble raw `supabase.rpc(...)` argument objects.
- The domain layer (`src/domain`) stays Supabase-free: engines take plain numbers/strings, so they remain trivially testable and portable to the RPC.

## 7. Loading & Optimistic UX

- Suspense-free, explicit `isPending`/`isError` states per section — no global spinners hiding which part of a screen is loading.
- Optimistic updates are allowed **only** for QH reject (status flip back to DRAFT) with automatic rollback on error; approval is never optimistic (immutability is sacred).
- Offline indicator + queue depth badge are global chrome (application shell), fed by the sync store.

## 8. Versioning

- Supabase is a same-repo backend: schema migrations and client types move together, so "API versioning" reduces to migration discipline (`backend-architecture.md` §7).
- The `audit_log.payload` shape is append-friendly: new fields allowed, existing fields never repurposed.

---

*A new integration that breaks a rule in this file needs a written exception here first; silent divergence fails review.*
