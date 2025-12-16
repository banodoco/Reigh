# Theme System Simplification Plan

**Date:** December 11, 2025  
**Status:** IN PROGRESS  
**Risk Level:** HIGH - touches styling across entire codebase

---

## Progress Summary (Updated)

### ✅ Completed
- Deleted dead files: `src/App.css`, `src/themes/default/theme.ts`, `src/themes/index.ts`
- Removed duplicate Google Fonts import from `index.css`
- Fixed `.wes-tool-card`, `.wes-polaroid`, `.wes-card`, `.wes-vintage-card` for dark mode
- Created `src/shared/hooks/useDarkMode.ts`
- Added dark mode initialization to `main.tsx`
- Added Appearance tab with theme toggle to SettingsModal
- **Added static `--wes-*` palette variables to index.css** (previously injected dynamically)
- **Deleted `src/shared/lib/theme-switcher.ts`** (multi-theme system removed)
- **Removed theme-switching code from `main.tsx`**

### ⏳ Remaining (Optional)
- Phase 4: Rename `wes-*` to `accent-*` (161 usages) - cosmetic naming improvement
- Inline Cat Lounging values (remove `--theme-*-*` indirection) - simplification
- Remove unused `--theme-lala-*` and `--theme-wes-*` CSS variables - cleanup
- Hardcoded Tailwind color migration (~470 usages - lower priority)

---

## Executive Summary

Simplify the current multi-theme system (La La Land, Wes Anderson, Cat Lounging) to a single color palette with light/dark mode support. This requires careful migration of hardcoded colors to theme tokens.

---

## Current Architecture Analysis

### 1. Theme System Structure

```
src/index.css (CSS Variables)
├── :root
│   ├── --theme-lala-* (La La Land palette - ~15 vars)
│   ├── --theme-wes-* (Wes Anderson palette - ~15 vars)
│   ├── --theme-cat-* (Cat Lounging palette - ~15 vars)
│   ├── --color-* (Active theme - points to one of above)
│   └── Semantic vars (--background, --foreground, etc.)
└── .dark (Dark mode overrides)

src/shared/lib/theme-switcher.ts
├── switchTheme() - switches between 3 themes
├── initializeTheme() - called at app startup
└── Dynamically injects CSS vars

src/app/main.tsx
└── Calls initializeTheme() on load
```

### 2. Color Usage Inventory

| Pattern | Count | Risk |
|---------|-------|------|
| `wes-*` colors in TSX (wes-pink, wes-vintage-gold, etc.) | 161 | HIGH - These are decorative accents, need to decide what to do |
| `bg-white` | 79 | MEDIUM - Replace with `bg-background` or `bg-card` |
| `bg-gray-*` | 140 | MEDIUM - Replace with `bg-muted` variants |
| `text-gray-*` | 133 | MEDIUM - Replace with `text-muted-foreground` |
| `border-gray-*` | 118 | MEDIUM - Replace with `border-border` |
| CSS `background: white` | 2 | LOW - Easy fix in index.css |
| `lala-*` colors in CSS | ~20 | LOW - Part of wes-tool-card styling |

### 3. Files Using `wes-*` Colors Directly

These 21 files use decorative `wes-*` colors that need decisions:

```
src/pages/ToolSelectorPage.tsx (19 usages) - gradient colors for tool cards
src/shared/components/GlobalHeader.tsx (40 usages) - decorative elements
src/pages/Home/components/HeroSection.tsx (14 usages) - hero styling
src/pages/Home/components/InstallInstructionsModal.tsx (13 usages)
src/shared/components/WesAndersonBackground.tsx (9 usages)
src/shared/components/PaletteIcon.tsx (9 usages)
src/pages/NotFoundPage.tsx (7 usages)
src/pages/ArtPage.tsx (7 usages)
src/shared/components/SocialIcons.tsx (6 usages)
src/shared/components/ui/loading.tsx (14 usages)
src/shared/components/ui/button.tsx (4 usages)
... and 10 more files
```

---

## Proposed New Architecture

### 1. Single Color Palette (Keep Current "Cat Lounging" as Base)

The current active theme is already Cat Lounging. We'll make this the permanent palette:

```css
:root {
  /* Primary palette (formerly Cat Lounging) */
  --color-primary: 180 35% 45%;         /* Muted Teal */
  --color-primary-dark: 180 40% 35%;
  --color-primary-light: 180 30% 55%;
  --color-secondary: 91 25% 45%;        /* Refined Sage */
  --color-secondary-dark: 91 30% 35%;
  --color-secondary-light: 91 20% 55%;
  --color-accent: 35 45% 60%;           /* Warm Terracotta */
  --color-accent-dark: 35 50% 50%;
  --color-accent-light: 35 40% 70%;
  --color-neutral: 25 30% 25%;          /* Warm Dark Brown */
  --color-neutral-light: 25 25% 35%;
  --color-surface: 45 25% 88%;          /* Warm Cream */
  --color-surface-bright: 45 15% 96%;   /* Very Soft Cream */
  --color-tertiary: 40 30% 75%;         /* Soft Peach */
  
  /* Decorative accent palette (for gradients, badges, etc.) */
  --accent-pink: 333 30% 93%;
  --accent-yellow: 48 85% 88%;
  --accent-mint: 145 35% 85%;
  --accent-lavender: 280 35% 88%;
  --accent-gold: 40 60% 80%;
  --accent-coral: 10 70% 82%;
  --accent-mustard: 45 80% 70%;
  --accent-teal: 180 40% 75%;
  --accent-blue: 210 35% 82%;
  
  /* Semantic colors (derived from above) */
  --background: var(--color-surface);
  --foreground: var(--color-neutral);
  --card: var(--color-surface-bright);
  --card-foreground: var(--color-neutral);
  /* ... etc ... */
}

.dark {
  --background: var(--color-neutral);
  --foreground: var(--color-surface);
  --card: var(--color-neutral-light);
  /* ... etc ... */
}
```

### 2. Handle Decorative `wes-*` Colors

**Option A (Recommended): Rename to neutral accent names**
- Keep the same HSL values
- Rename from `wes-pink` → `accent-pink`, `wes-vintage-gold` → `accent-gold`, etc.
- Update all 161 usages to new names
- These become permanent decorative accents, not tied to any "theme"

**Option B: Keep `wes-*` names, just remove unused themes**
- Less work, but confusing naming

### 3. What Gets Deleted

```
Files to delete:
- src/shared/lib/theme-switcher.ts (entire file)

Code to remove from src/app/main.tsx:
- import { initializeTheme } from '@/shared/lib/theme-switcher'
- initializeTheme() call
- window.switchTheme debug helper
- window.getAvailableThemes debug helper

CSS to remove from src/index.css:
- All --theme-lala-* variables (~20 lines)
- All --theme-wes-* variables (~20 lines)
- All --theme-cat-* variables (keep values, but inline them)
- Remove the indirection layer (--color-* pointing to --theme-*-*)
```

### 4. Dark Mode Toggle (Already Partially Done)

The dark mode toggle was added but reverted. Re-implement:

```typescript
// src/shared/hooks/useDarkMode.ts (new file)
export function useDarkMode() {
  const [darkMode, setDarkMode] = usePersistentState<boolean>("dark-mode", false);
  
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);
  
  return { darkMode, setDarkMode };
}
```

Initialize in `main.tsx`:
```typescript
// Apply dark mode from localStorage before React renders
const storedDarkMode = localStorage.getItem('dark-mode');
if (storedDarkMode === 'true') {
  document.documentElement.classList.add('dark');
}
```

---

## Migration Strategy

### Phase 1: Prepare (Low Risk) ✅ COMPLETE
1. [x] ~~Create new `--accent-*` CSS variables~~ (deferred - using semantic vars)
2. [x] Add dark mode variants for `.wes-tool-card`, `.wes-vintage-card` in CSS
3. [x] Create `useDarkMode` hook
4. [x] Add dark mode initialization to `main.tsx`

### Phase 2: Fix Hardcoded Colors in CSS (Low Risk) ✅ COMPLETE
1. [x] Replace `background: white` with `background: hsl(var(--card))` in:
   - `.wes-tool-card`
   - `.wes-polaroid`
2. [x] Add `.dark` variants for `.wes-card`, `.wes-vintage-card`

### Phase 3: Migrate Hardcoded Tailwind Classes (Medium Risk)

**Priority 1: Core UI components (test thoroughly)**
- [ ] SettingsModal.tsx (26 bg-gray-*, needs careful review)
- [ ] Dialog components
- [ ] Button variants

**Priority 2: Page layouts**
- [ ] ToolSelectorPage.tsx
- [ ] Home page components

**Priority 3: Tool-specific components**
- [ ] edit-video, edit-images pages
- [ ] travel-between-images components
- [ ] join-clips components

**Mapping guide:**
| Old | New | Notes |
|-----|-----|-------|
| `bg-white` | `bg-card` or `bg-background` | Use `bg-card` for elevated surfaces |
| `bg-gray-50` | `bg-muted/50` | Very light background |
| `bg-gray-100` | `bg-muted` | Light background |
| `bg-gray-200` | `bg-border` | Borders, dividers |
| `bg-gray-800/900` | `bg-card` (in dark) | Via CSS variables |
| `text-gray-400/500` | `text-muted-foreground` | Secondary text |
| `text-gray-600/700` | `text-foreground/80` | Slightly muted text |
| `text-gray-900` | `text-foreground` | Primary text |
| `border-gray-200/300` | `border-border` | Standard borders |

### Phase 4: Rename `wes-*` to `accent-*` (Medium Risk)

1. [ ] Update tailwind.config.ts to add `accent` color palette
2. [ ] Find/replace all `wes-pink` → `accent-pink`, etc.
3. [ ] Test all 21 affected files
4. [ ] Remove old `wes` colors from tailwind.config.ts

### Phase 5: Remove Multi-Theme Infrastructure (Low Risk) ✅ COMPLETE

1. [x] Added `--wes-*` palette variables to index.css (previously dynamic)
2. [x] Delete `src/shared/lib/theme-switcher.ts`
3. [x] Remove theme switching code from `main.tsx`
4. [ ] _(Optional)_ Inline the Cat Lounging values directly (remove `--theme-*-*` indirection)
5. [ ] _(Optional)_ Remove unused `--theme-lala-*` and `--theme-wes-*` CSS variables

### Phase 6: Add Dark Mode Toggle UI ✅ COMPLETE

1. [x] Add Appearance section to SettingsModal
2. [x] Wire up `useDarkMode` hook
3. [ ] Test across all pages (in progress)

---

## Risk Mitigation

### High-Risk Areas
1. **ToolSelectorPage.tsx** - Uses `wes-*` gradients extensively for visual identity
2. **GlobalHeader.tsx** - 40 color usages, highly visible
3. **Home page components** - Marketing pages, need to look good

### Testing Checklist
- [ ] All tool cards render correctly
- [ ] Header looks correct in light/dark
- [ ] Modals (Settings, Lightbox) render correctly
- [ ] Form inputs visible and styled
- [ ] Buttons have proper contrast
- [ ] No flash of wrong theme on page load
- [ ] Mobile responsive layouts unaffected

### Rollback Plan
- Keep original `wes-*` variables in CSS (commented out) until fully tested
- Git branch for easy revert
- Phase the rollout - can stop at any phase if issues arise

---

## Files to Modify Summary

### Delete
- `src/shared/lib/theme-switcher.ts`

### Create
- `src/shared/hooks/useDarkMode.ts`

### Major CSS Changes
- `src/index.css` - Simplify theme variables, add accent palette, fix dark mode

### Major TSX Changes (161 `wes-*` usages)
- `src/shared/components/GlobalHeader.tsx` (40)
- `src/pages/ToolSelectorPage.tsx` (19)
- `src/shared/components/ui/loading.tsx` (14)
- `src/pages/Home/components/HeroSection.tsx` (14)
- `src/pages/Home/components/InstallInstructionsModal.tsx` (13)
- ... and 16 more files

### Hardcoded Color Migration (~470 usages)
- 79 `bg-white` → `bg-card`/`bg-background`
- 140 `bg-gray-*` → `bg-muted`/`bg-border`
- 133 `text-gray-*` → `text-foreground`/`text-muted-foreground`
- 118 `border-gray-*` → `border-border`

---

## Timeline Estimate

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Prepare | 1 hour | Low |
| Phase 2: CSS hardcoded fixes | 30 min | Low |
| Phase 3: Tailwind migration | 3-4 hours | Medium |
| Phase 4: Rename wes→accent | 1 hour | Medium |
| Phase 5: Remove multi-theme | 30 min | Low |
| Phase 6: Dark mode toggle UI | 30 min | Low |
| **Total** | **~7 hours** | |

---

## Questions to Resolve Before Starting

1. **Keep current palette?** The Cat Lounging palette is active - confirm this is the desired light mode palette
2. **Decorative colors for gradients?** Currently tool cards use colorful gradients (pink, gold, mint) - keep these or simplify?
3. **Dark mode gradient handling?** Should gradients remain colorful in dark mode, or become more muted?
4. **Timeline priority?** Do all phases at once, or phase over multiple sessions?

---

## Appendix: Current Color Variable Flow

```
CSS Variables Flow (Current):
┌─────────────────────────────────────────────────────────────┐
│ --theme-cat-primary: 180 35% 45%                           │
│ --theme-lala-primary: 254 61% 48%  (unused after simplify) │
│ --theme-wes-primary: 25 70% 35%    (unused after simplify) │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ --color-primary: var(--theme-cat-primary)                  │
│ (This indirection layer will be removed)                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ --primary: var(--color-primary)                            │
│ (Semantic variable used by Tailwind)                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Tailwind: bg-primary, text-primary-foreground, etc.        │
└─────────────────────────────────────────────────────────────┘

After Simplification:
┌─────────────────────────────────────────────────────────────┐
│ --color-primary: 180 35% 45%  (direct value, no indirection)│
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ --primary: var(--color-primary)                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Tailwind: bg-primary, text-primary-foreground, etc.        │
└─────────────────────────────────────────────────────────────┘
```






