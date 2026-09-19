<div align="center">

# 🏭 Inspection Automation & Quality Intelligence Platform

**Enterprise Quality Management System (QMS) Digitization & Field Inspection Engine**

[![Client](https://img.shields.io/badge/Client-Simran_Technocrats_(I)_Pvt._Ltd.-0052CC?style=for-the-badge&logo=shield)](https://github.com/skyrnstudio-wq/Enterprise-Software)
[![Built by](https://img.shields.io/badge/Built_By-Skyrn_Studio-10B981?style=for-the-badge&logo=codefactor)](https://github.com/skyrnstudio-wq)
[![ISO Standards](https://img.shields.io/badge/Compliance-ISO_9001_%7C_ISO_12944_%7C_SSPC--PA2-F59E0B?style=for-the-badge)](https://github.com/skyrnstudio-wq/Enterprise-Software)
[![Stack](https://img.shields.io/badge/Stack-React_19_%7C_TypeScript_%7C_Vite_%7C_Supabase-6366F1?style=for-the-badge&logo=react)](https://github.com/skyrnstudio-wq/Enterprise-Software)

<p align="center">
  <b>A mission-critical, offline-first inspection platform replacing manual paper-and-clipboard shop-floor quality auditing with instant mathematical validation, psychrometric environmental analysis, and automated audit-ready reporting.</b>
</p>

[Key Features](#-key-features) •
[Digitized Workflows](#-digitized-qms-workflows) •
[Technology Stack](#-technology-stack) •
[System Architecture](#-system-architecture) •
[Getting Started](#-getting-started) •
[Documentation](#-documentation-index)

---

</div>

## 📌 Executive Overview

Heavy manufacturing quality control requires precision tolerances and strict compliance standards. Historically, plant inspectors manually recorded dozens of dimensional measurements and coating thickness points on physical logsheets before manual data entry into spreadsheets—a process prone to transcription errors, delayed customer reporting, and unverified statistical calculations.

This platform digitizes Simran Technocrats' core QMS operations into a high-performance Progressive Web App (PWA) designed specifically for harsh shop-floor environments with zero network connectivity.

---

## ✨ Key Features

- ⚡ **Pure In-Browser Evaluation Engine**: Zero-latency mathematical tolerance verification and statistical distribution calculations run client-side in milliseconds.
- 📶 **Offline-First Field Architecture**: Fully operational in cellular blackspots using local IndexedDB storage (Dexie.js), background sync queue, and conflict resolution via Supabase.
- 🛡️ **Zero-Trust Server Validation**: All client-calculated tolerances, statistics, and dispositions are independently verified server-side inside Postgres RPC transaction gates before persistence.
- 📊 **Certified Plant Report Generation**: Single-click PDF and Excel audit report generation matching exact plant inspection standards (`ST/QC/02` and `ST/QC/04`).
- 🖥️ **High-Density Shop-Floor UI**: Built with custom high-contrast industrial tokens, full keyboard-driven navigation (numpad optimized), and touch-friendly targets for tablet inspections.

---

## 📋 Digitized QMS Workflows

### 1. Dimensional Inspection Report (`ST/QC/02, Rev 02`)
*Compliance: ISO 9001:2015*

- **Comprehensive Dimension Auditing**: Supports ~53 inspection parameters across 5 component samples (265+ data points per batch).
- **Dynamic Tolerance Parser**: Automatically parses bilateral (`±0.05`), unilateral (`+0.1/-0.0`), and limit dimensions.
- **Real-Time Deviation Analytics**: Instant visual highlighting of In-Tolerance (Green), Out-of-Tolerance (Red), and Borderline values with auto-computed batch disposition (`Accepted`, `Rework`, `Rejected`).

### 2. Surface Preparation & Protective Coating Report (`ST/QC/04, Rev 01`)
*Compliance: ISO 12944, ISO 8501, SSPC-PA2, NACE*

- **Environmental Psychrometric Engine**: Real-time Magnus-Tetens calculation of Dew Point and Delta-T ($T_{steel} - T_{dew} \ge 3^\circ\text{C}$) to guarantee safe coating application windows.
- **26-Point Dry Film Thickness (DFT) Analytics**: High-density spot measurement sampling with automatic calculation of:
  - Mean DFT, Minimum & Maximum readings
  - Standard Deviation & Coefficient of Variation
  - **SSPC-PA2 Rule Enforcement**: Automatic 80/20 compliance verification across all spots.

---

## 🛠️ Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend Framework** | React 19 + TypeScript (Strict) | Concurrent rendering, typed safety, zero runtime compromises |
| **Build & Tooling** | Vite + PWA Plugin | Sub-second HMR, optimized production bundle, offline worker |
| **Routing & Tables** | TanStack Router & TanStack Table | Type-safe URL state management, virtualized 60fps high-density grids |
| **Client State & Cache** | Zustand + TanStack Query | Minimal boilerplate reactive state with robust server query caching |
| **Local Storage** | Dexie.js (IndexedDB wrapper) | Durable offline local persistence with transactional sync journal |
| **Styling System** | Tailwind CSS v4 Custom Tokens | Handcrafted "Engineering Drawing" high-contrast design system |
| **Backend & Database** | Supabase (PostgreSQL 15+) | Row Level Security (RLS), Realtime subscriptions, audited schema |
| **Validation** | Zod + Fast-Check | Strict schema contracts and property-based mathematical testing |
| **Testing Suite** | Vitest + Playwright | Unit, regression, and cross-browser tablet/desktop E2E coverage |

---

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Shop Floor Client                     │
│  ┌─────────────────────────┐   ┌─────────────────────────┐  │
│  │  High-Density Web UI    │   │  Local Evaluation Engine│  │
│  │  (TanStack / Tailwind)  │   │  (Tolerance / Dew Point)│  │
│  └────────────┬────────────┘   └────────────┬────────────┘  │
│               │                             │               │
│               ▼                             ▼               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │       Offline Storage Layer (Dexie.js / IndexedDB)    │  │
│  │       - Outbox Queue   - Sync State Journal           │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTPS / WSS (When Online)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Supabase Cloud Platform                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   PostgreSQL + Row-Level Security (RLS) Gateways      │  │
│  │   - submission_rpc (Dual-Calculation Verification)    │  │
│  │   - Immutable Inspection Audit Log                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```bash
Enterprise-Software/
├── .agents/                 # AI assistant workspace rules & standards
├── docs/                    # Architectural specs, PRD, and client guides
│   ├── project/             # 20+ comprehensive technical specifications
│   └── teaching/            # Domain crash courses & discovery manuals
├── e2e/                     # Playwright end-to-end test suites
├── public/                  # Static assets & PWA manifest icons
├── src/
│   ├── components/          # Reusable design system primitives
│   ├── domain/              # Pure business logic & calculation engines
│   │   ├── __tests__/       # Domain unit & property-based tests
│   │   ├── dew-point.ts     # Magnus-Tetens psychrometric calculation
│   │   ├── dft-stats.ts     # SSPC-PA2 statistical distribution engine
│   │   ├── measurement.ts   # Dimension evaluation logic
│   │   └── tolerance-parser.ts # Engineering tolerance parser
│   ├── features/            # Feature modules (item-master, inspections)
│   ├── lib/                 # Supabase client, Dexie DB, and utilities
│   ├── routes/              # TanStack file-based routes
│   └── styles/              # Industrial design system CSS tokens
├── supabase/                # Migrations, database types, and RLS policies
├── package.json             # Dependencies and build scripts
└── vite.config.ts           # Vite + PWA build configuration
```

---

## 🚦 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or `v24.x` (LTS)
- **npm**: `v10.x` or later
- **Supabase CLI** (linked to the hosted project) — `supabase link --project-ref hbwbevbgrugpgimzxrkh`

> **Backend note:** the local Docker Supabase stack has been removed. The hosted
> **Simran Technocrats** project is the single backend — migrations and seed are
> applied through the Supabase MCP (`apply_migration` / `execute_sql`) or the dashboard SQL editor.

### Installation (local, one command per step)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/skyrnstudio-wq/Enterprise-Software.git
   cd Enterprise-Software
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables** — copy `.env.example` to `.env.local` and
   set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to the hosted project's
   values (Supabase dashboard → Project Settings → API):
   ```bash
   cp .env.example .env.local
   ```
   *Keys are safe to ship to the browser — Postgres RLS, not secrecy, protects the data.*

4. **Launch the development server:**
   ```bash
   npm run dev
   ```

### Demo accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@simran.local` | `Simran#2026` |
| QC Inspector | `inspector1@simran.local` | `Simran#2026` |
| Quality Head | `qh@simran.local` | `Simran#2026` |
| NACE Inspector | `nace@simran.local` | `Simran#2026` |

*Dev/demo credentials only — rotate before any real deployment. The Quality Head must enroll TOTP (`MFA enrollment` in the profile menu) once before an approval will pass the server's AAL2 gate.*

### Accounts — provisioned, not self-registered

Self-service sign-up is **disabled by design**: a quality system doesn't accept
anonymous registrations. The administrator creates accounts in the Supabase
dashboard (Authentication → Users), one per role — QC Inspector, NACE Inspector,
Quality Head, Admin. The `on_auth_user_created` trigger provisions the profile,
and role changes are server-side admin actions, never self-service. The `/signup`
route explains this model to anyone who lands on it.

---

## 🧪 Verification & Quality Gate

Run the complete quality gate before creating pull requests:

```bash
# Run full verification pipeline (Typecheck + Lint + Unit Tests)
npm run verify

# Run unit & property tests with Vitest
npm run test

# Run interactive test watcher
npm run test:watch

# Run Playwright end-to-end test suite
npm run test:e2e

# Run strict ESLint checks
npm run lint

# Code formatting
npm run format
```

### End-to-end journeys (Playwright)

The `e2e/` suite has two layers:

- **Always-green checks** — `smoke.spec.ts` (boot + auth guard) and
  `print.spec.ts` (controlled-format print baselines). These need no database.
- **Credential-gated journeys** — `journeys.spec.ts` (J1–J4) drives the running
  app against a seeded Supabase project. They skip unless the demo credentials
  are exported, so a bare checkout stays green:
  ```bash
  export E2E_BASE_URL=http://localhost:5173
  export E2E_INSPECTOR_EMAIL=inspector1@simran.local E2E_INSPECTOR_PASSWORD='Simran#2026'
  export E2E_QH_EMAIL=qh@simran.local          E2E_QH_PASSWORD='Simran#2026'
  npm run test:e2e
  ```
  Against the hosted project, `npm run dev` first (see above).

---

## 📚 Documentation Index

All implementation details are strictly documented under [`docs/`](docs):

- **[Application Flow](docs/project/application-flow.md)** — Complete step-by-step user journey and state diagrams
- **[Product Requirements Document (PRD)](docs/project/product-requirements.md)** — Functional specifications and acceptance criteria
- **[Technology Stack Decision Record](docs/project/technology-stack.md)** — Rationale for architecture choices
- **[Offline Sync Architecture](docs/project/offline-sync-architecture.md)** — Local storage, journal queue, and reconciliation
- **[Demo Runbook & Landing Script](docs/DEMO_RUNBOOK.md)** — Feature-by-feature demo script with the exact test data, plus the close
- **[Report Fidelity Sign-Off](docs/project/report-fidelity-signoff.md)** — Line-by-line checklist for ST/QC/02 & ST/QC/04 against the audited originals
- **[Testing & Quality Plan](docs/project/testing-quality-plan.md)** — Unit, property, and E2E strategy
- **[Domain Crash Course](docs/teaching/domain-crash-course.md)** — Engineering handbook on tolerances, ISO 9001 & ISO 12944

---

<div align="center">

**Enterprise Software Platform** • Developed by **[Skyrn Studio](https://github.com/skyrnstudio-wq)** for **Simran Technocrats (I) Pvt. Ltd.**

</div>