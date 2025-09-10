# Modal System Migration Guide

## Migration from Current to Improved System

### Before (Current System)

```typescript
// Verbose, error-prone configuration
const mobileModalStyling = useMobileModalStyling({
  enableMobileEdgeBuffers: true,
  disableCenteringOnMobile: true, // Easy to forget!
});

// Repetitive base classes
<DialogContent 
  className={mergeMobileModalClasses(
    'sm:max-w-[425px] bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 flex flex-col rounded-lg',
    mobileModalStyling.dialogContentClassName,
    mobileModalStyling.isMobile
  )}
  style={mobileModalStyling.dialogContentStyle}
  {...createMobileModalProps(mobileModalStyling.isMobile)}
>
```

### After (Improved System)

```typescript
// Simple, clear intent
const modalStyling = useModalStyling('medium');

// Clean, no repetition
<DialogContent 
  className={modalStyling.fullClassName}
  {...createMobileModalProps(modalStyling.isMobile)}
>
```

## Migration Steps

### 1. Modal Size Mapping

| Current Configuration | New Size | Notes |
|----------------------|----------|-------|
| `enableMobileEdgeBuffers: true` + `sm:max-w-[425px]` | `'medium'` | CreateProject, ProjectSettings, etc. |
| `enableMobileEdgeBuffers: true` + `sm:max-w-[500px]` | `'medium'` with custom width | MagicEditModal |
| `enableMobileFullscreen: true` + `sm:max-w-2xl` | `'large'` | SettingsModal |
| `enableMobileFullscreen: true` + `max-w-4xl` | `'extra-large'` | PromptEditorModal, LoraSelectorModal |
| Default (no config) | `'small'` | Simple confirmation dialogs |

### 2. Component-by-Component Migration

#### CreateProjectModal
```typescript
// Before
const mobileModalStyling = useMobileModalStyling({
  enableMobileEdgeBuffers: true,
  disableCenteringOnMobile: true,
});

// After  
const modalStyling = useModalStyling('medium');
```

#### SettingsModal
```typescript
// Before
const mobileModalStyling = useMobileModalStyling({
  enableMobileFullscreen: true,
  disableCenteringOnMobile: true,
});

// After
const modalStyling = useModalStyling('large');
```

#### MagicEditModal (Custom Width)
```typescript
// Before
const mobileModalStyling = useMobileModalStyling({
  enableMobileEdgeBuffers: true,
  disableCenteringOnMobile: true,
});
// + manual 'sm:max-w-[500px]' in className

// After
const modalStyling = useModalStyling('medium', 'sm:max-w-[500px]');
```

### 3. Nested Modals (AI Edit Dialog)

```typescript
// Before
const nestedModalStyling = useMobileModalStyling({
  enableMobileEdgeBuffers: true,
  disableCenteringOnMobile: true,
});

// After
const nestedModalStyling = useModalStyling('medium');
```

## Benefits of Migration

### 🎯 Clearer Intent
- `useModalStyling('medium')` is self-documenting
- No hidden dependencies between flags
- Obvious which pattern to use for new modals

### 🔒 Type Safety
- Predefined sizes prevent typos
- Compiler catches invalid configurations
- Better IDE autocomplete

### 📦 Less Code
- 50% reduction in configuration code
- No more repetitive base class strings
- Single source of truth for modal styles

### 🐛 Fewer Bugs
- Impossible to forget `disableCenteringOnMobile`
- Consistent base classes across all modals
- Centralized spacing constants

### 🔧 Easier Maintenance
- Theme changes in one place
- New modal patterns easy to add
- Clear upgrade path for future changes

## Implementation Strategy

### Phase 1: Add Improved System (Non-Breaking)
1. Add `useMobileModalStyling_improved.ts` alongside existing hook
2. Update imports to use improved version in new components
3. Verify behavior matches existing system

### Phase 2: Migrate Existing Components
1. Start with simple modals (CreateProject, ProjectSettings)
2. Test thoroughly on mobile devices
3. Migrate complex modals (Settings, PromptEditor)
4. Update nested dialogs last

### Phase 3: Cleanup
1. Remove old `useMobileModalStyling.ts` 
2. Rename improved version to replace it
3. Update all imports
4. Remove example files

## Testing Checklist

For each migrated modal:
- [ ] Desktop: Modal centers and sizes correctly
- [ ] Mobile Portrait: Proper edge buffers, no overflow
- [ ] Mobile Landscape: Appropriate sizing
- [ ] Tablet: Responsive breakpoint behavior
- [ ] Dark mode: All styling variants work
- [ ] Keyboard navigation: Focus management correct
- [ ] Screen readers: Accessibility maintained

## Rollback Plan

If issues arise:
1. Keep old hook file during migration
2. Quick rollback by reverting import statements
3. Each component can be reverted individually
4. Full system rollback possible until Phase 3
