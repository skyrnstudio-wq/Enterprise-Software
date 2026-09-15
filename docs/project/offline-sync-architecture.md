# Offline-First & Sync Architecture
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `technology-stack.md` §3.6 (authoritative), `backend-architecture.md` §5.3 (sync RPC), `product-requirements.md` DIM-07 / NFR Reliability

---

## 1. Why This Exists

Shop floors have spotty Wi-Fi. A 45-minute inspection session must survive **browser crash, tab closure, tablet reboot, and multi-day offline use** — zero data loss (PRD NFR Reliability). `localStorage` alone is not an offline strategy (quota limits, Safari ITP purges); it is demoted to a belt-and-braces mirror of the active draft only.

---

## 2. Data Flow

```
Inspector fills grid ──► Zustand store ──► Dexie (IndexedDB), every keystroke batch
                                              │
Service worker precaches app shell + Item Master data
                                              │
        [Online?] ── no ──► draft persists locally; queue holds mutations
              │
              └── yes ──► sync queue drains ──► Supabase (transactional RPC)
```

- **Zustand** is the in-memory working set (draft readings, instrument assignments, autosave cursor).
- **Dexie** (`src/lib/dexie/db.ts`) is the durable store; the Zustand store hydrates from it on app start.
- **Autosave cadence:** every keystroke batch to Dexie (debounced ~300 ms); the PRD's 30-second autosave (DIM-07) is thus exceeded, not merely met.

## 3. What Works Offline

| Capability | Offline behavior |
|---|---|
| Fill dimensional grid | Full function; tolerance coloring is pure client math |
| DFT grid + statistics | Full function; ISO 19840 computed locally |
| Dew point / ΔT gate | Full function; Magnus-Tetens is client-side too |
| Item Master | Served from cache (last-synced revision set) |
| Submit for review | **Blocked** — submission is transactional and server-recomputed; queued until online |
| QH approve/reject | Blocked until online (sign-off integrity requires server timestamps) |
| PDF export | Blocked until `APPROVED` (and approval requires online) |

Design stance: **capture is offline; commitment is online.** This keeps the immutability and defense-in-depth guarantees intact without a CRDT layer (`technology-stack.md` §4 defers ElectricSQL for exactly this reason).

## 4. Sync Queue

- Every offline mutation appends to the Dexie `pendingSync` table: `{ table, operation, payload, createdAt, attempts }`.
- Drain order: FIFO per batch; a batch's mutations drain as **one** `upsert_batch_draft` RPC call (idempotent, server-side conflict resolution).
- Backoff: exponential with jitter; `attempts` caps at 10 before the record is quarantined and surfaced in a "Sync problems" UI badge (never silently dropped).
- Connectivity detection: `navigator.onLine` **plus** a cheap Supabase heartbeat — being "online" at the network stack doesn't mean the API is reachable.

## 5. Conflict Policy

| Batch state | Conflict outcome |
|---|---|
| `DRAFT` (server) vs local edits | **Local wins** — merge is per-row last-write-wins on cell values |
| `SUBMITTED`+ (server) vs local stale edits | **Server wins** — local queue entries for that batch are discarded; UI informs the inspector their draft was already submitted from another device |
| Two devices, same draft | Server-side `updated_at` newer wins per row; both devices re-hydrate after drain |

One inspector is assigned per batch in v1 (`technology-stack.md` §4), so real write conflicts are rare; the policy above is the deterministic fallback, resolved in the RPC, not in client code.

## 6. Service Worker (PWA)

- `vite-plugin-pwa` with `autoUpdate`; precache: app shell, fonts, assets (`globPatterns` in `vite.config.ts`).
- **Supabase API traffic is never cached by the SW** — read caching lives in TanStack Query (with explicit stale times), mutation correctness lives in the queue. The SW does not invent a second cache with different rules.
- Item Master offline cache: on login, the item catalog + open revision templates are fetched and written to Dexie (bounded by count and size); the SW serves the app shell so cold-start works in airplane mode.
- Update flow: new SW activates on next visit; a toast offers "Refresh to update" rather than silently reloading a mid-inspection screen.

## 7. Failure & Recovery Matrix

| Event | Outcome |
|---|---|
| Browser crash mid-grid | Draft restored from Dexie on next launch, cursor at last cell |
| Tablet reboot | Same — IndexedDB survives |
| Server reject while offline | On reconnect, queue drains; rejection Realtime event updates the batch to `REJECTED` → editable draft |
| Dexie corruption / quota | localStorage mirror of active draft (few KB) allows emergency export to JSON; error surfaced immediately, not at submit |
| Clock skew | All server timestamps authoritative; local clock never recorded |

## 8. Testing the Offline Story

- Unit: queue drain ordering, backoff math, conflict resolution rules (pure functions).
- Integration (Vitest + fake-indexeddb): write → reload → hydrate parity.
- E2E (Playwright): go offline via context, fill 53×5 grid, reload page, assert data intact, go online, assert drain and server state.
- Field pilot: one week of real shop-floor use before sign-off of the reliability NFR.

---

*Any change to the conflict policy or queue shape is a `backend-architecture.md` §5.3 cross-change and needs both documents bumped.*
