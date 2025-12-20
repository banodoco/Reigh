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
  - [3.5. Data Flow Architecture](#35-data-flow-architecture-shot-generations)
  - [3.6. Centralized Systems](#36-centralized-systems--utilities)
- [Design & Motion Guidelines](#design--motion-guidelines)

## Quick Reference: Sub-Documentation

| Topic | File | Description |
|-------|------|-------------|
| **Development Setup** | [README.md](README.md) | Local environment setup, commands, troubleshooting |
| **Database & Storage** | [db_and_storage.md](docs/structure_detail/db_and_storage.md) | Schema map, migration workflow, storage buckets |
| **Deployment** | [deployment_and_migration_guide.md](docs/structure_detail/deployment_and_migration_guide.md) | Safe database migrations and Edge Function deployment workflow |
| **Data Persistence** | [data_persistence.md](docs/structure_detail/data_persistence.md) | State management patterns, hooks, storage layers |
| **Settings System** | [settings_system.md](docs/structure_detail/settings_system.md) | Settings priority (shot→project→user→defaults), inheritance, persistence mechanisms |
| **Task System** | [task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md) | Async task queue, worker polling, Edge Functions |
| **Unified Task Creation** | [unified_task_creation.md](docs/structure_detail/unified_task_creation.md) | Client-side task creation pattern, migration guide, authentication flow |
| **Edge Functions** | [edge_functions.md](docs/structure_detail/edge_functions.md) | Complete serverless function reference and API details |
| **Adding Tools** | [adding_new_tool.md](docs/structure_detail/adding_new_tool.md) | Step-by-step guide for new tool modules |
| **Design Standards** | [design_motion_guidelines.md](docs/structure_detail/design_motion_guidelines.md) | UI/UX patterns, motion, accessibility, mobile touch interactions |
| **Performance System** | [performance_system.md](docs/structure_detail/performance_system.md) | Frame budget monitoring, time-slicing, image loading optimization, callback stability |
| **Shared Code** | [shared_hooks_contexts.md](docs/structure_detail/shared_hooks_contexts.md) | Reusable hooks, contexts, components catalog (includes variant-based detail components) |
| **Realtime Architecture** | [realtime_system.md](docs/structure_detail/realtime_system.md) | Implemented unified realtime system and usage guide |
| **Tool: Image Gen** | [tool_image_generation.md](docs/structure_detail/tool_image_generation.md) | Multi-model image generation (Wan 2.2, Qwen.Image), LoRA support, resource-based style reference system (bulk migrated), inline AI prompt editing |
| **Tool: Video Travel** | [tool_video_travel.md](docs/structure_detail/tool_video_travel.md) | Frame-accurate video generation workflow, shot reordering, mobile video preloading, video gallery with hover-to-play |
| **Image Loading System** | [image_loading_system.md](docs/structure_detail/image_loading_system.md) | Progressive loading, device-adaptive batching, adjacent page preloading, performance optimization |
| **Auto-Top-Up System** | [auto_topup_system.md](docs/structure_detail/auto_topup_system.md) | Credit purchases, auto-top-up setup, Stripe integration, database triggers |
| **Debugging** | [debugging.md](docs/structure_detail/debugging.md) | CLI (`debug.py`), `system_logs` table, frontend logging, SQL queries |
| **Referral System** | [referral_system.md](docs/structure_detail/referral_system.md) | Referral tracking with username-based links, visitor attribution, secure conversion handling |
| **Debug Logging** | [debug_logging.md](docs/structure_detail/debug_logging.md) | PerfDebug log helpers & profiling |
| **Modal Styling System** | [modal_styling_system.md](docs/structure_detail/modal_styling_system.md) | Unified responsive modal system for both mobile and desktop, positioning, safe area handling |
| **Railway Deployment** | `railway.toml`, `nixpacks.toml`, `.dockerignore` | Optimized Railway deployment config: npm-based builds, excludes node_modules/bun.lock/dist from Docker context for faster builds (~60-90s improvement) |
| **Instrumentation System** | [instrumentation/README.md](src/integrations/supabase/instrumentation/README.md) | Centralized instrumentation management, diagnostics, and debugging tools |
| **Shot Generation Data Flow** | See "Data Flow Architecture" section below | How shot image data flows from database to UI components |
| **Resource Pagination** | See `useResources.ts` | Client-side pagination implementation for resources >1000 items to bypass Supabase API limits |

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
| **Root configs** | Build & tooling | `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `railway.toml`, `nixpacks.toml`, `.dockerignore` |

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
| **Image Generation** | ✅ Active | [`tool_image_generation.md`](docs/structure_detail/tool_image_generation.md) | Multi-model image generation (Wan 2.2, Qwen.Image), LoRA & resource-based style reference support |
| **Video Travel** | ✅ Active | [`tool_video_travel.md`](docs/structure_detail/tool_video_travel.md) | Frame-accurate timeline with dynamic spacing, batch processing, drag-and-drop shot reordering |
| **Animate Characters** | ✅ Active | - | Motion transfer from reference videos to static images |
| **Edit Images** | ✅ Active | - | Transform and edit images directly with inpainting and magic edit |
| **Join Clips** | ✅ Active | - | AI-generated transitions between two video clips with LoRA support |

### 🔄 Shared Elements (`/src/shared/`)

For the complete catalog, see [`shared_hooks_contexts.md`](docs/structure_detail/shared_hooks_contexts.md).

#### 🖼️ Image Gallery Features
- **Unified Component**: Single `ImageGallery` component (previously split between standard and optimized variants)
  - Location: `src/shared/components/ImageGallery/index.tsx`
  - Consolidated filtering, state management, and display logic
  - Used across all tools: Image Generation, Edit Travel, Character Animate, Join Clips, Video Travel
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
| **ConstellationCanvas** | Animated starfield background with gentle pulsing stars; features a warm orange-coral Claude Star in the upper-right quadrant |
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
| **edge functions** | `/supabase/functions/` | Task completion, post-execution billing, payments, video trimming (`trim-video`) |
| **database triggers** | migr. SQL | Instant task processing, status broadcasts |
| **lib/** utilities | `/src/shared/lib/` | Image/video upload (`imageUploader.ts`, `videoUploader.ts`), auth, math helpers, task creation patterns, reference image recropping (`recropReferences.ts`), generation transformers (`generationTransformers.ts` - computes `urlIdentity`/`thumbUrlIdentity` for stable caching), URL resolution (`imageUrlResolver.ts`) |
| **lib/tasks/** | `/src/shared/lib/tasks/` | Task creation utilities: `imageGeneration.ts`, `magicEdit.ts`, `imageInpaint.ts`, `annotatedImageEdit.ts`, `imageUpscale.ts`, `travelBetweenImages.ts`, `joinClips.ts`, `characterAnimate.ts`, `individualTravelSegment.ts` |

---

### 🔧 Centralized Systems & Utilities

Single sources of truth for consistency. See [`settings_system.md`](docs/structure_detail/settings_system.md) and [`performance_system.md`](docs/structure_detail/performance_system.md) for detailed guides.

| System | Location | Purpose | Key Functions |
|--------|----------|---------|---------------|
| **debugConfig** | `lib/debugConfig.ts` | Centralized debug logging control. Runtime control at `window.debugConfig` | `isEnabled(category)`, `enable/disable(category)`, `setQuietMode()`, `conditionalLog()`, `throttledLog()` |
| **settingsResolution** | `src/shared/lib/settingsResolution.ts` | Settings priority: shot → project → user → defaults. See [settings_system.md](docs/structure_detail/settings_system.md) | `resolveSettingField<T>(field, sources)`, `resolveGenerationMode(sources)` |
| **shotSettingsInheritance** | `src/shared/lib/shotSettingsInheritance.ts` | Standardized new shot settings (localStorage → DB fallback). See [settings_system.md](docs/structure_detail/settings_system.md) | `inheritSettingsForNewShot({ newShotId, projectId, shots })` |
| **toastThrottle** | `lib/toastThrottle.ts` | Prevents notification spam (500ms errors, 1000ms others) | `throttledToast.error/info/warning(msg)`, `debouncedTaskUpdateToast()` |
| **taskConfig** | `lib/taskConfig.ts` | Task visibility & metadata registry. Categories: orchestration, generation, processing (hidden), utility (hidden) | `isTaskVisible(type)`, `getTaskDisplayName(type)`, `filterVisibleTasks(tasks)` |
| **performanceUtils** | `src/shared/lib/performanceUtils.ts` | 16ms frame budget monitoring & time-slicing. See [performance_system.md](docs/structure_detail/performance_system.md) | `performanceMonitoredTimeout()`, `processArrayTimeSliced()`, `PerformanceBudget`, `measureAsync()` |
| **imageLoadingPriority** | `src/shared/lib/imageLoadingPriority.ts` | Progressive loading with device-adaptive batching (2-4 initial, auto-adjusts delays). See [image_loading_system.md](docs/structure_detail/image_loading_system.md) | `getImageLoadingStrategy(index, config)`, `getUnifiedBatchConfig(isMobile)`, `trackImageLoadTime()` |
| **queryKeys** | `lib/queryKeys.ts` | Standardized React Query key construction | `unifiedGenerationsProjectKey()`, `unifiedGenerationsShotKey()` |
| **Realtime System** | `providers/`, `realtime/` | Smart polling + realtime updates. See [`realtime_system.md`](docs/structure_detail/realtime_system.md) | `SimpleRealtimeProvider`, `SimpleRealtimeManager`, `DataFreshnessManager` |

**Debug Categories:** `reactProfiler`, `renderLogging`, `progressiveImage`, `imageLoading`, `shotImageDebug`, `autoplayDebugger`, `tasksPaneDebug`, `dragDebug`, `skeletonDebug`, `videoDebug`, `realtimeDebug`, `reconnectionDebug`

**Settings Inheritance Priority:** localStorage (project) → localStorage (global for first shot) → Database (latest shot) → Database (project defaults). **[Full guide: settings_system.md](docs/structure_detail/settings_system.md)**

**Realtime Polling Strategy:** Connected & stable (no polling) → Recently connected (30s) → Disconnected (15s) → Error (60s)

---

#### 📦 Storage Path Structure

All files in the `image_uploads` bucket follow a user-namespaced structure for security and easy data management:

```
{userId}/
  uploads/           # All media files (images + videos)
    {timestamp}-{random}.{ext}
  thumbnails/        # All generated thumbnails
    thumb_{timestamp}_{random}.jpg
  tasks/             # Task/worker outputs via pre-signed URLs
    {taskId}/
      {filename}
      thumbnails/
        {filename}
```

**Key Principles:**
- **User isolation**: Every file path starts with `{userId}/` for security and GDPR compliance
- **Consistent structure**: All client uploads → `uploads/`, all thumbnails → `thumbnails/`
- **Task outputs**: Workers use pre-signed URLs via `generate-upload-url` edge function → `tasks/{taskId}/`

**Upload Utilities:**
| Utility | Location | Output Path |
|---------|----------|-------------|
| `uploadImageToStorage()` | `imageUploader.ts` | `{userId}/uploads/...` |
| `uploadVideoToStorage()` | `videoUploader.ts` | `{userId}/uploads/...` |
| `uploadImageWithThumbnail()` | `clientThumbnailGenerator.ts` | `{userId}/uploads/...` + `{userId}/thumbnails/...` |
| `complete_task` (MODE 1) | Edge function | `{userId}/uploads/...` |
| `generate-upload-url` | Edge function | `{userId}/tasks/{taskId}/...` |

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

**`GeneratedImageWithMetadata`** (`src/shared/components/ImageGallery/types.ts`)
- UI-layer type returned by `transformGeneration()` in `generationTransformers.ts`
- Includes `urlIdentity` and `thumbUrlIdentity` fields - URL paths without query params for stable comparison
- **Why?** Supabase signed URLs have rotating tokens; identity fields prevent unnecessary re-renders/reloads when only tokens change

**`TimelineGenerationRow`** (`src/types/shots.ts`)
- Extends `GenerationRow` with required fields for timeline display
- Guarantees `timeline_frame: number` and `metadata: GenerationMetadata` are present
- Use when you need type-safe access to pair prompts or timeline positions

### Data Loading Hooks

**`useAllShotGenerations(shotId, options?)`** (`src/shared/hooks/useShotGenerations.ts`)
- **Primary data source** for shot images
- **Two-phase loading architecture** for optimal performance:
  - **Phase 1 (Fast)**: Queries `generations` table with `shot_data` JSONB filter (no joins) - provides instant display
  - **Phase 2 (Lazy)**: Queries `shot_generations` table for metadata and mutation IDs - enables edit operations
  - Images display immediately from Phase 1; Phase 2 loads in background
- Loads ALL shot_generations (positioned + unpositioned) with full metadata
- Returns `GenerationRow[]` with progressive enhancement (Phase 1 data → Phase 1+2 merged)
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

**`useTimelinePositionUtils(options)`** (`src/shared/hooks/useTimelinePositionUtils.ts`)
- **Utility hook for timeline position management** without full `useEnhancedShotPositions` overhead
- Designed for components that already have generation data and only need position utilities
- Provides: `shotGenerations`, `updateTimelineFrame`, `batchExchangePositions`, `initializeTimelineFrames`, `loadPositions`, `pairPrompts`, `isLoading`
- Use cases: Timeline components with pre-loaded data (from two-phase loading), avoiding duplicate data fetching
- Options:
  - `shotId: string | null` - Shot ID to manage positions for
  - `generations: GenerationRow[]` - Pre-loaded generation data to use (avoids duplicate queries)

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
Database
  ├─→ Phase 1: generations table (shot_data JSONB filter)
  │   ↓
  │   Fast query (no joins) → Instant image display
  │
  └─→ Phase 2: shot_generations table (metadata join)
      ↓
      Lazy query → Mutation IDs + Metadata
      
useAllShotGenerations (two-phase loading + merge)
  ↓
  ├─→ Galleries / Lightboxes (GenerationRow[])
  ├─→ Shot Image Manager (GenerationRow[])
  ├─→ ImageGallery (unified component)
  └─→ useTimelineShotGenerations (filters + types)
       ↓
       Timeline Components (TimelineGenerationRow[])
         ↓
         useTimelinePositionUtils (position management)
           ↓
           Pair Prompts Display
```

### Cache Management & Query Invalidation

**Centralized Cache Invalidation** (`src/shared/hooks/useGenerationInvalidation.ts`)

Reigh uses a centralized approach to cache invalidation to ensure consistency and prevent stale data:

```typescript
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';

const invalidateGenerations = useInvalidateGenerations();

// Basic usage - invalidate all generation-related caches for a shot
invalidateGenerations(shotId, { 
  reason: 'delete-image',  // Always include reason for debugging
});

// Scoped invalidation - only specific query types
invalidateGenerations(shotId, { 
  reason: 'metadata-update',
  scope: 'metadata'  // Options: 'all' | 'images' | 'metadata' | 'counts' | 'unified'
});

// Include related queries
invalidateGenerations(shotId, { 
  reason: 'thumbnail-change',
  includeShots: true,  // Also invalidate shots list
  projectId: projectId
});
```

**Invalidation Scopes:**
- `'all'` (default): All generation-related queries for a shot
- `'images'`: Just image data (all-shot-generations, shot-generations)
- `'metadata'`: Just metadata (shot-generations-meta)
- `'counts'`: Just counts (unpositioned-count)
- `'unified'`: Just unified-generations queries

**Non-hook version** for use outside React components:
```typescript
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';

invalidateGenerationsSync(queryClient, shotId, { reason: 'realtime-update' });
```

**Query Presets** (`src/shared/lib/queryDefaults.ts`)

Reigh standardizes React Query configurations with preset stale times and refetch behaviors:

```typescript
import { QUERY_PRESETS } from '@/shared/lib/queryDefaults';

// For data updated by realtime or mutations
useQuery({
  ...QUERY_PRESETS.realtimeBacked,  // staleTime: 30s, refetchOnMount: false
  queryKey: ['shot-data', shotId],
  // ...
});

// For static reference data
useQuery({
  ...QUERY_PRESETS.staticReference,  // staleTime: 5min, no background refetch
  queryKey: ['loras'],
  // ...
});

// For data that changes frequently
useQuery({
  ...QUERY_PRESETS.frequentlyChanging,  // staleTime: 5s, smart refetch
  queryKey: ['task-status', taskId],
  // ...
});
```

Available presets: `realtimeBacked`, `staticReference`, `frequentlyChanging`, `userSettings`

### Optimistic Updates Pattern

For immediate UI feedback, Reigh uses optimistic updates in mutations. Key patterns:

**Basic Optimistic Update** (e.g., `useAddImageToShot`):
```typescript
useMutation({
  mutationFn: async (variables) => { /* DB operation */ },
  
  onMutate: async (variables) => {
    // 1. Cancel outgoing queries to prevent overwriting optimistic update
    await queryClient.cancelQueries({ queryKey: ['all-shot-generations', shotId] });
    
    // 2. Snapshot previous data for rollback
    const previousData = queryClient.getQueryData(['all-shot-generations', shotId]);
    
    // 3. Optimistically update cache
    queryClient.setQueryData(['all-shot-generations', shotId], (old) => [
      ...old,
      { id: tempId, ...newItem, _optimistic: true }  // Mark as optimistic
    ]);
    
    // 4. Return context for rollback
    return { previousData, tempId };
  },
  
  onError: (err, variables, context) => {
    // Rollback on error
    if (context?.previousData) {
      queryClient.setQueryData(['all-shot-generations', shotId], context.previousData);
    }
    toast.error('Operation failed');
  },
  
  onSuccess: (data, variables, context) => {
    // Replace optimistic item with real data
    queryClient.setQueryData(['all-shot-generations', shotId], (old) =>
      old.map(item => 
        item.id === context.tempId 
          ? { ...item, ...data, _optimistic: undefined }  // Merge real data
          : item
      )
    );
    
    // Invalidate for eventual consistency
    invalidateGenerations(shotId, { 
      reason: 'add-image-success',
      scope: 'metadata'  // Only refetch metadata if needed
    });
  }
});
```

**Key Principles:**
1. **Cancel in-flight queries** before optimistic update to prevent race conditions
2. **Always save previous state** for rollback on error
3. **Mark optimistic items** with `_optimistic: true` flag for debugging
4. **Replace, don't invalidate** - Replace optimistic items with real data in `onSuccess`
5. **Scoped invalidation** - Only invalidate what changed to minimize refetches
6. **Use refs in components** - Prevent callback recreation when query data changes reference

**Preventing Callback Recreation:**
```typescript
// ❌ Bad: Callback recreates every time queryData changes
const handleAdd = useCallback(() => {
  addMutation.mutate({ shotId, imageUrl });
}, [shotId, imageUrl, addMutation]);  // addMutation changes reference

// ✅ Good: Use refs for values, callbacks stay stable
const shotIdRef = useRef(shotId);
shotIdRef.current = shotId;
const addMutationRef = useRef(addMutation);
addMutationRef.current = addMutation;

const handleAdd = useCallback(() => {
  addMutationRef.current.mutate({ 
    shotId: shotIdRef.current, 
    imageUrl: imageUrlRef.current 
  });
}, []);  // Empty deps - callback never recreates
```

### Filtering State Management

**Stable Filter Pattern** (`useGenerationsPageLogic`)

To prevent filter flicker during navigation and data updates:

```typescript
// Use ref-based map to track filter state per shot
const filterStateMapRef = useRef<Map<string, { 
  filter: string;           // 'all' or shotId
  isUserOverride: boolean;  // true = user set explicitly
}>>(new Map());

// Preserve "all" filter when navigating between shots
const isNavigatingBetweenShots = previousShotId && currentShotId;
const previousWasAll = lastAppliedFilterRef.current === 'all';

if (isNavigatingBetweenShots && previousWasAll && !filterState.isUserOverride) {
  // Keep "all" to avoid flash from stale pre-computed stats
  filterToApply = 'all';
}

// Track which filters are user-set vs computed defaults
setFilterStateForShot(shotId, filter, isUserOverride);
```

**Key Techniques:**
- **Ref-based state tracking** - Avoid reactive flicker from state updates
- **User override detection** - Distinguish user choices from computed defaults
- **Navigation preservation** - Keep "all" filter across shot changes when appropriate
- **Pre-computed stats** - Use cached counts for instant skeleton display

### Best Practices

1. **Use `useAllShotGenerations` by default** - It's the single source of truth
2. **Use `useTimelineShotGenerations` for timeline UI** - Provides type safety for metadata access
3. **Never cast metadata with `as any`** - Use proper types instead
4. **Use type guards for filtering** - `isTimelineGeneration` provides both runtime check and type narrowing
5. **Metadata is always loaded** - Both hooks fetch the full metadata field from the database
6. **Centralize invalidation** - Always use `useInvalidateGenerations` with clear reasons
7. **Scope invalidation** - Only invalidate what changed to minimize refetches
8. **Use refs in callbacks** - Prevent callback recreation storms (see "Preventing Callback Recreation")
9. **Mark optimistic updates** - Use `_optimistic: true` flag for debugging
10. **Replace, don't refetch** - Update optimistic items with real data in `onSuccess` before invalidating

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

// Invalidate with proper scope and reason
invalidateGenerations(shotId, { 
  reason: 'pair-prompt-update',
  scope: 'metadata'  // Only metadata changed
});
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