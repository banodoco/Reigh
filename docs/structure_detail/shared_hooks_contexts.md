# 🔧 Shared Hooks, Contexts & Components

> **Quick Reference**: Reusable React patterns available throughout the codebase.

---

## 🪝 Hooks Reference (`/src/shared/hooks/`)

### 📊 Data & State Management

| Hook | Purpose | Example Usage |
|------|---------|---------------|
| **`usePersistentState`** | LocalStorage-backed state | `const [theme, setTheme] = usePersistentState('theme', 'dark')` |
| **`usePersistentToolState`** | Tool settings with DB sync | `const { state, updateState } = usePersistentToolState(toolId, defaults)` |
| **`useToolSettings`** | Cross-device settings | `const { settings, update } = useToolSettings('my-tool')` |
| **`useUserUIState`** | Global UI preferences | `const { uiState, updateUIState } = useUserUIState()` |

### 🎨 Generation & Media

| Hook | Purpose | Key Methods |
|------|---------|-------------|
| **`useFalImageGeneration`** | FAL AI integration | `generate()`, `upscale()`, progress tracking |
| **`useGenerations`** | Media CRUD operations | `list()`, `delete()`, `upscale()` |
| **`useUnifiedGenerations`** | Unified gallery data | Project-wide & shot-specific modes, task preloading, eliminates race conditions |
| **`useTaskFromUnifiedCache`** | Cached task lookup | Efficient task data retrieval from unified cache |
| **`useShots`** | Shot management | `create()`, `update()`, `delete()`, `reorder()` |
| **`useVideoScrubbing`** | Video playback control | Frame-accurate scrubbing |

### 🖌️ MediaLightbox Editing Hooks (`/src/shared/components/MediaLightbox/hooks/`)

| Hook | Purpose | Key Features |
|------|---------|--------------|
| **`useMagicEditMode`** | Text-guided image editing | Prompt-based edits, batch creation, `createAsGeneration` flag |
| **`useInpainting`** | Mask-based inpainting | Brush strokes, mask management, inpaint/annotate modes |
| **`useRepositionMode`** | Image repositioning | Transform (pan/zoom), save as variant or generation |
| **`useVideoEditing`** | Video trim/edit | Trim mode, video manipulation |
| **`useEditModeLoRAs`** | LoRA management for edits | In-Scene Boost, custom LoRA selection |
| **`useGenerationLineage`** | Track generation ancestry | `based_on` relationships, source tracking |

### 💰 Credits & Tasks

| Hook | Purpose | Features |
|------|---------|----------|
| **`useCredits`** | Credit balance tracking | Real-time updates, balance check |
| **`useTasks`** | Task queue management | Status updates, progress, cancellation |
| **`useTaskCost`** | Cost calculations | Pre-flight cost estimates |
| **`useAIInteractionService`** | AI service wrapper | Unified AI API interface |
| **`useTaskQueueNotifier`** | Centralized task creation | Unified task enqueueing with realtime feedback |

### 🔑 Authentication & API

| Hook | Purpose | Returns |
|------|---------|---------|
| **`useApiKeys`** | API key management | `{ keys, addKey, removeKey }` |
| **`useApiTokens`** | Auth token handling | Token validation & refresh |

### 🎯 UI & Layout

| Hook | Purpose | Use Case |
|------|---------|----------|
| **`useSlidingPane`** | Pane state management | Collapse/expand side panels |
| **`usePaneAwareModalStyle`** | Modal positioning | Adjusts for locked panes |
| **`useContentResponsive`** | Responsive utilities | Mobile/desktop detection |
| **`useMobile`** | Mobile detection | `const isMobile = useMobile()` |
| **`useLastAffectedShot`** | Shot tracking | Recently modified shot reference |
| **`useClickRipple`** | Click ripple effect | Reusable golden circle expand animation on click |
| **`useDoubleTapWithSelection`** | Double-tap detection | Instant selection + double-tap to open (iPad/tablets) |
| **`useSubmitButtonState`** | Button state machine | Submitting → Success → Idle transitions with cleanup |

### 🔄 Real-time & Resources

| Hook | Purpose | Features |
|------|---------|----------|
| **`useWebSocket`** | WebSocket connection | Supabase real-time subscriptions |
| **`useResources`** | LoRA/asset management | Upload, list, delete resources |
| **`usePrefetchToolSettings`** | Settings preload | Performance optimization |
| **`useVideoCountCache`** | Per-shot video caching | Instant skeleton display for video galleries |
| **`useProjectVideoCountsCache`** | Project-wide video counts | Preloads all shot video counts for smooth UX |

---

## 🎭 Contexts (`/src/shared/contexts/`)

### Active Contexts

| Context | Purpose | Provider Location | Usage |
|---------|---------|-------------------|-------|
| **`ProjectContext`** | Current project state | `App.tsx` | `const { project, setProject } = useProject()` |
| **`ShotsContext`** | Single source of truth for shots data | `App.tsx` | `const { shots, isLoading, refetchShots } = useShots()` |
| **`PanesContext`** | Pane lock/visibility | `Layout.tsx` | `const { lockedPanes, togglePane } = usePanes()` |
| **`LastAffectedShotContext`** | Recent shot tracking | `App.tsx` | `const { lastShot } = useLastAffectedShot()` |
| **`CurrentShotContext`** | Active shot selection | Tool-specific | `const { currentShot } = useCurrentShot()` |
| **`ThemeContext`** | Theme management | `App.tsx` | `const { theme, setTheme } = useTheme()` |
| **`IncomingTasksContext`** | Pending task creation tracking | `App.tsx` | `const { addIncomingTask, removeIncomingTask } = useIncomingTasks()` |

### Context Usage Example

```typescript
// Using multiple contexts in a component
import { useProject } from '@/shared/contexts/ProjectContext';
import { useShots } from '@/shared/contexts/ShotsContext';
import { usePanes } from '@/shared/contexts/PanesContext';

export function MyComponent() {
  const { project } = useProject();
  const { shots, isLoading } = useShots(); // Single source of truth for shots
  const { lockedPanes, togglePane } = usePanes();
  
  if (!project) return <div>Select a project</div>;
  if (isLoading) return <div>Loading shots...</div>;
  
  return (
    <div>
      <h1>{project.name}</h1>
      <p>{shots?.length || 0} shots available</p>
      <Button onClick={() => togglePane('shots')}>
        {lockedPanes.shots ? 'Unlock' : 'Lock'} Shots
      </Button>
    </div>
  );
}
```

### 🚀 **Background Task Submission Pattern**

For tools with long-running preparation phases (e.g., AI prompt generation), use `useIncomingTasks` + `useSubmitButtonState` together:

```typescript
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useSubmitButtonState } from '@/shared/hooks/useSubmitButtonState';

function MyToolForm() {
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const submitButton = useSubmitButtonState();

  const handleSubmit = () => {
    // 1. Button feedback: Submitting... (1s) → Success! (2s) → normal
    submitButton.trigger();

    // 2. Filler task appears immediately in TasksPane
    const incomingId = addIncomingTask({
      taskType: 'my_task_type',
      label: 'Processing request...',
      expectedCount: 5, // optional
    });

    // 3. Background work (fire-and-forget)
    (async () => {
      try {
        const result = await doExpensivePreparation(); // e.g., AI calls
        await createActualTasks(result);
        await new Promise(r => setTimeout(r, 500)); // let real tasks appear
      } catch (error) {
        toast.error('Failed to create tasks');
      } finally {
        removeIncomingTask(incomingId);
      }
    })();
  };

  return (
    <Button
      onClick={handleSubmit}
      disabled={submitButton.isSubmitting}
      variant={submitButton.isSuccess ? "success" : "default"}
    >
      {submitButton.isSuccess ? "Creating tasks!"
        : submitButton.isSubmitting ? "Submitting..."
        : "Generate"}
    </Button>
  );
}
```

**Key Features:**
- Button shows immediate feedback without blocking UI
- Filler task in TasksPane shows user that work is happening
- Filler disappears when real tasks appear (or on error)
- Proper cleanup on component unmount

### 🎯 **ShotsContext: Centralized Data Management**

The `ShotsContext` provides a **single source of truth** for shots data across all components, eliminating data duplication and improving performance:

- **Before**: `VideoTravelToolPage`, `ShotsPane`, and other components each called `useListShots()` separately
- **After**: One `ShotsProvider` manages all shots data, consumed via `useShots()` hook
- **Performance**: Main view now loads only 5 thumbnail images per shot (vs. all images previously)
- **Consistency**: All components see identical, synchronized shots state

#### Data Consistency Strategy

**Two-Tier Data Loading:**
- **List Views** (`ShotsPane`, `VideoTravelToolPage`): Use `useShots()` → 5 thumbnails per shot
- **Detail Views** (`ShotEditor`): Use `useAllShotGenerations(shotId)` → complete data for selected shot

**Key Benefits:**
- **Fast Browsing**: List views load minimal data for quick navigation
- **Complete Editing**: Detail views load full data only when needed
- **Video Generation**: Uses complete image data from detail view (not limited thumbnails)
- **No Data Conflicts**: Shot metadata (ID, name) is consistent; only image completeness varies

**Cache Synchronization (Fixed):**
All shot mutations (`useRemoveImageFromShot`, `useUpdateShotImageOrder`, `useDuplicateImageInShot`) now properly invalidate both query caches:
- `['shots', projectId]` - for list views (ShotsPane, etc.)
- `['all-shot-generations', shotId]` - for detail views (ShotEditor)

This ensures real-time synchronization between ShotsPane and ShotEditor when reordering, adding, or removing images.

---

## 🧩 Key Components (`/src/shared/components/`)

### 🎨 UI Primitives
Located in `/ui/` - Full shadcn-ui component library including:
- `Button`, `Card`, `Dialog`, `Select`, `Input`
- `Table`, `Tabs`, `Form`, `Alert`
- And 40+ more components

### 🔄 Transitions
- **`PageFadeIn`** - Smooth page entry animation
- **`FadeInSection`** - Staggered list animations

### 🔧 Task & Generation Components
- **`TaskItem`** - Individual task display with progress tracking, cancellation
- **`TasksPane`** - Task queue management with filtering, pagination, real-time updates  
- **`SharedTaskDetails`** - Reusable task info display with hover/modal/panel variants
- **`SharedMetadataDetails`** - Generation metadata display with structured layout
- **`TaskDetailsPanel`** - Full task details view used in MediaLightbox
- **`TaskDetailsModal`** - Standalone task modal for mobile-friendly viewing

#### Variant-Based Detail Components

Both `SharedTaskDetails` and `SharedMetadataDetails` use a variant pattern:

| Variant | Use Case | Features |
|---------|----------|----------|
| `hover` | Desktop tooltips | Compact, `text-xs` |
| `modal` | Dialog content | Medium, `text-sm` |
| `panel` | Mobile popovers/sidebars | Full, mobile-optimized |

```typescript
<SharedMetadataDetails
  metadata={image.metadata}
  variant="hover"  // or "modal" or "panel"
  showFullPrompt={showFullPrompt}
  onShowFullPromptChange={setShowFullPrompt}
/>
```

### 📸 Media Components
- **`ImageGallery`** - Grid display with lightbox
  - Server-side pagination support
  - Media type filtering (All/Images/Videos)
  - Shot-based filtering with position exclusion
  - Prompt search functionality
  - Drag-and-drop support for desktop
- **`VideoOutputsGallery`** - Uses unified data system (`useUnifiedGenerations`)
  - Background task preloading for better performance
  - Real-time updates via enhanced WebSocket system
  - Eliminates race conditions and duplicate API calls
- **`MediaLightbox`** - Full-screen media viewer
  - Magic-edit task creation with loading/success states
  - Star/unstar functionality
  - Navigation, download, editing tools
  - Shot workflow integration
  - Enhanced task details integration
- **`HoverScrubVideo`** - Video preview on hover
- **`DraggableImage`** - Drag-and-drop images
- **`TimeStamp`** - Consistent relative time display ("X mins ago")

### 🎛️ Tool Components
- **`ToolSettingsGate`** - Settings loading wrapper
- **`PaneHeader`** - Consistent pane headers
- **`PaneControlTab`** - Pane lock/unlock controls

### 📊 Data Display
- **`GenerationsPane`** - Generated media sidebar
- **`ShotsPane`** - Shot management panel
- **`TasksPane`** - Active tasks display

---

## 💡 Usage Tips

1. **Always check existing hooks** before creating new ones
2. **Use TypeScript** - All hooks are fully typed
3. **Check JSDoc comments** - Detailed usage in source files
4. **Compose hooks** - Combine multiple hooks for complex logic
5. **Avoid prop drilling** - Use contexts for cross-component state

---

<div align="center">

**📚 More Resources**

[Back to Structure](../../structure.md)

</div> 

#### Navigation & Routing

| Hook | Purpose | Key Methods |
|------|---------|-------------|
| **useShotNavigation** | Universal shot navigation | `navigateToShot()`, `navigateToShotEditor()`, `navigateToNextShot()`, `navigateToPreviousShot()` |

**useShotNavigation** provides consistent navigation to shots across all components:
```typescript
const { navigateToShot, navigateToShotEditor, navigateToNextShot, navigateToPreviousShot } = useShotNavigation();

// Navigate to specific shot with options
navigateToShot(shot, { 
  scrollToTop: true, 
  closeMobilePanes: true, 
  replace: true 
});

// Navigate between shots in a list
navigateToNextShot(shots, currentShot);
```

Features:
- **Consistent URL patterns**: Uses `/tools/travel-between-images#${shotId}` with `fromShotClick: true` state
- **Mobile support**: Automatically closes panes on mobile devices
- **Scroll management**: Configurable scroll-to-top behavior with timing control
- **History management**: Uses `replace: true` for Previous/Next to avoid history pollution
- **State sync**: Handles `CurrentShotContext` updates and URL hash synchronization

Used in: `VideoTravelToolPage`, `ShotGroup`, `ShotsPane`, and any component that navigates to shots. 