# Reigh: Developer Onboarding

> **How to Use This Guide**  
> • Skim the Tech Stack & Directory tables to orient yourself  
> • Follow links to sub-docs in [docs/structure_detail/](docs/structure_detail/) for implementation details  
> • Source of truth is always the code – this guide points you in the right direction

> **When to Update**  
> • Top-level directory/config changes • Tool add/remove/refactor • DB schema/RLS/Edge Function changes  
> • New persistence strategies • Shared hooks/contexts/UI primitives • Anything that would confuse a new dev

---

## Quick Reference: Sub-Documentation

| Topic | File | Description |
|-------|------|-------------|
| **Development Setup** | [README.md](README.md) | Local environment, commands, troubleshooting |
| **Database & Storage** | [db_and_storage.md](docs/structure_detail/db_and_storage.md) | Schema, migrations, RLS, storage buckets, upload paths |
| **Deployment** | [deployment_and_migration_guide.md](docs/structure_detail/deployment_and_migration_guide.md) | Safe migrations and Edge Function deployment |
| **Settings System** | [settings_system.md](docs/structure_detail/settings_system.md) | Settings priority (shot→project→user→defaults), inheritance |
| **Data Persistence** | [data_persistence.md](docs/structure_detail/data_persistence.md) | State management patterns, storage layers |
| **Shot Data Flow** | [shot_generation_data_flow.md](docs/structure_detail/shot_generation_data_flow.md) | Types, hooks, caching patterns for shot images |
| **Task System** | [task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md) | Async task queue, worker polling |
| **Task Creation** | [unified_task_creation.md](docs/structure_detail/unified_task_creation.md) | Client-side task creation pattern |
| **Edge Functions** | [edge_functions.md](docs/structure_detail/edge_functions.md) | Serverless function reference |
| **Realtime System** | [realtime_system.md](docs/structure_detail/realtime_system.md) | Unified realtime + smart polling |
| **Performance** | [performance_system.md](docs/structure_detail/performance_system.md) | Frame budgets, time-slicing, image loading |
| **Image Loading** | [image_loading_system.md](docs/structure_detail/image_loading_system.md) | Progressive loading, device-adaptive batching |
| **Shared Code** | [shared_hooks_contexts.md](docs/structure_detail/shared_hooks_contexts.md) | Hooks, contexts, components catalog |
| **Adding Tools** | [adding_new_tool.md](docs/structure_detail/adding_new_tool.md) | Step-by-step new tool guide |
| **Design Standards** | [design_motion_guidelines.md](docs/structure_detail/design_motion_guidelines.md) | UI/UX patterns, motion, accessibility |
| **Modal System** | [modal_styling_system.md](docs/structure_detail/modal_styling_system.md) | Responsive modals, positioning |
| **Debugging** | [debugging.md](docs/structure_detail/debugging.md) | CLI, `system_logs`, frontend logging |
| **Tool: Image Gen** | [tool_image_generation.md](docs/structure_detail/tool_image_generation.md) | Multi-model generation, LoRA, style references |
| **Tool: Video Travel** | [tool_video_travel.md](docs/structure_detail/tool_video_travel.md) | Timeline workflow, batch processing |
| **Payments** | [auto_topup_system.md](docs/structure_detail/auto_topup_system.md) | Credits, auto-top-up, Stripe |
| **Referrals** | [referral_system.md](docs/structure_detail/referral_system.md) | Username-based referral tracking |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Vite + TypeScript | SPA framework & build tooling |
| **Styling** | TailwindCSS + shadcn-ui | Utility CSS with container queries (`@container`) |
| **Backend** | Supabase (Postgres + Edge Functions) | Database, auth, storage, serverless workers |
| **AI/ML** | FAL-AI | Image/video generation services |

**Dev server:** `http://localhost:2222` • **Package managers:** npm (default) or bun

---

## Directory Structure

| Path | Purpose | Key Files |
|------|---------|-----------|
| `/src/app` | App bootstrap & routing | `main.tsx` → `App.tsx` → `routes.tsx` → `Layout.tsx` |
| `/src/pages` | Top-level pages | `HomePage`, `ToolSelectorPage`, `ShotsPage` |
| `/src/tools` | Feature modules | Each tool: `pages/`, `components/`, `hooks/`, `settings.ts` |
| `/src/shared` | Shared code | `components/ui/` (shadcn), `hooks/`, `contexts/`, `lib/` |
| `/supabase/functions` | Edge Functions | Task processing, payments, AI integration |
| `/supabase/migrations` | DB migrations | Schema changes (use `db push --linked`) |
| `/db` | Schema docs & seeding | `schema/schema.ts` (types), `seed.ts` |
| Root | Build configs | `vite.config.ts`, `tailwind.config.ts`, `railway.toml` |

---

## Core Concepts

### Tools
Tools live in `/src/tools/{tool-name}/` following a consistent structure. See [adding_new_tool.md](docs/structure_detail/adding_new_tool.md).

**Active tools:** Image Generation, Video Travel, Animate Characters, Edit Images, Join Clips

### Shots & Generations
- **Generations** = gallery items (images/videos produced by AI tasks)
- **Shots** = containers that organize generations into a timeline
- **`shot_generations`** = join table with position + metadata (pair prompts, timeline frame)
- Data access: `useAllShotGenerations(shotId)` → see [shot_generation_data_flow.md](docs/structure_detail/shot_generation_data_flow.md)

### Settings Resolution
Priority: **shot → project → user → defaults**. See [settings_system.md](docs/structure_detail/settings_system.md).

### Task System
Async queue for AI workloads: client creates task → DB trigger → worker polls → Edge Function completes.
See [task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md).

### Realtime
Smart polling + Supabase realtime subscriptions. Connected = no polling; disconnected = 15s fallback.
See [realtime_system.md](docs/structure_detail/realtime_system.md).

---

## Key Utilities

| System | Location | Purpose |
|--------|----------|---------|
| **settingsResolution** | `lib/settingsResolution.ts` | Resolve settings across scopes |
| **settingsWriteQueue** | `lib/settingsWriteQueue.ts` | Global queue for settings writes (prevents network flooding) |
| **debugConfig** | `lib/debugConfig.ts` | Runtime debug logging (`window.debugConfig`) |
| **toastThrottle** | `lib/toastThrottle.ts` | Prevent notification spam |
| **taskConfig** | `lib/taskConfig.ts` | Task visibility & display names |
| **queryKeys** | `lib/queryKeys.ts` | Standardized React Query keys |
| **performanceUtils** | `lib/performanceUtils.ts` | Frame budget monitoring |
| **imageLoadingPriority** | `lib/imageLoadingPriority.ts` | Progressive image loading |

Instrumentation lives in `src/integrations/supabase/instrumentation/` — see its [README](src/integrations/supabase/instrumentation/README.md).

---

## Development

See [README.md](README.md) for local setup, commands, mobile testing, and troubleshooting.

**Debug logging:** `VITE_DEBUG_LOGS=true npm run dev` — see [debugging.md](docs/structure_detail/debugging.md)

---

<div align="center">

[Add a Tool](docs/structure_detail/adding_new_tool.md) • [Database](docs/structure_detail/db_and_storage.md) • [Settings](docs/structure_detail/settings_system.md) • [Tasks](docs/structure_detail/task_worker_lifecycle.md)

</div>
