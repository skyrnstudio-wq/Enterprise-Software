# Supabase

Backend for the platform (PostgreSQL 15+, Auth, Realtime) — `technology-stack.md` §3.7.

## Relational shape

```
customers → items → drawing_revisions → (dimension_rows | coating_specs)
          → batches → readings → sign-offs
```

Plus: append-only `audit_log` (no UPDATE grant), per-role RLS policies.

## Hardening requirements (implemented as migrations in later phases)

| Concern                          | Mechanism                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Role security                    | RLS policies per role — an Inspector cannot read another inspector's draft or write `sign_offs` |
| Immutability of approved batches | Trigger: any UPDATE/DELETE on `readings`/`batches` where status = `APPROVED` raises (PRD SO-04) |
| Audit trail                      | Append-only `audit_log` written by trigger on every state transition                            |
| Atomic submissions               | Batch + readings + sign-off in a single Postgres function (RPC)                                 |
| Calculation defense-in-depth     | Dew point, ΔT margin, ISO 19840 stats recomputed in the RPC on submit                           |

## Migrations

`migrations/` — committed SQL migrations, applied via `supabase db push`.
Phase 1 (data layer) is on disk: `20260915_001_core_schema.sql` (§2.1 tables),
`20260915_002_constraints.sql` (§2.2 CHECKs/UNIQUEs), `20260915_003_triggers.sql`
(§3 immutability + state machine + audit), `20260915_004_rls.sql` (§4 policies),
`20260915_005_rpcs.sql` (§5 `submit_batch` / `decide_batch` / `upsert_batch_draft`).
`seed.sql` provisions the fixture item + revision + 53 dimension rows + coating
spec + instruments.

Schema ↔ domain parity is enforced by `src/domain/__tests__/schema-parity.test.ts`
(statically parses these files — a migration change without a matching domain
change is a red test). Behavioural verification (RLS matrix, trigger firing,
RPC transactions) runs against staging once provisioned.

## Type generation

After schema changes:

```bash
npm run db:types   # supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Requires the local stack (`npm run db:migrate`); remote generation once the
staging project is provisioned:

```bash
npx supabase gen types typescript --project-id <id> --schema public > ../src/lib/supabase/database.types.ts
```

## Environment separation

- `staging` project — CI E2E target
- `production` — PITR backups enabled (audit retention measured in years)
