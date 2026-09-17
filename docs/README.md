# Documentation Index

Project: **Simran Technocrats — Inspection Automation & Quality Intelligence Platform**
Vendor: Skyrn Studio · Date: September 14, 2026

## 📁 `project/` — Build & Delivery Documents

Authoritative documents for designing, building, and selling the platform.

### Product & Design

| Document                                                                 | Role                                                                                                           | Status                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------- |
| [`product-requirements.md`](project/product-requirements.md)             | Product Requirements — functional scope, acceptance criteria (v1.2, synced with stack & design)                | 🟡 Pending client sign-off |
| [`technology-stack.md`](project/technology-stack.md)                     | Technology Stack Decision Record v2.0 — **authoritative for implementation**                                   | ✅ Adopted                 |
| [`ui-ux-plan.md`](project/ui-ux-plan.md)                                 | UI/UX Plan — "Engineering Drawing" design system, color tokens, 21-screen specs, automated UX, mobile strategy | ✅ Current                 |
| [`application-flow.md`](project/application-flow.md)                     | Application Flow v1.1 — role journeys, screen inventory, batch state machine                                   | ✅ Current                 |
| [`delivery-milestones.md`](project/delivery-milestones.md)               | Delivery Phases & Milestones — build order, exit criteria, acceptance traceability                             | ✅ Current (Phase 0 done)  |
| [`execution-plan.md`](project/execution-plan.md)                         | Execution Plan — operational step sequence per phase, edge-case registers, definitions of done                 | ✅ Current                 |
| [`client-proposal.md`](project/client-proposal.md)                       | **Client-facing proposal** — management-ready business case: findings, solution, ROI, packages, next steps     | ✅ For client review       |
| [`executive-summary-onepager.md`](project/executive-summary-onepager.md) | **One-page executive handout** — meeting-ready summary of the proposal: risk, platform, numbers, packages      | ✅ For client review       |

### Engineering

| Document                                                                   | Role                                                                                                       | Status     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| [`backend-architecture.md`](project/backend-architecture.md)               | Backend contract — schema, constraints, triggers, RLS, RPCs, realtime, jobs                                | ✅ Current |
| [`security-compliance.md`](project/security-compliance.md)                 | Security & Compliance — auth, RBAC, integrity, audit trail, ISO 9001/12944/NACE mapping, incident response | ✅ Current |
| [`offline-sync-architecture.md`](project/offline-sync-architecture.md)     | Offline-First & Sync — Dexie store, sync queue, conflict policy, PWA, recovery matrix                      | ✅ Current |
| [`api-integration-conventions.md`](project/api-integration-conventions.md) | API Integration Conventions — Query patterns, mutation paths, error contract, typing                       | ✅ Current |
| [`data-dictionary.md`](project/data-dictionary.md)                         | Data Dictionary — identifiers, units, field semantics, controlled vocabularies, tolerance grammar          | ✅ Current |
| [`report-export-spec.md`](project/report-export-spec.md)                   | Report Export & Print Fidelity Spec — ST/QC/02 + ST/QC/04 anatomy, print-CSS rules, fidelity verification  | ✅ Current |
| [`testing-quality-plan.md`](project/testing-quality-plan.md)               | Testing & Quality Plan — test pyramid, cannot-regress list, E2E journeys, CI gate, DoD                     | ✅ Current |
| [`deployment-environments.md`](project/deployment-environments.md)         | Deployment & Environments — topology, env matrix, pipeline, rollback/DR, monitoring                        | ✅ Current |
| [`findings-phase0.md`](project/findings-phase0.md)                         | Phase 0 Findings Report — verified audit of scaffold vs. testing & UI/UX plans (9 findings, action list)   | ✅ Current |

### Reference

| Document                                                             | Role                                                                                                       | Status                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`pricing-roi-analysis.md`](project/pricing-roi-analysis.md)         | Pricing & ROI Payback Analysis — module à la carte, bundle value, payback model with stated assumptions    | 🔒 Internal — commercial in confidence |
| ---                                                                  | ---                                                                                                        | ---                                    |
| [`workbook-audit-analysis.md`](project/workbook-audit-analysis.md)   | Forensic audit of the two Excel workbooks — the evidence base for every requirement                        | ✅ Reference                           |
| [`project-brief.md`](project/project-brief.md)                       | Comprehensive project brief & ROI case. Note: its §6 stack is **superseded** by `technology-stack.md` v2.0 | ✅ Reference                           |
| [`premium-features-roadmap.md`](project/premium-features-roadmap.md) | Commercial roadmap — premium modules, packaging, value pitch                                               | ✅ Reference                           |

## 📁 `teaching/` — Domain Learning Documents

Onboarding material for developers new to manufacturing QC. Read-only context — no implementation decisions live here.

| Document                                                          | Purpose                                                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`domain-crash-course.md`](teaching/domain-crash-course.md)       | 8-module crash course: who the client is, the manufacturing pipeline, controlled documents, both QC workflows, the domain glossary |
| [`client-discovery-guide.md`](teaching/client-discovery-guide.md) | Client discovery & positioning notes — company pedigree, consultative framing, vocabulary                                          |

## Sync Rules

- `technology-stack.md` is **authoritative** whenever any document's stack mention conflicts (the brief's §6 is historical).
- `ui-ux-plan.md` is authoritative for visual/design decisions; `application-flow.md` for flow/state-machine logic.
- **Engineering docs detail, they never contradict:** `backend-architecture.md`, `security-compliance.md`, `offline-sync-architecture.md`, `api-integration-conventions.md`, `data-dictionary.md`, `report-export-spec.md`, `testing-quality-plan.md`, and `deployment-environments.md` elaborate the stack record within their domain; conflicts resolve upward to `technology-stack.md`.
- Cross-references between documents in `project/` are relative (same folder). Teaching docs intentionally contain no stack references.
- When updating a document, bump its version line and update the status column above.

### Reading order (new team member)

1. `project-brief.md` — the business case
2. `workbook-audit-analysis.md` — why the requirements exist
3. `product-requirements.md` — what we're building
4. `application-flow.md` → `ui-ux-plan.md` → `technology-stack.md` — how it's designed and built
5. Then, by role: backend work → `backend-architecture.md` + `security-compliance.md`; UI work → `api-integration-conventions.md` + `offline-sync-architecture.md`; QA → `testing-quality-plan.md`; release → `deployment-environments.md`
