# Supabase

Backend for the platform (PostgreSQL 15+, Auth, Realtime) — `technology-stack.md` §3.7.

## Relational shape

```
customers → items → drawing_revisions → (dimension_rows | coating_specs)
          → batches → readings → sign-offs
```

Plus: append-only `audit_log` (no UPDATE grant), per-role RLS policies.

## Hardening requirements (implemented as migrations in later phases)

| Concern | Mechanism |
|---|---|
| Role security | RLS policies per role — an Inspector cannot read another inspector's draft or write `sign_offs` |
| Immutability of approved batches | Trigger: any UPDATE/DELETE on `readings`/`batches` where status = `APPROVED` raises (PRD SO-04) |
| Audit trail | Append-only `audit_log` written by trigger on every state transition |
| Atomic submissions | Batch + readings + sign-off in a single Postgres function (RPC) |
| Calculation defense-in-depth | Dew point, ΔT margin, ISO 19840 stats recomputed in the RPC on submit |

## Migrations

`migrations/` — committed SQL migrations, applied via `supabase db push`.
First migration (schema + RLS) lands in the data-layer phase.

## Type generation

After schema changes:

```bash
npx supabase gen types typescript --project-id <id> --schema public > ../src/lib/supabase/database.types.ts
```

## Environment separation

- `staging` project — CI E2E target
- `production` — PITR backups enabled (audit retention measured in years)
