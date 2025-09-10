# Modal Styling System

## Overview

The modal styling system provides consistent responsive behavior across all dialogs and modals in the application. It centralizes both mobile and desktop styling logic, offers three distinct responsive patterns, and includes directional entrance animations for enhanced UX.

## Architecture

### Core Hook: `useMobileModalStyling`

Located in `src/shared/hooks/useMobileModalStyling.ts`, this hook provides:

- **Mobile detection** via `useIsMobile()`
- **Conditional styling** based on screen size
- **Consistent class patterns** for different modal types
- **Helper utilities** for integration

### Helper Functions

1. **`mergeMobileModalClasses(baseClasses, mobileClasses, isMobile)`**
   - Combines base desktop classes with mobile-specific classes
   - Only applies mobile classes when `isMobile` is true

2. **`createMobileModalProps(isMobile)`**
   - Returns mobile-specific props (e.g., preventing auto-focus)
   - Prevents mobile keyboard popup on modal open

## Modal Patterns

### Pattern 1: Large Fullscreen Modals

**Used by:** SettingsModal, LoraSelectorModal, PromptEditorModal (main)

**Configuration:**
```typescript
const mobileModalStyling = useMobileModalStyling({
  enableMobileFullscreen: true,
  disableCenteringOnMobile: true,
});
```

**Behavior:**
- Nearly full-screen on mobile (16px edges, 32px top/bottom)
- Large desktop width (`sm:max-w-2xl` or `max-w-4xl`)
- Includes scrollable content areas

**Classes Applied:**
- `left-4 right-4 top-8 bottom-8 w-auto max-h-none rounded-lg translate-x-0 translate-y-0`

### Pattern 2: Medium Edge-Buffered Modals

**Used by:** CreateProjectModal, ProjectSettingsModal, MagicEditModal, CreateShotModal, AI Edit Dialog

**Configuration:**
```typescript
const mobileModalStyling = useMobileModalStyling({
  enableMobileEdgeBuffers: true,
  disableCenteringOnMobile: true,
});
```

**Behavior:**
- Fixed width with edge buffers on mobile (16px sides)
- Medium desktop width (`sm:max-w-[425px]` or `sm:max-w-[500px]`)
- Maintains aspect ratio, doesn't fill screen

**Classes Applied:**
- `left-4 right-4 w-auto rounded-lg translate-x-0`

### Pattern 3: Default Centered Modals

**Used by:** Small confirmation dialogs, simple alerts

**Configuration:**
```typescript
const mobileModalStyling = useMobileModalStyling({});
```

**Behavior:**
- Uses default dialog centering behavior
- No special mobile positioning
- Relies on base DialogContent styling

**Classes Applied:**
- None (empty string)

## Usage Pattern

All modals follow this consistent structure:

```typescript
// 1. Configure mobile styling
const mobileModalStyling = useMobileModalStyling({
  enableMobileEdgeBuffers: true,
  disableCenteringOnMobile: true,
});

// 2. Apply to DialogContent
<DialogContent 
  className={mergeMobileModalClasses(
    'sm:max-w-[425px] bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 flex flex-col rounded-lg',
    mobileModalStyling.dialogContentClassName,
    mobileModalStyling.isMobile
  )}
  style={mobileModalStyling.dialogContentStyle}
  {...createMobileModalProps(mobileModalStyling.isMobile)}
>
  {/* 3. Use responsive containers */}
  <div className={mobileModalStyling.headerContainerClassName}>
    <DialogHeader className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'}`}>
      {/* Header content */}
    </DialogHeader>
  </div>
  
  <div className={mobileModalStyling.scrollContainerClassName}>
    {/* Scrollable content */}
  </div>
  
  <div className={mobileModalStyling.footerContainerClassName}>
    <DialogFooter className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-1' : 'px-6 pt-5 pb-2'} border-t`}>
      {/* Footer content */}
    </DialogFooter>
  </div>
</DialogContent>
```


## Key Features

### ✅ Directional Entrance Animations
Each modal has a unique entrance animation that provides visual context about functionality:
- **SettingsModal**: slides from right
- **ReferralModal**: slides from top-right diagonal  
- **CreateProjectModal**: slides straight from top
- **ProjectSettingsModal**: slides from top with subtle left angle
- **PromptEditorModal**: slides from left
- **LoraSelectorModal**: slides from upper-left diagonal

### ✅ Responsive Positioning
- Proper vertical centering on both mobile and desktop
- Edge-buffered strategy preserves centering while providing mobile-friendly spacing
- Enhanced z-index management for tooltips and overlays

### ✅ Performance Optimized
- Memoized modal props prevent unnecessary re-renders
- State change guards prevent redundant updates
- Efficient class concatenation and conditional styling

## Benefits

### ✅ Centralized Logic
- All responsive behavior in one place
- Consistent patterns across the app
- Easy to modify behavior globally

### ✅ Type Safety
- TypeScript interfaces ensure correct usage
- Clear return types for styling properties

### ✅ Enhanced UX
- Directional animations provide visual context
- Smooth responsive transitions
- Consistent behavior across devices

### ✅ Performance
- Optimized render cycles
- Efficient class concatenation
- Smart memoization strategies

## File Structure

```
src/shared/hooks/useMobileModalStyling.ts    # Core hook and utilities
src/shared/components/
├── PromptEditorModal.tsx                    # Large + nested medium modal
├── SettingsModal.tsx                        # Large fullscreen modal
├── CreateProjectModal.tsx                   # Medium edge-buffered modal
├── ProjectSettingsModal.tsx                 # Medium edge-buffered modal
├── MagicEditModal.tsx                       # Medium edge-buffered modal
├── CreateShotModal.tsx                      # Medium edge-buffered modal
└── LoraSelectorModal.tsx                    # Large fullscreen modal
```
