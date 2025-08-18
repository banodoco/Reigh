# Reigh: Developer Onboarding

> **How to Use This Guide**  
> • Skim the Tech Stack & Directory tables below to orient yourself.  
> • Need implementation specifics? Follow the links to sub-docs in [structure_detail/](structure_detail/) (one file per topic).  
> • This guide documents the current architecture and setup, not historical changes or bug fixes. If you need to see change history, fetch git commits.
> • When in doubt, the source of truth is always the code – this guide just points you in the right direction.

> **When to Update This Guide & Sub-Docs**  
> • Create, delete, rename, or move any top-level directory, core config file, or critical script.  
> • Add, hide, deprecate, or significantly refactor a tool — also create/update its doc in `structure_detail/`.  
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
| **Database & Storage** | [db_and_storage.md](structure_detail/db_and_storage.md) | Schema map, migration workflow, storage buckets |
| **Data Persistence** | [data_persistence.md](structure_detail/data_persistence.md) | State management patterns, hooks, storage layers |
| **Task System** | [task_worker_lifecycle.md](structure_detail/task_worker_lifecycle.md) | Async task queue, worker polling, Edge Functions |
| **Adding Tools** | [adding_new_tool.md](structure_detail/adding_new_tool.md) | Step-by-step guide for new tool modules |
| **Design Standards** | [design_motion_guidelines.md](structure_detail/design_motion_guidelines.md) | UI/UX patterns, motion, accessibility, mobile touch interactions |
| **Shared Code** | [shared_hooks_contexts.md](structure_detail/shared_hooks_contexts.md) | Reusable hooks, contexts, components catalog |
| **Tool: Image Gen** | [tool_image_generation.md](structure_detail/tool_image_generation.md) | Wan-local image generation tool details |
| **Tool: Video Travel** | [tool_video_travel.md](structure_detail/tool_video_travel.md) | Frame-accurate video generation workflow |
| **Tool: Edit Travel** | [tool_edit_travel.md](structure_detail/tool_edit_travel.md) | Text-guided image transformations |
| **Tool: Training Data** | [tool_training_data_helper.md](structure_detail/tool_training_data_helper.md) | Training video upload & segmentation |
| **Debug Logging** | [debug_logging.md](structure_detail/debug_logging.md) | PerfDebug log helpers & profiling |
| **Component Modularization** | [component_modularization.md](structure_detail/component_modularization.md) | Guide for breaking down large components into maintainable modules |
| **Image Loading System** | [image_loading_system.md](structure_detail/image_loading_system.md) | Progressive loading, adjacent page preloading, performance optimization |
| **Mobile Video Toggle** | - | Mobile UI toggle functionality between MediaLightbox video playback and TaskDetailsModal for viewing generation parameters |
| **Railway Deployment** | [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md) | Complete Railway.com deployment guide |

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

### 📚 Detailed Documentation Links

| Topic | Documentation | Description |
|-------|---------------|-------------|
| **Database & Storage** | [`db_and_storage.md`](structure_detail/db_and_storage.md) | Schema, migrations, RLS policies, storage buckets |
| **Persistence** | [`data_persistence.md`](structure_detail/data_persistence.md) | State management & storage patterns |
| **Adding Tools** | [`adding_new_tool.md`](structure_detail/adding_new_tool.md) | Step-by-step tool creation guide |
| **Design System** | [`design_motion_guidelines.md`](structure_detail/design_motion_guidelines.md) | UI/UX standards & animations |
| **Shared Code** | [`shared_hooks_contexts.md`](structure_detail/shared_hooks_contexts.md) | Reusable hooks & contexts catalog |

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

See `.env.example` for all variables. Key ones:
- `VITE_APP_ENV`: Controls tool visibility & homepage
- `VITE_SUPABASE_*`: Database connection
- `VITE_FAL_PROXY_*`: AI service configuration
- `VITE_STRIPE_PUBLISHABLE_KEY`: Stripe frontend integration
- `STRIPE_SECRET_KEY`: Stripe server-side operations (Edge Functions)
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signature verification
- `FRONTEND_URL`: Payment redirect URLs

#### ⚡ Active Edge Functions

| Function | Purpose | Location |
|----------|---------|----------|
| `single-image-generate` | FAL image generation | `/supabase/functions/` |
| `steerable-motion` | Video generation | `/supabase/functions/` |
| `ai-prompt` | Prompt enhancement | `/supabase/functions/` |
| `calculate-task-cost` | Credit calculation | `/supabase/functions/` |
| ~~`process-completed-task`~~ | **REMOVED**: Replaced by SQL trigger `create_generation_on_task_complete` | ~~`/supabase/functions/`~~ |
| `stripe-checkout` | Stripe payment sessions | `/supabase/functions/` |
| `stripe-webhook` | Stripe payment webhooks | `/supabase/functions/` |

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
| **Image Generation** | ✅ Active | [`tool_image_generation.md`](structure_detail/tool_image_generation.md) | Wan-local generation, LoRA support |
| **Video Travel** | ✅ Active | [`tool_video_travel.md`](structure_detail/tool_video_travel.md) | Frame-accurate timeline with dynamic spacing, batch processing, drag-and-drop shot reordering |
| **Edit Travel** | ⚠️ Hidden | [`tool_edit_travel.md`](structure_detail/tool_edit_travel.md) | Text-guided transformations |
| **Training Data** | ⚠️ Hidden | [`tool_training_data_helper.md`](structure_detail/tool_training_data_helper.md) | Video upload & segmentation |

#### Recent Architecture Updates

**Generation Method Preferences (Latest):**
- **User Control**: Users can now choose whether to allow cloud processing, local processing, or both via Settings Modal
- **Database Storage**: Preferences stored in `users.settings.ui.generationMethods` (onComputer/inCloud booleans)
- **Task Filtering**: `claim_next_task` Edge Function respects preferences:
  - Service role path (cloud): Only claims tasks from users who allow cloud processing (`inCloud: true`)
  - PAT path (local): Only claims tasks for users who allow local processing (`onComputer: true`)
- **Default Behavior**: Both options enabled by default for backward compatibility

**Task Queue Refactor:**
- **New Hook**: Added `useTaskQueueNotifier` to `src/shared/hooks/` for centralized task creation with realtime feedback
- **Enhanced UX**: Replaced individual `useCreateTask` patterns across Image Generation and Video Travel tools
- **Better Monitoring**: Added comprehensive debug logging throughout task lifecycle for improved troubleshooting
- **UI Improvements**: TasksPane now shows "Cancel All" button consistently (disabled when no cancellable tasks)

**Unified Generations System ✨ NEW:**
- **Problem**: ImageGallery and VideoOutputsGallery used incompatible data patterns causing reliability issues
- **Solution**: New `useUnifiedGenerations` hook serves both gallery types with consistent caching and realtime updates
- **Benefits**: Eliminates race conditions, reduces API calls, background task preloading, shared cache invalidation
- **Components**: Enhanced task display components (`SharedTaskDetails`, `TaskDetailsPanel`, `TaskDetailsModal`)

**Generation-Task Integration Bridge ✨ NEW:**
- **Problem**: Generation-to-task mapping logic duplicated across 6+ components (useGenerations, TaskDetailsModal, TaskItem, VideoOutputsGallery, etc.)
- **Solution**: Centralized `GenerationTaskBridge` utility with React context for seamless data integration
- **Features**: Batch task ID lookups, background preloading, cache management, bi-directional mapping (generation↔task)
- **Context**: `GenerationTaskProvider` with hooks for automatic preloading and enhanced data access

**React Hooks Stability Fixes ✨ NEW:**
- **Problem**: "Rendered more/fewer hooks than during the previous render" errors during fast navigation and window resizing
- **Root Cause**: Conditional hook execution in `ShotImageManager` (TouchSensor only called when `!isMobile`) and unstable function references
- **Solution**: Always call hooks in same order, use activation constraints to gate behavior instead of conditional execution
- **Key Fixes**: Stable `useSensor` calls, stable `onImageReorder` reference with useRef pattern, dependency array stabilization
- **Components**: Enhanced `ShotImageManager`, `ShotEditor`, and `useGenerationActions` for consistent hook execution

**Image Generation Form UX:**
- **Collapsible Form**: Image generation form can now be collapsed/expanded to save screen space
- **Persistent State**: Form expand/collapse state is saved per project via `usePersistentToolState`
- **Visual Design**: Collapsed state shows gradient button with animated sparkles, similar to AI Prompt section in PromptEditorModal
- **Sticky UI**: When collapsed, form toggle button sticks to top of screen while scrolling; clicking expands form and scrolls to it

---

**Service-Role Active Task Filtering (Latest):**
- New migration `20250808000001_filter_active_to_cloud_for_service_role.sql` refines how the service role counts active tasks.
- When `include_active=true` in service-role analysis/counts, only cloud-claimed In Progress tasks are included (identified by non-null `worker_id`). Local user-claimed tasks are excluded from this path.
- Introduced/updated SQL functions:
  - `count_eligible_tasks_service_role(p_include_active boolean)`
  - `analyze_task_availability_service_role(p_include_active boolean)`
- Rationale: Align service role scheduling with cloud capacity by excluding local runs from active task pressure.


### 🔄 Shared Elements (`/src/shared/`)

For the complete catalog, see [`shared_hooks_contexts.md`](structure_detail/shared_hooks_contexts.md).

#### 🎨 Key Components

| Component | Purpose |
|-----------|---------|
| **ui/** | shadcn-ui primitives (button, dialog, etc.) |
| **ToolSettingsGate** | Loading wrapper for settings hydration |
| **PaneHeader** | Consistent pane headers |
| **transitions/** | Fade animations (PageFadeIn, FadeInSection) |

#### 🪝 Essential Hooks

| Hook | Purpose | Usage |
|------|---------|-------|
| **useToolSettings** | Tool config management | Fetches & merges settings across scopes |
| **usePersistentState** | LocalStorage sync | Persists UI state locally |
| **useTasks** | Task queue | Real-time task status & updates |
| **useTaskQueueNotifier** | Centralized task creation | Unified task enqueueing with realtime feedback |
| **useWebSocket** | Real-time updates | Supabase broadcast subscriptions |

#### 🧮 Services & Utilities

| Service | Location | Purpose |
|---------|----------|---------|
| **edge functions** | `/supabase/functions/` | Task completion, cost calc, payments |
| **database triggers** | migr. SQL | Instant task processing, status broadcasts |
| **lib/** utilities | `/src/shared/lib/` | Image upload, auth, math helpers |

---

## 4. Task & Worker Lifecycle

Reigh uses an async task queue for AI workloads. For the complete flow diagram and implementation details, see [structure_detail/task_worker_lifecycle.md](structure_detail/task_worker_lifecycle.md).

### Headless-Wan2GP Worker (GPU / Cloud)
Headless-Wan2GP is the **primary worker responsible for _all_ AI tasks** — image & video generation, prompt enhancement, upscaling, stitching, and more. It polls the Supabase task queue and executes jobs in a GPU-accelerated Python environment.

- Runs locally on any CUDA-capable GPU or scales horizontally in cloud GPU instances.
- Setup & deployment guide: [Headless-Wan2GP GitHub](https://github.com/peteromallet/Headless-Wan2GP).
- Task flow details: see the [Task & Worker Lifecycle doc](structure_detail/task_worker_lifecycle.md).

## 5. Development Workflow

### Debug Logging & Performance Profiling  
Reigh has a lightweight, env-toggleable logging system you can turn on during any local run:

```bash
# One-shot
VITE_DEBUG_LOGS=true npm run dev

# Persistently for all dev runs
echo "VITE_DEBUG_LOGS=true" >> .env.local
```

When enabled, everything tagged `PerfDebug:*` appears in the browser console:

* **React render counts** – `useRenderLogger()` flags runaway re-renders.
* **Profiler timings** – global `<Profiler>` hooks into `logger.reactProfilerOnRender`.
* **Realtime connections** – Supabase broadcast message details.
* **WebSocket flush sizes** – see batched React-Query invalidations.

Full API & examples live in [debug_logging.md](structure_detail/debug_logging.md).

See [README.md](README.md) for:
- Local environment setup (5-min quickstart)
- Development commands
- Mobile testing
- Troubleshooting

---

<div align="center">

**🎯 Quick Links**

[Back to Top](#-reigh-developer-onboarding) • [Add a Tool](structure_detail/adding_new_tool.md) • [Database & Storage](structure_detail/db_and_storage.md) • [Persistence](structure_detail/data_persistence.md)

  </div>