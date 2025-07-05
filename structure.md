# Reigh: Developer Onboarding
This document is meant to sereve as a comprehensive view of Reigh's archtiecture. 

## 1. Tech Stack & Ports

### Core Technologies
- **Frontend**: Vite, React, TypeScript
- **Styling**: TailwindCSS, shadcn-ui (UI primitives)
- **State/Routing**: @tanstack/react-query (server state), react-router-dom (client routing)
- **Interactions**: @dnd-kit/core, @dnd-kit/sortable (drag-and-drop)
- **Notifications**: Sonner (custom toaster)
- **Backend & DB**: Supabase (Postgres DB, Storage, typed client), Express.js (Node.js API server), Hono (lightweight router for modular routes)
- **AI**: FAL-AI (image generation API)

### Ports
- Frontend (Vite): `2222`
- Backend (Express): `8085` (default, configurable via process.env.PORT)

## 2. Directory Structure (Top-Level)

| Path | Purpose |
|------|---------|
| `/src/app` | Core app setup (entry, providers, routing shell) |
| `/src/pages` | Top-level page components (Tool Selector, NotFound, etc.) |
| `/src/tools` | Tool-specific modules (Image Generation, Video Travel, Edit Travel) |
| `/src/shared` | Shared components, hooks, utils, contexts, layouts |
| `/src/shared/settings/userPreferences.ts` | User preference settings (last opened project, global user settings) stored in database |
| `/src/server` | Backend API server (Express.js); data access, background tasks |
| `/src/server/routes/apiKeys.ts` | API key management endpoint (GET, PUT /api/api-keys) for user API key storage |
| `/src/types` | Shared TS interfaces (incl. Supabase-generated DB types, env.ts) |
| `/src/integrations` | Supabase & FAL-AI client setup |
| `/public` | Static assets (favicons, SVGs, JSON) |
| `/supabase` | Supabase CLI/config |
| `/dist` | Build output (auto-generated) |
| Config files | vite.config.ts, tailwind.config.ts, tsconfig*.json, ESLint, etc. |
| `drizzle.config.ts` | Drizzle Kit config (PostgreSQL/Supabase). For PG migrations |
| `drizzle-sqlite.config.ts` | Drizzle Kit config (SQLite). For local SQLite migrations |
| `/db/schema/schema.ts` | Canonical DB schema (Drizzle ORM, PG-first). Users table includes api_keys JSON column for storing FAL/OpenAI/Replicate keys. Users, projects, and shots tables include settings JSON column for tool-specific settings |
| `/db/migrations/` | PostgreSQL migration files |
| `/db/migrations-sqlite/` | SQLite migration files |
| `/db/seed.ts` | Seeds local SQLite DB for development |
| `/src/lib/db/index.ts` | Runtime DAL: Exports Drizzle client (server-side, SQLite/PG) & Supabase JS client (client-side) |
| `/src/server/routes/singleImageGeneration.ts` | New route for single-image tasks (POST /api/single-image/generate). Queues `single_image` tasks mirroring Wan local image generation |
| **Supabase Edge Functions** | |
| `/supabase/functions/single-image-generate/` | Edge Function replacement for /api/single-image/generate. Creates `single_image` tasks for wan-local generation mode |
| `/supabase/functions/steerable-motion/` | Edge Function replacement for /api/steerable-motion/travel-between-images. Creates `travel_orchestrator` tasks for video generation |
| `/supabase/functions/generate-pat/` | Edge Function for generating personal access tokens (PAT) for local worker scripts |
| `/supabase/functions/revoke-pat/` | Edge Function for revoking personal access tokens |
| **API Endpoints** | |
| `POST /api/local-image-upload` | Upload single image files to server local storage |
| `POST /api/upload-flipped-image` | Upload processed (flipped) images from lightbox edit functionality |
| `PATCH /api/generations/:id` | Update generation location (used by horizontal flip save functionality) |
| `GET /api/tool-settings/resolve` | Resolve merged tool settings from user/project/shot scopes |
| `PATCH /api/tool-settings` | Update tool settings at specific scope |
| `GET /api/tool-settings/from-task/:taskId` | Extract tool settings from task parameters |

### DB Workflow (Drizzle ORM - SQLite & PostgreSQL)
1. **Schema**: `/db/schema/schema.ts` (Drizzle, PG-first)
2. **Migrations**: 
   - PostgreSQL: `npm run db:generate:pg`
   - SQLite: `npm run db:generate:sqlite`
3. **Apply Migrations**: 
   - PG: to Supabase (CLI/CI)
   - SQLite: auto on `npm run start:api`
4. **DAL Usage**: 
   - API server uses db from `/src/lib/db/index.ts` (Drizzle client)
   - Client-side uses db (Supabase JS client) or API calls
5. **Seeding**: `npm run db:seed:sqlite` (local SQLite)

### Database Security & Migration Strategy

**Current State**: The project uses a **dual migration system**:
- **Drizzle migrations** (`/db/migrations/`) for schema changes (tables, columns, indexes)
- **Supabase migrations** (`/supabase/migrations/`) for Supabase-specific features (RLS policies, storage bucket setup, triggers, functions)

**Row Level Security (RLS) Status**: ✅ **ACTIVE**
- All 8 main tables (`users`, `projects`, `shots`, `shot_generations`, `generations`, `resources`, `tasks`, `user_api_tokens`) have RLS enabled
- 18 security policies enforce strict data isolation:
  - Users can only access their own data
  - Task creation restricted to `service_role` (Edge Functions only)
  - Credit validation enforced at database level
  - API tokens can only be viewed by their owner

**Personal Access Tokens (PAT) System**: ✅ **IMPLEMENTED**
- **Purpose**: Allow users to run local worker scripts that process tasks without exposing elevated privileges
- **Architecture**: Long-lived JWTs signed with service role key that impersonate the user
- **Security**: 
  - Tokens honor all existing RLS policies
  - JTI hash stored for revocation
  - Expiry dates enforced
  - Last-used tracking
- **Components**:
  - `user_api_tokens` table: Stores token metadata (hash, label, expiry)
  - `generate-pat` Edge Function: Creates new tokens by signing JWTs with the project's JWT secret
  - `revoke-pat` Edge Function: Revokes existing tokens
  - `verify_api_token()` PostgreSQL function: Validates tokens at database level
  - `useApiTokens` hook: Client-side token management
  - Updated Settings Modal: Primary section for token management

**Migration Workflow**:

1. **Schema Changes** (tables, columns):
   ```bash
   # Update /db/schema/schema.ts
   npm run db:generate:pg          # Generate Drizzle migration
   # Apply via Drizzle or Supabase CLI
   ```

2. **RLS Policies, Functions, Triggers**:
   ```bash
   # Create file in /supabase/migrations/YYYYMMDD_description.sql
   supabase db push               # Apply to remote
   ```

3. **Important**: After manual RLS policy application (as done for the initial setup), future `supabase db push` commands should work normally. The migration history is now synchronized.

**Best Practices**:
- Keep schema definitions in Drizzle (`/db/schema/schema.ts`)
- Put RLS policies, custom functions, and triggers in Supabase migrations
- Test RLS policies thoroughly - they're your primary security layer
- Always verify policies are applied correctly in Supabase dashboard after deployment

**Security Notes**:
- **Task creation is locked down**: Only Edge Functions can create tasks, ensuring credit validation
- **Complete data isolation**: Users cannot access each other's data at the database level
- **Service role policies**: Edge Functions use `service_role` key for elevated database operations

### 3. Source Code Breakdown

#### 3.1. Core Application (`src/app/`)
- **main.tsx**: Mounts `<App/>`.
- **App.tsx**: Global providers (QueryClient, etc.). Renders AppInternalContent (DND setup, `<AppRoutes/>`, `<Sonner/>`).
- **routes.tsx**: App routing (createBrowserRouter). Root layout (`<Layout/>`) includes `<GlobalHeader/>`, `<Outlet/>`.
- **Layout.tsx**: Main layout: `<GlobalHeader/>`, `<Outlet/>`, `<TasksPane/>`, `<ShotsPane/>`, `<GenerationsPane/>`. Adjusts margins for locked panes.

##### Environment (`VITE_APP_ENV`):
- Controls tool visibility on ToolSelectorPage.tsx (dev, local, web). Default: web (when unset).
- Set in .env.local (root), restart Vite server after changes.
- `VITE_API_TARGET_URL`: Vite proxy target & client-side base URL for assets.
- Visibility logic: ToolSelectorPage.tsx filters tools array based on tool.environments (array of AppEnv from src/types/env.ts) matching VITE_APP_ENV. Modify environments array in ToolSelectorPage.tsx to change visibility.

##### Direct Supabase Usage:
- Projects management: `ProjectContext` now uses Supabase client directly instead of API calls
- Shots CRUD: `useShots` hooks use Supabase client for all operations (create, read, update, delete, reorder)
- Generations: Direct Supabase queries replace API endpoints
- User preferences: Last opened project is saved in user settings (database) instead of localStorage for cross-device persistence

##### Active Edge Functions:
- `single-image-generate`: Handles wan-local image generation tasks
- `steerable-motion`: Handles video travel generation tasks

##### Remaining Express Endpoints (to be migrated):
- `/api/tasks/*` - Task management (list, update status, cancel)
- `/api/tool-settings/*` - Tool settings resolution and updates
- `/api/api-keys` - API key storage (to be replaced with direct Supabase)
- `/api/resources` - User resources management
- `/api/local-image-upload` - Local file uploads

#### 3.2. Top-Level Pages (`src/pages/`)
- **ToolSelectorPage.tsx**: Grid of available tools. Accessible at `/tools` in all environments (and at `/` when VITE_APP_ENV is not 'web').
- **HomePage.tsx**: Landing page with "Reigh" title, tagline, example showcase, and philosophy section. Renders without header/layout. (Shown when VITE_APP_ENV is 'web')
- **NotFoundPage.tsx**: 404 errors.
- **ShotsPage.tsx**: Lists project shots (ShotListDisplay). Manages selected shot's images (ShotImageManager).
- **GenerationsPage.tsx**: Paginated gallery of project's generated media.

#### 3.3. Tool Modules (`src/tools/`)

##### Image Generation (`src/tools/image-generation/`)
*Completely overhauled for Wan-local workflow only*
 - **pages/ImageGenerationToolPage.tsx**: Orchestrates Wan task creation via `useCreateTask`, displays progress bar, and integrates ImageGallery with live updates & upscaling. No environment-specific branches.
 - **components/ImageGenerationForm.tsx**: Simplified form: prompts, images-per-prompt, before/after prompt text, Wan LoRA picker. ControlNet sliders & starting-image inputs removed. Supports persistent state via `usePersistentToolState`.
 - **LoraSelectorModal.tsx**: Fetches LoRA models via the Supabase `resources` table and a community LoRA API; allows strength sliders & removal. No Express endpoint required.
 - **hooks/useGenerations.ts**: Still provides list/upscale/delete hooks (now wired to new task flow).

##### Video Travel (`src/tools/video-travel/`)
- **pages/VideoTravelToolPage.tsx**: Main UI. Lists project shots (ShotListDisplay). Creates new shots (API). Hosts ShotEditor. Manages LoRA state and filtering for "Wan 2.1 14b" models.
- **components/ShotEditor.tsx**: Main shot editing. VideoOutputsGallery now positioned above main content area for better visibility. Orchestrates BatchSettingsForm, ShotImageManager. Includes LoRA selector UI with strength controls. Features OpenAI API key validation for prompt enhancement, disabling generate button and showing clickable warning when enhance prompt is enabled but no API key is set. Includes "Crop to project size" checkbox next to "Add more images" button for automatic image cropping to project aspect ratio.
- **components/BatchSettingsForm.tsx**: Form for batch video gen settings (prompts, frames, etc.). Includes "Enhance prompt" checkbox that requires OpenAI API key for AI-powered prompt improvement. Features mutually exclusive LoRA toggles: "Apply Causvid" and "Use LightI2X LoRA" where only one can be enabled at a time.
- **components/VideoOutputsGallery.tsx**: Displays generated videos for a shot (pagination, lightbox). Updated to show 3 videos per row consistently across screen sizes.
- **components/SimpleVideoPlayer.tsx**: Clean video player with speed controls (-2x, -1x, 1x, 2x). Replaces complex HoverScrubVideo functionality in lightbox for simplified playback experience.
- **components/VideoLightbox.tsx**: Modal video player using SimpleVideoPlayer for clean viewing experience.
- **components/TaskDetailsModal.tsx**: Dialog for detailed task parameters (fetches by generation ID). Features "Use These Settings" button that extracts and applies generation parameters (prompt, negative prompt, steps, frames, context, resolution) to BatchSettingsForm. Automatically deduplicates repeated prompts and handles expanded parameter arrays.
- **components/VideoShotDisplay.tsx**: Displays shot's images & name. Allows selection. Inline name edit, delete (API). Used by ShotListDisplay.
- **components/ShotListDisplay.tsx**: Renders list of shots using VideoShotDisplay.
- **components/SortableImageItem.tsx**: Renders sortable/deletable image item for ShotImageManager.
- **components/CreateShotModal.tsx**: Dialog to create new shots.

##### Edit Travel (`src/tools/edit-travel/`)
- **pages/EditTravelToolPage.tsx**: Main UI for image editing with text. Upload input image. Uses PromptEditorModal. Inputs: images/prompt, aspect ratio. Triggers Fal API (fal-ai/flux-pro/kontext). Displays results in ImageGallery. Saves edits to generations table.
- **components/EditTravelForm.tsx**: Form for managing prompts, input file, generation mode, and other settings for the Edit Travel tool.

#### 3.4. Shared Elements (`src/shared/`)

##### Components
- **GlobalHeader.tsx**: Site-wide header (branding, project selector/settings, new project '+', global settings). Content offset by locked panes.

**Z-Index Hierarchy**: The app uses a layered z-index system:
- Header: `z-50`
- Panes: `z-60` (shots/tasks), `z-[100]` (generations), `z-[101/102]` (pane controls)  
- Modals/Lightboxes: `z-[9999]` (ensures they appear above all panes)
- Drag overlays: `z-[10000]` (above everything during drag operations)
- **ShotsPane/**:
  - `ShotsPane.tsx`: Left slide-out panel for shots
  - `ShotGroup.tsx`: Droppable area in shot
  - `NewGroupDropZone.tsx`: Drop target for new shot from file
- **GenerationsPane/GenerationsPane.tsx**: Bottom slide-up panel (browsing project's generated media, paginated)
- **TasksPane/**:
  - `TasksPane.tsx`: Right slide-out panel for tasks
  - `TaskList.tsx`: Lists tasks, filters, real-time updates via Supabase Realtime
  - `TaskItem.tsx**: Displays task details, cancel button
- **ui/**: 50+ re-exports/variants of shadcn components. All modal components (Dialog, Sheet, Drawer) use `z-[9999]` to ensure they appear above sliding panes (which use z-60 to z-102)
- **loading.tsx**: Wes Anderson-inspired loading indicators
- **DraggableImage.tsx**: Makes gallery images draggable
- **ImageGallery.tsx**: Displays generated images; supports delete, upscale, "apply settings", drag-to-shot
- **ImageDragPreview.tsx**: Renders the visual preview for single or multiple images being dragged from the ShotImageManager
- **SettingsModal.tsx**: Modal for API key entry/saving to database (uses useApiKeys hook). Replaces localStorage-based approach
- **PromptEditorModal.tsx**: Modal for bulk prompt editing, AI-assisted generation/refinement
- **LoraSelectorModal.tsx**: Browse/select LoRA models. Supports filtering by `lora_type` (e.g., "Flux.dev", "Wan 2.1 14b")
- **CreateProjectModal.tsx**: Dialog to create new project (uses ProjectContext.addNewProject)
- **ProjectSettingsModal.tsx**: Dialog to update project name/aspect ratio (uses ProjectContext.updateProject). Includes "Crop to project size when uploading images" checkbox that persists across sessions
- **FileInput.tsx**: Reusable file input (image/video) with drag-and-drop, preview
- **MediaLightbox.tsx**: Reusable lightbox for images/videos. Keyboard/button navigation. Now includes horizontal flip functionality for images with canvas-based save capability using local SQLite API
- **ShotImageManager.tsx**: Manages images in a shot (D&D reorder, delete via callbacks). Used by ShotEditor, ShotsPage.tsx
- **HoverScrubVideo.tsx**: Wrapper for useVideoScrubbing (hover-play, scrub, progress, rate overlay). Reused by VideoOutputItem, MediaLightbox
- **ui/FullscreenImageModal.tsx**: Enhanced fullscreen image modal with horizontal flip and save functionality. Features flip button, save button (appears when changes made), canvas-based image processing for accurate flipping. Uses local SQLite API for database updates

##### Hooks
- **useApiKeys.ts**: Manages API keys for external services
- **useApiTokens.ts**: Manages personal access tokens (PAT) for local worker scripts
- **useFalImageGeneration.ts**: Handles image generation with Fal.ai
- **useGenerations.ts**: Manages generation CRUD operations
- **useLastAffectedShot.ts**: Tracks the last shot that was affected by an action
- **usePaneAwareModalStyle.ts**: Provides modal styling that respects pane visibility
- **usePersistentState.ts**: localStorage-backed state management
- **usePersistentToolState.ts**: Tool-specific persistent state with debouncing
- **useResources.ts**: Manages resources (uploaded files)
- **useShots.ts**: Comprehensive shot management (CRUD, ordering, duplication)
- **useSlidingPane.ts**: Handles sliding pane animations and state
- **useTasks.ts**: Task management and status tracking
- **useToolSettings.ts**: Tool-specific settings management with performance optimizations:
  - No longer requires userId parameter (server gets it from auth header)
  - Includes React Query caching (5 min stale time, 10 min cache time)
  - Single database query instead of 3 parallel queries
  - Prevents double-fetching on initial load
- **useVideoScrubbing.ts**: Video scrubbing functionality
- **useWebSocket.ts**: Supabase Realtime channel connection for real-time updates
- **useAIInteractionService.ts**: AI interaction service for generating prompts and editing
- **useUserUIState.ts**: Generic helper for persisting lightweight UI preferences (stored in `users.settings.ui` JSON). Debounced Supabase client update. Currently used by `PanesContext` to store `paneLocks`. Replaces `useToolSettings('pane-locks')` flow and removes the need for the `/api/tool-settings` round-trip for pane locks.

##### Contexts
- **LastAffectedShotContext.tsx**: Remembers last modified shot
- **ProjectContext.tsx**: Manages selected project ID using user settings database storage. Fetches projects via Supabase client. Creates "Default Project" if none exist. Provides addNewProject, updateProject, deleteProject & loading states. Automatically saves and restores last opened project across sessions.
- **PanesContext.tsx**: Manages shared state (dimensions, lock states) for ShotsPane, TasksPane, GenerationsPane

##### Components
- **ToolSettingsGate.tsx**: Wrapper component that shows loading spinner until tool settings are hydrated, then fades in content. Ensures smooth UX during settings fetch.

##### Library (`lib/`)
- **api.ts**: Authentication utilities:
  - `fetchWithAuth`: Makes authenticated fetch requests with JWT token caching to avoid repeated auth calls
  - Caches session tokens with 1-minute expiry buffer to reduce latency on mobile
  - Automatically clears cache on auth state changes
- **imageUploader.ts**: Uploads to Supabase storage
- **utils.ts**: General utilities. Includes `getDisplayUrl()` which safely converts relative storage paths to fully-qualified URLs. If `VITE_API_TARGET_URL` is set to a localhost address but the app is being accessed from another host (e.g. mobile device on LAN), the helper automatically falls back to a relative URL so images and videos still load. **Always use this helper instead of hand-rolling URL logic.**
- **imageCropper.ts**: Crops images to supported aspect ratios. Includes `cropImageToProjectAspectRatio` function for cropping to specific project dimensions
- **cropSettings.ts**: Utility for managing "crop to project size" setting persistence in localStorage. Defaults to true
- **aspectRatios.ts**: Defines aspect ratios (e.g., "16:9" -> "902x508"). Single source for project/server dimensions. Parsing/matching helpers
- **steerableMotion.ts**: Video generation API (POST /api/steerable-motion). Includes prompt enhancement via OpenAI API when enhance_prompt=true and openai_api_key is provided. Supports mutually exclusive LoRA options: apply_causvid and use_lighti2x_lora.
- **taskConfig.ts**: Centralized task configuration system. Manages task visibility, display names, progress support, and cancellation permissions. Provides functions like `isTaskVisible()`, `getTaskDisplayName()`, `taskSupportsProgress()`, and `filterVisibleTasks()`. Replaces hardcoded task type arrays with scalable configuration registry. Supports categories ('generation', 'processing', 'orchestration', 'utility') and extensible task capabilities.
- **deepEqual.ts**: Deep equality comparison utility with `sanitizeSettings()` function to ignore undefined values. Used by tool settings system to detect actual changes vs initialization.

##### Hooks
- **useToolSettings.ts**: Manages tool-specific settings stored in database at user/project/shot scopes. Provides `useToolSettings<T>()` hook that fetches merged settings and `update()` function for saving. Settings cascade from app defaults → user → project → shot, with later scopes overriding earlier ones.

##### Services (`src/server/services/`)
- **taskProcessingService.ts**: Processes task completions and creates generations
- **toolSettingsService.ts**: Tool settings management with performance optimizations:
  - `resolveToolSettings`: Fetches and merges settings from user/project/shot levels using parallel queries
  - Uses Promise.all to fetch all data concurrently instead of sequentially
  - Merges settings with deep merge: defaults → user → project → shot
  - `updateToolSettings`: Updates settings at specified scope
- **webSocketService.ts**: Supabase Realtime broadcast service for real-time updates

##### Tool Settings (`src/tools/*/settings.ts`)
- **video-travel/settings.ts**: Defines `VideoTravelSettings` interface and default values for Video Travel tool (per-shot scope – generation parameters, LoRA configs, pair prompts/frames).
- **image-generation/settings.ts**: Defines `ImageGenerationSettings` interface and default values for Image Generation tool (project scope – prompts, LoRA selections, ControlNet strengths, etc.).
- **edit-travel/settings.ts**: Defines `EditTravelSettings` interface and default values for Edit Travel tool (project scope – prompts, generation mode, flux strengths, etc.).

#### Adding a New Tool

To add a new tool to the system, follow these steps (most registration is now automatic):

1. **Create tool directory structure**:
   ```
   src/tools/my-new-tool/
   ├── pages/MyNewToolPage.tsx     # Main tool page component
   ├── components/                 # Tool-specific components
   ├── settings.ts                 # Tool settings definition
   └── hooks/                      # Tool-specific hooks (optional)
   ```

2. **Define tool settings** in `src/tools/my-new-tool/settings.ts`:
   ```ts
   export interface MyNewToolSettings {
     // Your tool's settings interface
     someProperty: string;
     anotherProperty: number;
   }

   export const myNewToolSettings = {
     id: 'my-new-tool',
     scope: ['project'] as const, // or ['user', 'project', 'shot']
     defaults: {
       someProperty: 'default value',
       anotherProperty: 42,
     } satisfies MyNewToolSettings,
   };
   ```

3. **Register in the tools manifest** by adding imports to `src/tools/index.ts`:
   ```ts
   // Add your export
   export { myNewToolSettings } from './my-new-tool/settings';
   
   // Add to toolsManifest array
   export const toolsManifest = [
     // ... existing tools
     myNewToolSettings,
   ] as const;

   // Add UI definition to toolsUIManifest
   export const toolsUIManifest: ToolUIDefinition[] = [
     // ... existing tools
     {
       id: myNewToolSettings.id,
       name: 'My New Tool',
       path: '/tools/my-new-tool',
       description: 'Description of what this tool does.',
       environments: [AppEnv.DEV], // or LOCAL_ENVS for broader visibility
       icon: SomeIcon, // Import from lucide-react
       gradient: 'from-color-1 to-color-2',
       accent: 'color-name',
       ornament: '★',
       badge: 'New', // optional
     },
   ];
   ```

4. **Add route** in `src/app/routes.tsx`:
   ```ts
   {
     path: '/tools/my-new-tool',
     element: <MyNewToolPage />,
   }
   ```

5. **Optional server route** (if your tool needs backend endpoints):
   - Create `src/server/routes/myNewTool.ts`
   - Register it in `src/server/index.ts`

**What happens automatically:**
- Tool settings defaults are registered in `toolSettingsService.ts` 
- Tool appears in ToolSelectorPage based on environment configuration
- Database persistence works via `useToolSettings` or `usePersistentToolState` hooks
- Settings cascade (app defaults → user → project → shot) works immediately

**Migration considerations:**
- Add database migrations in `/db/migrations/` if new tables/columns needed
- Update `taskConfig.ts` if your tool creates background tasks

## Motion Guidelines

**Standard Transitions**: Use `<PageFadeIn>` for page/component entry. Keep duration 300 ms. Use `<FadeInSection>` for staggered lists (40 ms incremental delay). Do **not** introduce new zoom/slide/rotate animations without design review.

**Components Available**:
- `PageFadeIn`: Wraps entire page content with consistent 300ms fade-in
- `FadeInSection`: For staggered animations with configurable delay

**Usage Examples**:
```tsx
// Page-level fade
return (
  <PageFadeIn className="container mx-auto p-4">
    {/* page content */}
  </PageFadeIn>
);

// Staggered list items
{items.map((item, index) => (
  <FadeInSection key={item.id} delayMs={index * 100}>
    <ItemComponent item={item} />
  </FadeInSection>
))}
```