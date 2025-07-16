# 🔧 Shared Hooks, Contexts & Components

> **Quick Reference**: Reusable React patterns available throughout the codebase.

---

## 🪝 Hooks Reference (`/src/shared/hooks/`)

### 📊 Data & State Management

| Hook | Purpose | Example Usage |
|------|---------|---------------|
| **`usePersistentState`** | LocalStorage-backed state | `const [theme, setTheme] = usePersistentState('theme', 'dark')` |
| **`usePersistentToolState`** | Tool settings with DB sync | `const { state, updateState } = usePersistentToolState(toolId, defaults)` |
| **`useToolSettings`** | Cross-device settings | `const { settings, updateSettings } = useToolSettings('my-tool')` |
| **`useUserUIState`** | Global UI preferences | `const { uiState, updateUIState } = useUserUIState()` |

### 🎨 Generation & Media

| Hook | Purpose | Key Methods |
|------|---------|-------------|
| **`useFalImageGeneration`** | FAL AI integration | `generate()`, `upscale()`, progress tracking |
| **`useGenerations`** | Media CRUD operations | `list()`, `delete()`, `upscale()` |
| **`useShots`** | Shot management | `create()`, `update()`, `delete()`, `reorder()` |
| **`useVideoScrubbing`** | Video playback control | Frame-accurate scrubbing |

### 💰 Credits & Tasks

| Hook | Purpose | Features |
|------|---------|----------|
| **`useCredits`** | Credit balance tracking | Real-time updates, balance check |
| **`useTasks`** | Task queue management | Status updates, progress, cancellation |
| **`useTaskCost`** | Cost calculations | Pre-flight cost estimates |
| **`useAIInteractionService`** | AI service wrapper | Unified AI API interface |

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

### 🔄 Real-time & Resources

| Hook | Purpose | Features |
|------|---------|----------|
| **`useWebSocket`** | WebSocket connection | Supabase real-time subscriptions |
| **`useResources`** | LoRA/asset management | Upload, list, delete resources |
| **`usePrefetchToolSettings`** | Settings preload | Performance optimization |

---

## 🎭 Contexts (`/src/shared/contexts/`)

### Active Contexts

| Context | Purpose | Provider Location | Usage |
|---------|---------|-------------------|-------|
| **`ProjectContext`** | Current project state | `App.tsx` | `const { project, setProject } = useProject()` |
| **`PanesContext`** | Pane lock/visibility | `Layout.tsx` | `const { lockedPanes, togglePane } = usePanes()` |
| **`LastAffectedShotContext`** | Recent shot tracking | `App.tsx` | `const { lastShot } = useLastAffectedShot()` |
| **`CurrentShotContext`** | Active shot selection | Tool-specific | `const { currentShot } = useCurrentShot()` |
| **`ThemeContext`** | Theme management | `App.tsx` | `const { theme, setTheme } = useTheme()` |

### Context Usage Example

```typescript
// Using multiple contexts in a component
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';

export function MyComponent() {
  const { project } = useProject();
  const { lockedPanes, togglePane } = usePanes();
  
  if (!project) return <div>Select a project</div>;
  
  return (
    <div>
      <h1>{project.name}</h1>
      <Button onClick={() => togglePane('shots')}>
        {lockedPanes.shots ? 'Unlock' : 'Lock'} Shots
      </Button>
    </div>
  );
}
```

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

### 📸 Media Components
- **`ImageGallery`** - Grid display with lightbox
- **`MediaLightbox`** - Full-screen media viewer
- **`HoverScrubVideo`** - Video preview on hover
- **`DraggableImage`** - Drag-and-drop images

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

[Component Storybook](../storybook) • [Hook Tests](../tests/hooks) • [Back to Structure](../structure.md)

</div> 