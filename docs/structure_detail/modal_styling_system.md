# Modal Styling System

## Overview

The modal styling system provides consistent responsive behavior across all dialogs and modals in the application. It centralizes both mobile and desktop styling logic, offers predefined size patterns, and includes scroll-aware fade effects and directional entrance animations for enhanced UX.

## Architecture

### Core Hook: `useModal`

Located in `src/shared/hooks/useModal.ts`, this hook provides:

- **Mobile detection** via `useIsMobile()`
- **Conditional styling** based on screen size and modal size
- **Predefined size patterns** (small, medium, large, extra-large)
- **Consistent class patterns** for different modal types
- **Proper z-index management** to ensure modals appear above overlays

### Scroll Fade Effect: `useScrollFade`

Located in `src/shared/hooks/useScrollFade.ts`, this hook provides:

- **Smart scroll detection** that only shows fade when content overflows
- **Auto-hide behavior** when user scrolls to bottom
- **Responsive observers** using ResizeObserver and MutationObserver
- **Consistent visual design** across all modals

### Convenience Hooks

- **`useSmallModal()`** - For small dialogs
- **`useMediumModal()`** - For standard forms  
- **`useLargeModal()`** - For content-heavy modals
- **`useExtraLargeModal()`** - For complex interfaces

## Modal Patterns

### Basic Usage

```tsx
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';

const MyModal = ({ isOpen, onOpenChange }) => {
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={modal.className}
        style={modal.style}
        {...modal.props}
      >
        <div className={modal.headerClass}>
          <DialogHeader>
            <DialogTitle>My Modal</DialogTitle>
          </DialogHeader>
        </div>
        
        <div ref={scrollRef} className={modal.scrollClass}>
          {/* Scrollable content */}
        </div>
        
        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
            </div>
          )}
          
          <DialogFooter className="border-t relative z-20">
            {/* Footer content */}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

### Modal Sizes

#### Small Modals
- **Max width:** `sm:max-w-sm`
- **Mobile behavior:** Centered with default padding
- **Use case:** Simple confirmations, alerts

#### Medium Modals  
- **Max width:** `sm:max-w-[425px]`
- **Mobile behavior:** Edge-buffered (small side margins)
- **Use case:** Forms, settings panels

#### Large Modals
- **Max width:** `sm:max-w-2xl`  
- **Mobile behavior:** Near-fullscreen with safe areas
- **Use case:** Content-heavy interfaces
- **Examples:** SettingsModal, ReferralModal

#### Extra-Large Modals
- **Max width:** `max-w-4xl`
- **Mobile behavior:** Fullscreen with safe areas  
- **Use case:** Complex interfaces, editors
- **Examples:** PromptEditorModal, LoraSelectorModal

### Scroll Fade Effect

The scroll fade effect automatically appears above footer borders when content overflows:

**Features:**
- Only shows when content is actually scrollable
- Disappears when user scrolls to bottom  
- 64px white-to-transparent gradient
- Dark mode support (gray-to-transparent)
- Non-interactive (`pointer-events-none`)

**Implementation:**
```typescript
const { showFade, scrollRef } = useScrollFade({ isOpen });

// In JSX:
<div ref={scrollRef} className={modal.scrollClass}>
  {/* scrollable content */}
</div>

{/* In footer */}
{showFade && (
  <div 
    className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
    style={{ transform: 'translateY(-64px)' }}
  >
    <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
  </div>
)}
```

### Migration from Old System

The modal system was simplified from `useMobileModalStyling` to `useModal`:

**Before:**
```typescript
const mobileModalStyling = useLargeModal();

<DialogContent 
  className={mobileModalStyling.fullClassName}
  style={mobileModalStyling.dialogContentStyle}
  {...createMobileModalProps(mobileModalStyling.isMobile)}
>
  <div className={mobileModalStyling.headerContainerClassName}>
    {/* header */}
  </div>
  <div className={mobileModalStyling.scrollContainerClassName}>
    {/* content */}
  </div>
  <div className={mobileModalStyling.footerContainerClassName}>
    {/* footer */}
  </div>
</DialogContent>
```

**After:**
```typescript
const modal = useLargeModal();
const { showFade, scrollRef } = useScrollFade({ isOpen });

<DialogContent 
  className={modal.className}
  style={modal.style}
  {...modal.props}
>
  <div className={modal.headerClass}>
    {/* header */}
  </div>
  <div ref={scrollRef} className={modal.scrollClass}>
    {/* content */}
  </div>
  <div className={`${modal.footerClass} relative`}>
    {/* fade overlay */}
    {showFade && <div>...</div>}
    {/* footer */}
  </div>
</DialogContent>
```

## Current Modal Implementations

### With Scroll Fade Effect
- **ReferralModal** - Large modal with referral information and statistics
- **PromptEditorModal** - Extra-large modal for prompt editing interface  
- **SettingsModal** - Large modal with application settings
- **LoraSelectorModal** - Extra-large modal for LoRA library browsing

### Standard Modals (No Fade)
- **CreateProjectModal** - Medium modal for project creation
- **ProjectSettingsModal** - Medium modal for project configuration
- **MagicEditModal** - Medium modal for image editing
- **CreateShotModal** - Medium modal for shot creation

## Key Benefits

1. **Consistent UX** - All modals behave predictably across devices
2. **Responsive Design** - Automatic mobile optimization with safe areas
3. **Enhanced Usability** - Scroll fade indicates more content available  
4. **Simple API** - Single hook provides all styling needs
5. **Performance** - Efficient scroll detection with proper cleanup

### ✅ Consistent Entrance Animations
All modals now use the same standard center-based entrance animation for a unified user experience:
- **Standard Animation**: fade + zoom + center-based slide (200ms duration)
- **Entrance**: fade-in-0, zoom-in-95, slide-in-from-left-1/2, slide-in-from-top-[48%]
- **Exit**: fade-out-0, zoom-out-95, slide-out-to-left-1/2, slide-out-to-top-[48%]
- **Consistent UX**: All modals behave identically across the application

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
