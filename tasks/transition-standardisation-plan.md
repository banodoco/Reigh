# Transition & Loading State Standardisation Plan

**Objective**: Make every page, modal, and major component in Reigh load with the same smooth white fade-in that is currently used when opening a specific shot inside **Video Travel**. Eliminate the patch-work of `fade-in-up`, `zoom-in-95`, bespoke delays, etc., to deliver a unified, predictable feel.

---

## 1. Reference Implementation

| Source | What happens today |
|--------|--------------------|
| `VideoTravelToolPage` → select shot | Wrapper `<div class="animate-in fade-in duration-300">` fades the entire `ShotEditor` from opacity 0 → 100 over **300 ms** on a white background. Children rely on their own content paint – no extra zoom/slide transforms. |

This becomes the canonical pattern: **opacity fade on white, 300 ms, ease-out**.

---

## 2. Audit Findings (Current Inconsistencies)

1. Components/pages use a *mixture* of Tailwind Animate (`fade-in`, `fade-in-up`, `zoom-in-95`, `slide-in-from-*`) and custom CSS keyframes (`animate-fade-in-up`, `animate-scale-fade`).
2. Durations vary from 200 ms → 800 ms; some have no easing specified.
3. Loading placeholders (`Skeleton` component, inline divs, or none) appear/disappear abruptly in some tools.
4. Some lists (e.g. Tool Selector) stagger items with manual `style={{ animationDelay: '0.8s' }}` while others pop instantly.

---

## 3. Design Principles for the New Standard

1. **Single primary motion**: Opacity fade on white (`opacity 0 → 1`).
2. **Constant timing**: 300 ms `ease-out` for standard entry; 150 ms for subtle in-element fades (tooltips, buttons, etc.).
3. **No scale / translate** for default page loads. Reserve zoom/slide for context-changing interactions (drawers, panes) that already have bespoke motion.
4. **Opt-in COMPONENT API** instead of sprinkling `className` strings.

---

## 4. Implementation Roadmap

### 4.1 Create Generic Transition Components

1. `src/shared/components/transitions/PageFadeIn.tsx`
   ```tsx
   import { cn } from '@/shared/lib/utils';

   export const PageFadeIn: React.FC<React.PropsWithChildren<{className?: string}>> = ({ children, className }) => (
     <div className={cn('animate-in fade-in duration-300 ease-out', className)}>
       {children}
     </div>
   );
   ```
2. `src/shared/components/transitions/FadeInSection.tsx` – same as above but accepts `delayMs` prop to add `style={{ animationDelay: `${delayMs}ms` }}` for optional staggering.
3. Re-export from `src/shared/components/transitions/index.ts`.

### 4.2 Augment Tailwind Config

*Add to* `tailwind.config.ts`:
```ts
module.exports = {
  // ...existing
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
};
```
(Ensures consistent timing even if `tailwindcss-animate` plugin is removed later.)

### 4.3 Standardise Skeleton Handling

1. Keep shared `Skeleton` component but change default CSS to include the same 300 ms fade when it *appears* **and** when real data replaces it.
2. In pages that fetch data (`useQuery` hooks), wrap *both* the skeleton block and the "real" block in `PageFadeIn` to ensure the swap is smooth.

### 4.4 Refactor Pages & Big Components

| File | Replace | With |
|------|---------|------|
| `tools/video-travel/pages/VideoTravelToolPage.tsx` | `div.animate-in fade-in…` | `<PageFadeIn>` |
| `tools/image-generation/pages/ImageGenerationToolPage.tsx` | Manual placeholder fade logic | `Skeleton` + `<PageFadeIn>` |
| `tools/edit-travel/pages/EditTravelToolPage.tsx` | `animate-fade-in-up`, etc. | `<PageFadeIn>` |
| `src/pages/ToolSelectorPage.tsx` | manual staggered `style={{ animationDelay… }}` | map items → `<FadeInSection delayMs={idx*40}>` |
| `src/pages/ArtPage.tsx`, `HomePage.tsx` | `animate-fade-in-up` | `<PageFadeIn>` (or `FadeInSection` for card grids) |

*Rule of thumb*: Any **top-level** element returned by a route/page/component that covers most of the viewport should be wrapped in exactly **one** `<PageFadeIn>`.

### 4.5 Cull Legacy Animation Classes

1. Grep for `animate-fade-in-up`, `zoom-in-95`, `slide-in-from-`, `animate-scale-fade`.
2. Replace usages in non-pane contexts with the new components.
3. Delete unused keyframes from `index.css` after migration pass.

### 4.6 Developer Guidelines

Add a section to `structure.md`:
> **Motion Guidelines**: Use `<PageFadeIn>` for page/component entry. Keep duration 300 ms. Use `<FadeInSection>` for staggered lists (40 ms incremental delay). Do **not** introduce new zoom/slide/rotate animations without design review.

### 4.7 Testing & QA

1. Navigate rapidly between all tools – content should always fade in consistently.
2. Verify dark/light themes still look natural (white fade is acceptable on dark BG due to underlying white container; adjust if needed with `bg-background`).
3. Audit Lighthouse for CLS – transitions should not shift layout once fully rendered.

### 4.8 Timeline / PR Breakdown

1. **PR 1** – Core utilities (`PageFadeIn`, Tailwind config).
2. **PR 2** – Migrate tool pages (Video Travel, Image Gen, Edit Travel).
3. **PR 3** – Migrate top-level pages (Home, Tool Selector, Art, etc.).
4. **PR 4** – Code-base wide clean-up & remove dead CSS.

---

## 5. Future Enhancements

* Consider **Framer Motion** for more complex, shared transitions in the future (route matching exit/enter, staggered children) but keep simple CSS fade for now to avoid bundle size impact.
* Provide Storybook showcase of transition components so contributors see expected behaviour.

---

**Outcome**: Every navigation and data-fetch driven change feels uniform, professional, and aligned with the polished experience of the Video Travel shot view. 