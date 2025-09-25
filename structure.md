# Reigh: Developer Onboarding

> **How to Use This Guide**  
> • Skim the Tech Stack & Directory tables below to orient yourself.  
> • Need implementation specifics? Follow the links to sub-docs in [docs/structure_detail/](docs/structure_detail/) (one file per topic).  
> • This guide documents the current architecture and setup, not historical changes or bug fixes. If you need to see change history, fetch git commits.
> • When in doubt, the source of truth is always the code – this guide just points you in the right direction.

> **When to Update This Guide & Sub-Docs**  
> • Create, delete, rename, or move any top-level directory, core config file, or critical script.  
> • Add, hide, deprecate, or significantly refactor a tool — also create/update its doc in `docs/structure_detail/`.  
> • Modify database schema, migrations, RLS policies, or Edge Function names/logic.  
> • Introduce a new state-persistence strategy (storage bucket, LocalStorage schema, etc.).  
> • Add or change shared hooks, contexts, or reusable UI primitives.  
> • Update global design, motion, or accessibility standards.  
> • Any change that would confuse a new dev skimming this file.

> **Who This Guide Is For**  
> • 🤖 + 👨‍💻


## Table of Contents
- [1. Tech Stack & Ports](#1-tech-stack--ports)
- [2. Directory Structure](#2-directory-structure-top-level)
  - [DB Overview & Workflow](#db-overview--workflow)
  - [Persistence & Settings](#persistence--settings-tools-ui-user)
- [3. Source Code Breakdown](#3-source-code-breakdown)
  - [3.1. Core Application](#31-core-application-srcapp)
  - [3.2. Top-Level Pages](#32-top-level-pages-srcpages)
  - [3.3. Tool Modules](#33-tool-modules-srctools)
  - [3.4. Shared Elements](#34-shared-elements-srcshared)
- [Design & Motion Guidelines](#design--motion-guidelines)

## Quick Reference: Sub-Documentation

| Topic | File | Description |
|-------|------|-------------|
| **Development Setup** | [README.md](README.md) | Local environment setup, commands, troubleshooting |
| **Database & Storage** | [db_and_storage.md](docs/structure_detail/db_and_storage.md) | Schema map, migration workflow, storage buckets |
| **Data Persistence** | [data_persistence.md](docs/structure_detail/data_persistence.md) | State management patterns, hooks, storage layers |
| **Task System** | [task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md) | Async task queue, worker polling, Edge Functions |
| **Unified Task Creation** | [unified_task_creation.md](docs/structure_detail/unified_task_creation.md) | Client-side task creation pattern, migration guide, authentication flow |
| **Edge Functions** | [edge_functions.md](docs/structure_detail/edge_functions.md) | Complete serverless function reference and API details |
| **Adding Tools** | [adding_new_tool.md](docs/structure_detail/adding_new_tool.md) | Step-by-step guide for new tool modules |
| **Design Standards** | [design_motion_guidelines.md](docs/structure_detail/design_motion_guidelines.md) | UI/UX patterns, motion, accessibility, mobile touch interactions |
| **Shared Code** | [shared_hooks_contexts.md](docs/structure_detail/shared_hooks_contexts.md) | Reusable hooks, contexts, components catalog (includes useCurrentProject) |
| **Realtime Architecture** | [realtime_system.md](docs/structure_detail/realtime_system.md) | Implemented unified realtime system and usage guide |
| **Component Modularity** | [component_modularization.md](docs/structure_detail/component_modularization.md) | Reusable UI component patterns and shared details |
| **Tool: Image Gen** | [tool_image_generation.md](docs/structure_detail/tool_image_generation.md) | Multi-model image generation (Wan 2.2, Qwen.Image), LoRA support, style reference system, inline AI prompt editing |
| **Tool: Video Travel** | [tool_video_travel.md](docs/structure_detail/tool_video_travel.md) | Frame-accurate video generation workflow, shot reordering, mobile video preloading, video gallery with hover-to-play |
| **Tool: Edit Travel** | [tool_edit_travel.md](docs/structure_detail/tool_edit_travel.md) | Text-guided image transformations |
| **Tool: Training Data** | [tool_training_data_helper.md](docs/structure_detail/tool_training_data_helper.md) | Training video upload & segmentation |
| **Auto-Top-Up System** | [auto_topup_system.md](docs/structure_detail/auto_topup_system.md) | Credit purchases, auto-top-up setup, Stripe integration, database triggers |
| **Referral System** | [referral_system.md](docs/structure_detail/referral_system.md) | Referral tracking with username-based links, visitor attribution, secure conversion handling |
| **Debug Logging** | [debug_logging.md](docs/structure_detail/debug_logging.md) | PerfDebug log helpers & profiling |
| **Component Modularization** | [component_modularization.md](docs/structure_detail/component_modularization.md) | Guide for breaking down large components into maintainable modules |
| **Image Loading System** | [image_loading_system.md](docs/structure_detail/image_loading_system.md) | Progressive loading, adjacent page preloading, performance optimization |
| **Modal Styling System** | [modal_styling_system.md](docs/structure_detail/modal_styling_system.md) | Unified responsive modal system for both mobile and desktop, positioning, safe area handling |
| **Mobile Video Toggle** | - | Mobile UI toggle functionality between MediaLightbox video playback and TaskDetailsModal for viewing generation parameters |
| **Railway Deployment** | [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md) | Complete Railway.com deployment guide |
| **Instrumentation System** | [instrumentation/README.md](src/integrations/supabase/instrumentation/README.md) | Centralized instrumentation management, diagnostics, and debugging tools |

This document is meant to serve as a comprehensive view of Reigh's architecture. 

---

## 🛠️ Tech Stack & Ports

### Core Technologies

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Vite + TypeScript | SPA framework & build tooling |
| **Styling** | TailwindCSS + @tailwindcss/container-queries + shadcn-ui | Utility-first CSS, **container-query** responsive system (`c-*` variants) |
| **Backend** | Supabase Edge Functions | Database, auth, storage & background workers (serverless) |
| **Data** | PostgreSQL + Supabase Client | Primary database with direct queries |
| **AI/ML** | FAL-AI | Image generation services |

### Development Ports

```bash
🌐 Frontend:  http://localhost:2222  # Vite dev server  
⚙️  Database:  Direct Supabase connection # Real-time via triggers + Edge Functions
```

### Package Managers

Reigh supports both npm and bun package managers:
- **npm**: Default package manager with `package-lock.json`
- **bun**: Fast alternative with `bun.lock` (use `bun:dev`, `bun:build`, etc.)

---

## 📁 Directory Structure

### 🏗️ Top-Level Overview

| Path | Purpose | Key Files |
|------|---------|-----------|
| **`/src/app`** | App bootstrap & routing | `main.tsx`, `App.tsx`, `routes.tsx`, `Layout.tsx` |
| **`/src/pages`** | Top-level pages | `ToolSelectorPage`, `HomePage`, `ShotsPage`, etc. |
| **`/src/tools`** | Feature modules | Each tool has `pages/`, `components/`, `settings.ts` |
| **`/src/shared`** | Shared resources | UI components, hooks, contexts, utilities |
| **`/supabase/functions`** | Edge Functions | Task processing, payments, AI integration |
| **`/db`** | Database schema & seeding | `schema/schema.ts` (docs/types), `seed.ts` |
| **`/supabase`** | Supabase config | Edge Functions, migrations, CLI config |
| **`/public`** | Static assets | Images, fonts, manifests |
| **Root configs** | Build & tooling | `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `railway.toml` |

#### Supabase Client & Instrumentation (new modules)

```
src/integrations/supabase/
├── client.ts                                 # Orchestrator: logs, window-only installers, client creation, exports
├── config/
│   └── env.ts                                # Central env + feature flags (URLs, keys, instrumentation gates)
├── utils/
│   ├── safeStringify.ts                      # Cycle-safe JSON stringify for diagnostics
│   ├── snapshot.ts                           # captureRealtimeSnapshot, getEffectiveRealtimeSocket
│   └── timeline.ts                           # __CORRUPTION_TIMELINE__, addCorruptionEvent
└── instrumentation/
    ├── InstrumentationManager.ts             # Single point of control for all instrumentation
    ├── window/
    │   └── index.ts                          # WebSocket wrapper (delegates to InstrumentationManager)
    ├── realtime/
    │   └── index.ts                          # Realtime instrumentation (delegates to InstrumentationManager)
    └── README.md                             # Instrumentation documentation and usage guide
```

**Key Improvement**: Introduced `InstrumentationManager` as a single point of control for all instrumentation. This prevents multiple installs, overlapping logs, and provides unified diagnostics with configurable log verbosity. All existing instrumentation now delegates to the manager for centralized control.

### 📚 Detailed Documentation Links

| Topic | Documentation | Description |
|-------|---------------|-------------|
| **Database & Storage** | [`db_and_storage.md`](docs/structure_detail/db_and_storage.md) | Schema, migrations, RLS policies, storage buckets |
| **Persistence** | [`data_persistence.md`](docs/structure_detail/data_persistence.md) | State management & storage patterns |
| **Adding Tools** | [`adding_new_tool.md`](docs/structure_detail/adding_new_tool.md) | Step-by-step tool creation guide |
| **Design System** | [`design_motion_guidelines.md`](docs/structure_detail/design_motion_guidelines.md) | UI/UX standards & animations |
| **Shared Code** | [`shared_hooks_contexts.md`](docs/structure_detail/shared_hooks_contexts.md) | Reusable hooks & contexts catalog |

---

## 💻 Source Code Breakdown

### 🎯 Core Application (`/src/app/`)

```
src/app/
├── main.tsx          # React app entry point
├── App.tsx           # Global providers & app shell
├── routes.tsx        # Route definitions (React Router)
└── Layout.tsx        # Main layout with header & panes
```

#### Key Components

| Component | Purpose | Notable Features |
|-----------|---------|------------------|
| **`App.tsx`** | App root | QueryClient, DND setup, global toast |
| **`Layout.tsx`** | UI shell | GlobalHeader, sliding panes, responsive margins |
| **`routes.tsx`** | Routing | Tool routes, protected paths, 404 handling |

#### 🔧 Environment Variables

Configuration via environment variables for database, AI services, payments, and tool visibility. See `.env.example` for complete setup and [README.md](README.md) for configuration details.

#### ⚡ Edge Functions

Serverless functions handle AI processing, payments, and task management. For complete function reference and implementation details, see [`edge_functions.md`](docs/structure_detail/edge_functions.md).

---



### 📄 Top-Level Pages (`/src/pages/`)

| Page | Route | Description |
|------|-------|-------------|
| **ToolSelectorPage** | `/tools` | Grid of available tools (or `/` in non-web envs) |
| **HomePage** | `/` | Landing page (web env only) |
| **ShotsPage** | `/shots` | Project shots management |
| **GenerationsPage** | `/generations` | Media gallery with filtering (type/shot/search) & pagination |
| **PaymentSuccessPage** | `/payments/success` | Stripe payment confirmation |
| **PaymentCancelPage** | `/payments/cancel` | Stripe payment cancellation |

| **NotFoundPage** | `*` | 404 error handler |

---

### 🧩 Tool Modules (`/src/tools/`)

Each tool follows a consistent structure:

```
tool-name/
├── pages/          # Main tool UI
├── components/     # Tool-specific widgets
├── hooks/          # Custom hooks (optional)
└── settings.ts     # Config & defaults
```

#### Available Tools

| Tool | Status | Documentation | Key Features |
|------|--------|---------------|--------------|
| **Image Generation** | ✅ Active | [`tool_image_generation.md`](docs/structure_detail/tool_image_generation.md) | Multi-model generation (Wan 2.2, Qwen.Image), LoRA & style reference support |
| **Video Travel** | ✅ Active | [`tool_video_travel.md`](docs/structure_detail/tool_video_travel.md) | Frame-accurate timeline with dynamic spacing, batch processing, drag-and-drop shot reordering |
| **Edit Travel** | ⚠️ Hidden | [`tool_edit_travel.md`](docs/structure_detail/tool_edit_travel.md) | Text-guided transformations |
| **Training Data** | ⚠️ Hidden | [`tool_training_data_helper.md`](docs/structure_detail/tool_training_data_helper.md) | Video upload & segmentation |

### 🔄 Shared Elements (`/src/shared/`)

For the complete catalog, see [`shared_hooks_contexts.md`](docs/structure_detail/shared_hooks_contexts.md).

#### 🖼️ Image Gallery Features
- **Project-Aware Dimensions**: Gallery items automatically use project aspect ratio (16:9, 4:3, 9:16, etc.) instead of square layout for consistent visual presentation
- **Dual Add-to-Shot Options**: Images can be added to shots in two ways:
  - **With position** (main button): Adds image at the final position in the shot timeline
  - **Without position** (secondary button): Associates image with shot but without timeline position
- **Smart UI**: Secondary button appears as a smaller overlay in the top-right corner of the main button, with hover scaling and immediate tooltip hiding
- **State Management**: After adding, secondary button disappears and main button shows confirmation state

#### 🎨 Key Components

| Component | Purpose |
|-----------|---------|
| **ui/** | shadcn-ui primitives (button, dialog, etc.) |
| **LightboxScrubVideo** | Video player with auto-play and mouse scrubbing for lightbox usage |
| **MediaLightbox** | Modal lightbox for viewing media with task details and video scrubbing |
| **ToolSettingsGate** | Loading wrapper for settings hydration |
| **PaneHeader** | Consistent pane headers |
| **transitions/** | Fade animations (PageFadeIn, FadeInSection) |

#### 🪝 Essential Hooks

Shared hooks provide data management, state persistence, real-time updates, and UI utilities. Complete hook catalog with usage examples: [`shared_hooks_contexts.md`](docs/structure_detail/shared_hooks_contexts.md).

#### 🧮 Services & Utilities

| Service | Location | Purpose |
|---------|----------|---------|
| **edge functions** | `/supabase/functions/` | Task completion, post-execution billing, payments |
| **database triggers** | migr. SQL | Instant task processing, status broadcasts |
| **lib/** utilities | `/src/shared/lib/` | Image upload, auth, math helpers |

---

## 4. Task & Worker Lifecycle

Reigh uses an async task queue for AI workloads. For the complete flow diagram and implementation details, see [docs/structure_detail/task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md).

### External Workers
**Headless-Wan2GP** handles all AI processing tasks via GPU-accelerated Python environment. Supports local CUDA and cloud scaling. Complete setup and task flow details: [`task_worker_lifecycle.md`](docs/structure_detail/task_worker_lifecycle.md).

## 5. Development Workflow

### Debug Logging & Performance Profiling  
Reigh includes environment-toggleable debug logging for performance monitoring and troubleshooting. Enable with `VITE_DEBUG_LOGS=true`. Complete setup and API reference: [`debug_logging.md`](docs/structure_detail/debug_logging.md).

See [README.md](README.md) for:
- Local environment setup (5-min quickstart)
- Development commands
- Mobile testing
- Troubleshooting

<div align="center">

**🎯 Quick Links**

[Back to Top](#-reigh-developer-onboarding) • [Add a Tool](docs/structure_detail/adding_new_tool.md) • [Database & Storage](docs/structure_detail/db_and_storage.md) • [Persistence](docs/structure_detail/data_persistence.md)

  </div>

---

## 🔄 Recent Updates

### Polling Intervals and Resurrection Logic Standardization (2024)

All polling intervals across the codebase have been standardized to use the `useResurrectionPolling` system:

**✅ Standardized Hooks:**
- `usePaginatedTasks` - Now uses standardized polling with activity detection for Processing filters
- `useTaskStatusCounts` - Migrated from static 5s interval to network-aware polling  
- `useProjectVideoCountsCache` - Migrated from static 60s interval to network-aware polling
- `useGenerations`, `useUnifiedGenerations` - Already using standardized system

**🎯 Key Benefits:**
- **Network Awareness**: All polling respects `NetworkStatusManager` for slow connections
- **Visibility Management**: Polling adapts when tabs are hidden via `VisibilityManager`
- **Jitter**: Prevents thundering herd problems with randomized intervals
- **Healing Window Respect**: All polling pauses during tab reactivation healing periods
- **Consistent Logging**: Unified debug tags and context for polling decisions

**🔧 Implementation Details:**
- `useStandardizedPolling()` wrapper provides simple static intervals with network awareness
- `useResurrectionPollingConfig()` provides full resurrection logic for complex data
- All custom polling logic replaced with standardized approach
- No more ad-hoc intervals that conflict with resume timing