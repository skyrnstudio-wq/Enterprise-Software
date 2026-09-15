# Shared Components

Cross-feature UI primitives, restyled to the "Engineering Drawing" design
system (never used stock, per `technology-stack.md` §3.5).

Planned structure (built out as features land):

- `ui/` — Radix-based primitives: Dialog, Select, Popover, Tooltip, Toast
- `grid/` — TanStack Table + Virtual wrappers: data cell, status chip,
  keyboard cell navigation
- `layout/` — SectionCard, FormRow, PageHeader
- `print/` — print-only branches shared by the `@media print` PDF engine

Status chips must pair color with shape/icon (colorblind-safe, PRD §5
"Design Aesthetics") and use only the tokens defined in
`src/styles/index.css`.
