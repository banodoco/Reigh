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
| **Double-Tap Pattern** | [double-tap-selection-pattern.md](docs/double-tap-selection-pattern.md) | Mobile/tablet double-tap detection pattern with instant selection feedback |
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
| **Shot Generation Data Flow** | See "Data Flow Architecture" section below | How shot image data flows from database to UI components |

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
| **`Layout.tsx`** | UI shell | GlobalHeader, sliding panes, responsive margins, social icons footer |
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
| **HomePage** | `/` | Landing page (web env only) with hero section and Banodoco logo linking to banodoco.ai |
| **ShotsPage** | `/shots` | Project shots management |
| **GenerationsPage** | `/generations` | Media gallery with filtering (type/shot/search) & pagination |
| **SharePage** | `/share/:shareId` | Public page for shared generations with video preview, input images, settings display, and "Copy to My Account" CTA |
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
| **Animate Characters** | ✅ Active | - | Motion transfer from reference videos to static images |
| **Join Clips** | ✅ Active | - | AI-generated transitions between two video clips with LoRA support |
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
| **SocialIcons** | GitHub and Discord social links displayed in footer on all pages |
| **transitions/** | Fade animations (PageFadeIn, FadeInSection) |

#### 🪝 Essential Hooks

Shared hooks provide data management, state persistence, real-time updates, and UI utilities. Complete hook catalog with usage examples: [`shared_hooks_contexts.md`](docs/structure_detail/shared_hooks_contexts.md).

#### 🧮 Services & Utilities

| Service | Location | Purpose |
|---------|----------|---------|
| **edge functions** | `/supabase/functions/` | Task completion, post-execution billing, payments |
| **database triggers** | migr. SQL | Instant task processing, status broadcasts |
| **lib/** utilities | `/src/shared/lib/` | Image/video upload (`imageUploader.ts`, `videoUploader.ts`), auth, math helpers, task creation patterns, reference image recropping (`recropReferences.ts`), generation transformers (`generationTransformers.ts`), URL resolution (`imageUrlResolver.ts`) |
| **lib/tasks/** | `/src/shared/lib/tasks/` | Task creation utilities for specific task types: `imageUpscale.ts`, `imageInpaint.ts` |

---

## 3.5. Data Flow Architecture: Shot Generations

### Overview
Shot generation data flows from the database through React Query hooks to UI components. This architecture ensures a single source of truth for image data, metadata (including pair prompts), and timeline positions.

### Key Types

**`GenerationMetadata`** (`src/types/shots.ts`)
- Single source of truth for all shot_generation metadata
- Contains pair prompts, enhanced prompts, and timeline positioning data
- Fields:
  - `pair_prompt`, `pair_negative_prompt` - Prompts for video generation pairs
  - `enhanced_prompt` - AI-enhanced version of base prompt
  - `frame_spacing`, `is_keyframe`, `locked`, etc. - Timeline positioning metadata

**`GenerationRow`** (`src/types/shots.ts`)
- Base type for all generation data throughout the app
- Used in galleries, lightboxes, shot managers
- Includes optional `metadata: GenerationMetadata`

**`TimelineGenerationRow`** (`src/types/shots.ts`)
- Extends `GenerationRow` with required fields for timeline display
- Guarantees `timeline_frame: number` and `metadata: GenerationMetadata` are present
- Use when you need type-safe access to pair prompts or timeline positions

### Data Loading Hooks

**`useAllShotGenerations(shotId, options?)`** (`src/shared/hooks/useShotGenerations.ts`)
- **Primary data source** for shot images
- Loads ALL shot_generations (positioned + unpositioned) with full metadata
- Returns `GenerationRow[]`
- Use cases: galleries, lightboxes, shot image management
- Options:
  - `disableRefetch: boolean` - Prevents refetching during drag/persist operations

**`useTimelineShotGenerations(shotId, options?)`** (`src/shared/hooks/useShotGenerations.ts`)
- **Timeline-specific wrapper** around `useAllShotGenerations`
- Filters to only positioned images with metadata
- Returns `TimelineGenerationRow[]` (stronger type guarantees)
- Use cases: Timeline display, pair prompt reading
- Automatically filters out:
  - Unpositioned images (`timeline_frame == null`)
  - Images without metadata (`metadata == null`)

### Type Guards

**`isTimelineGeneration(gen)`** (`src/shared/lib/typeGuards.ts`)
- Runtime check + TypeScript type narrowing
- Ensures both `timeline_frame` and `metadata` are present
- Example:
  ```typescript
  const timelineImages = allImages.filter(isTimelineGeneration);
  // TypeScript now knows timelineImages have metadata
  timelineImages.forEach(img => {
    console.log(img.metadata.pair_prompt); // No type error!
  });
  ```

### Data Flow Diagram

```
Database (shot_generations table)
  ↓
useAllShotGenerations (loads all with metadata)
  ↓
  ├─→ Galleries / Lightboxes (GenerationRow[])
  ├─→ Shot Image Manager (GenerationRow[])
  └─→ useTimelineShotGenerations (filters + types)
       ↓
       Timeline Components (TimelineGenerationRow[])
         ↓
         Pair Prompts Display
```

### Best Practices

1. **Use `useAllShotGenerations` by default** - It's the single source of truth
2. **Use `useTimelineShotGenerations` for timeline UI** - Provides type safety for metadata access
3. **Never cast metadata with `as any`** - Use proper types instead
4. **Use type guards for filtering** - `isTimelineGeneration` provides both runtime check and type narrowing
5. **Metadata is always loaded** - Both hooks fetch the full metadata field from the database

### Common Patterns

**Reading pair prompts in Timeline:**
```typescript
const { data: timelineImages } = useTimelineShotGenerations(shotId);
// Type-safe access (no 'as any' needed)
const pairPrompt = timelineImages?.[0]?.metadata.pair_prompt || '';
```

**Filtering positioned images:**
```typescript
const { data: allImages } = useAllShotGenerations(shotId);
const timelineImages = allImages?.filter(isTimelineGeneration) || [];
// timelineImages is now TimelineGenerationRow[]
```

**Updating pair prompts:**
```typescript
// Update via shot_generations table
await supabase
  .from('shot_generations')
  .update({ 
    metadata: { 
      ...existing.metadata, 
      pair_prompt: newPrompt 
    } 
  })
  .eq('id', shotGenerationId);

// Invalidate cache to trigger refetch
queryClient.invalidateQueries(['unified-generations', 'shot', shotId]);
```

---

## 4. Task & Worker Lifecycle

Reigh uses an async task queue for AI workloads. For the complete flow diagram and implementation details, see [docs/structure_detail/task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md).

### Task Types & Content Classification

The `task_types` table includes a `content_type` field that classifies tasks by their output:
- **`image`**: Tasks that produce image content (single_image, image_edit, etc.)
- **`video`**: Tasks that produce video content (travel_stitch, travel_orchestrator, etc.)  
- **`NULL`**: Tasks that don't produce direct content output (lora_training, utility tasks)

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

### iPad Timeline Interaction & Tablet Mode Support (October 21, 2025)

**Added**: iPad/tablet users can now use timeline mode and interact with timeline items using tap-to-select and tap-to-place instead of drag-and-drop.

**Changes Made:**
- **Tablet Detection**: Added comprehensive tablet detection (iPad, Android tablets) in both `ShotEditor` and `TimelineContainer` components
  - Detects iPadOS 13+ (which masquerades as Mac)
  - Width-based detection (768px-1024px) with touch capability checks
- **Timeline Mode on Tablets**: iPad users can now select between Timeline and Batch generation modes (previously forced to Batch)
  - Modified `isPhone` logic to distinguish tablets from phones
  - Updated `modeCorrect` validation to allow timeline mode on tablets
- **Tap-to-Move Interaction**: New `useTapToMove` hook (`src/tools/travel-between-images/components/Timeline/hooks/useTapToMove.ts`) for tablet-friendly timeline item repositioning
  - First tap: Selects item with blue glow border and "Tap timeline to place" indicator
  - Second tap on timeline: Moves item to tapped location using fluid timeline logic
  - Tap same item again: Deselects without moving
  - Auto-deselect after 30 seconds
  - Crosshair cursor when item selected
- **Visual Feedback**: Enhanced `TimelineItem` with selection state indicators
  - Blue glowing border around selected items
  - Animated pulsing badge overlay
  - Scaled up appearance (1.15x) for selected state
- **Fluid Timeline Integration**: Tap-to-move uses same `applyFluidTimeline` logic as drag system to ensure proper spacing and conflict resolution
- **Desktop Unaffected**: All changes only apply to tablets; desktop drag-and-drop and phone lightbox tap behavior unchanged

**Usage**: iPad users can now work efficiently with the timeline view using intuitive tap-based interactions instead of struggling with touch-based drag-and-drop.

### Mobile UX & Timeline Position Refactor (October 21, 2025)

**Fixed**: TasksPane on mobile/iPad no longer triggers accidental clicks on pane content during slide-in animation.

**Changes Made:**
- **TasksPane Touch Fix**: Modified `TasksPane.tsx` to conditionally apply `pointer-events` based on `isOpen` state, preventing interaction with sliding content during transitions
- **Timeline Position Persistence**: Refactored position handling in `useGenerationActions.ts`:
  - Extracted database position persistence logic into dedicated `persistTimelinePositions()` helper in `timelineDropHelpers.ts`
  - Consolidated duplicate position-writing code between timeline drops and batch drops
  - Added extensive debug logging with `[BatchDropPositionIssue]` tag for troubleshooting
- **Generation Transformers**: New `src/shared/lib/generationTransformers.ts` utility for consistent transformation of raw shot_generation records to Timeline format
- **Image Inpaint Support**: 
  - New task type `image-inpaint` with category `inpaint` for AI-powered image inpainting
  - Task creation utility in `src/shared/lib/tasks/imageInpaint.ts`
  - Enhanced `complete_task` Edge Function to handle inpaint tasks with lineage tracking via `based_on` field
  - Migration `20251021000003_add_image_inpaint_task_type.sql`
- **Task Category Updates**: Changed `image-upscale` task category from `processing` to `upscale` for better organization

**Usage**: Mobile users can now tap the TasksPane tab without accidentally triggering buttons inside the pane. Timeline position handling is more reliable with consistent database persistence.

### Image Upscale Feature (October 2025)

**Added**: AI-powered image upscaling directly from MediaLightbox with toggle between original and upscaled versions.

**Changes Made:**
- **Database Schema**: Added `upscaled_url` column to `generations` table to store upscaled image URLs
- **New Task Type**: Created `image-upscale` task type with category `processing`, per-unit billing at $0.0015 per upscale
- **Task Creation Utility**: New `src/shared/lib/tasks/imageUpscale.ts` for creating upscale tasks with generation linking
- **MediaLightbox Enhancement**: 
  - Added upscale button (ArrowUpCircle icon) to top controls in all layouts (desktop, mobile, task details)
  - Automatic prioritization of upscaled image when available
  - Toggle button (Eye/EyeOff icons) to switch between original and upscaled versions
  - Upscale button shows loading state during task creation
- **Task Completion Handler**: Extended `complete_task` Edge Function to update `generations.upscaled_url` when image-upscale tasks complete
- **Migrations**: 
  - `20251021000001_add_upscaled_url_to_generations.sql` - Adds upscaled_url column with index
  - `20251021000002_add_image_upscale_task_type.sql` - Registers image-upscale task type
- **Universal Upscale URL Prioritization**: 
  - New `src/shared/lib/imageUrlResolver.ts` utility for consistent URL resolution across codebase
  - VideoTravelToolPage now sends upscaled images (when available) for video generation tasks
  - MediaLightbox edit mode automatically uses upscaled images as source for higher quality edits
  - All task creation now queries `upscaled_url` from database and prioritizes it

**Usage**: Click upscale button on any image in MediaLightbox → task created → upscaled image appears when complete → toggle between versions with eye icon. Upscaled images are automatically used as high-quality inputs for subsequent video generation and editing tasks.

### Project Settings Isolation Fix (2024)

**Fixed**: PromptEditorModal AI settings no longer leak between projects when creating new projects.

**Changes Made:**
- **Enhanced Project Settings Inheritance**: Modified `ProjectContext.tsx` to filter out prompt-editor specific settings (`generationSettings`, `bulkEditSettings`, `activeTab`) and any keys containing "prompt" when copying settings from current project to new project
- **Disabled AI Settings Persistence**: Temporarily disabled `usePersistentToolState` persistence for PromptEditorModal AI generation settings to prevent cross-project contamination
- **Project Change Detection**: Added automatic reset of AI generation controls to defaults when switching projects
- **Comprehensive Filtering**: Ensures new projects start with clean state instead of inheriting AI prompt generation settings, temperatures, model selections, and other AI-related details from previous projects

**Impact**: New projects now start with clean AI generation state, preventing confusion and ensuring each project has its own isolated prompt generation context.

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