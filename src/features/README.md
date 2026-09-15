# Feature Modules

Each first-class workflow owns a folder here. Conventions:

- `features/<name>/components/` — UI components (screen sections, grids)
- `features/<name>/store/` — Zustand stores (client/entry state only)
- `features/<name>/api/` — TanStack Query hooks wrapping Supabase calls
- `features/<name>/schemas.ts` — feature-specific Zod schemas

Planned modules (per `docs/project/application-flow.md`):

- `item-master/` — IM-01 … IM-06
- `dimensional-inspection/` — DIM-01 … DIM-07 (Format ST/QC/02)
- `coating-inspection/` — COAT-01 … COAT-07 (Format ST/QC/04)
- `equipment-registry/` — EQ-01 … EQ-04
- `sign-off/` — SO-01 … SO-04
- `reports/` — PDF-01 … PDF-04
- `ncr/` — NCR-01 … NCR-03

Rules:

- Features import from `@/domain`, `@/lib`, and `@/components` — never from
  each other's internals; cross-feature needs go through a shared module.
- No `any` anywhere (strict mode is enforced in CI).
