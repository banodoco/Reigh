# 🎨 Design & Motion Guidelines

> **Consistency is key**: Follow these patterns to maintain a cohesive user experience across Reigh.

## 🗺️ High-Level Overview

Reigh’s design language is implemented through **TailwindCSS**, **shadcn-ui**, and a small set of project-specific wrappers.  
If you only skim one section of this document, read this one—it tells you **where the design primitives live** and **how to extend them safely**.

### Core Building Blocks

| Layer | Location | Purpose |
|-------|----------|---------|
| **Theme Tokens** | `themes/default/theme.ts` | Source-of-truth color palette & shadows exported as CSS variables |
| **Tailwind Config** | `tailwind.config.ts` | Registers the theme tokens and custom utilities/breakpoints |
| **UI Primitives** | `src/shared/components/ui/` | Thin wrappers around shadcn-ui with project-level defaults |
| **Motion Helpers** | `src/shared/components/transitions/` | Reusable animation components (PageFadeIn, FadeInSection, …) |
| **High-Level Layout** | `src/app/Layout.tsx` & `src/shared/components/` | GlobalHeader, PaneHeader, etc.—compose primitives into app-specific patterns |

### Typical Workflow

1. **Pick a primitive**: Import a component from `src/shared/components/ui/` (or extend one if it doesn’t exist).
2. **Style with tokens**: Use Tailwind classes that reference the semantic tokens (`bg-background`, `text-foreground`, etc.).
3. **Add motion (optional)**: Wrap content in a helper from `src/shared/components/transitions/` instead of writing custom keyframes.
4. **Accessibility & Dark-mode check**: Confirm focus states, aria labels, and contrast in both light & dark themes.

> 💡 **Tip:** If you find yourself reaching for raw CSS, it’s usually a sign that the primitive or token you need should be added to the shared layers above. Discuss in PR before introducing new patterns.

---

## 🎬 Motion & Animations

### Standard Transitions

| Component | Duration | Easing | Use Case |
|-----------|----------|--------|----------|
| **PageFadeIn** | 300ms | ease-out | Page/section entry |
| **FadeInSection** | 40ms delay | ease-out | Staggered list items |
| **Modal** | 150ms | ease-in-out | Dialog open/close |
| **Tooltip** | 100ms | ease | Quick hover states |

### Implementation Examples

```typescript
// Page entry animation
import { PageFadeIn } from '@/shared/components/transitions';

export function MyPage() {
  return (
    <PageFadeIn>
      <div>Content fades in smoothly</div>
    </PageFadeIn>
  );
}

// Staggered list animation
import { FadeInSection } from '@/shared/components/transitions';

{items.map((item, index) => (
  <FadeInSection key={item.id} delay={index}>
    <Card>{item.content}</Card>
  </FadeInSection>
))}
```

### ⚠️ Animation Rules

- ✅ **DO**: Use existing transition components
- ✅ **DO**: Keep animations subtle and functional
- ❌ **DON'T**: Create new animation variants without design review
- ❌ **DON'T**: Use animations that distract from content

---

## 🎨 Visual Design System

### 🎯 Core Principles

1. **Utility-First**: Use Tailwind classes, not custom CSS
2. **Component-Based**: Extend shadcn-ui components
3. **Theme-Aware**: Support light/dark modes
4. **Accessible**: WCAG AA compliance minimum

### 🎨 Color Palette

```typescript
// Use theme tokens from themes/default/theme.ts
// Never hardcode colors!

// ✅ Good
<div className="bg-background text-foreground">
<Button variant="destructive">

// ❌ Bad
<div style={{ background: '#ffffff' }}>
<Button className="bg-red-500">
```

### 📏 Spacing System

Use Tailwind's spacing scale consistently:

| Size | Class | Pixels | Use Case |
|------|-------|--------|----------|
| xs | `space-1` | 4px | Tight groupings |
| sm | `space-2` | 8px | Related elements |
| md | `space-4` | 16px | Standard spacing |
| lg | `space-6` | 24px | Section breaks |
| xl | `space-8` | 32px | Major sections |

### 🔤 Typography

```typescript
// Heading hierarchy
<h1 className="text-4xl font-bold">     // Page titles
<h2 className="text-2xl font-semibold">  // Section headers
<h3 className="text-lg font-medium">     // Subsections
<p className="text-base">                // Body text
<span className="text-sm text-muted-foreground"> // Supporting text
```

### 🎭 Icons

Use lucide-react exclusively:

```typescript
import { Settings, User, FileText } from 'lucide-react';

// Consistent sizing
<Settings className="h-4 w-4" />  // Small (inline)
<Settings className="h-5 w-5" />  // Default
<Settings className="h-6 w-6" />  // Large
```

---

## 🌓 Dark Mode Support

### Implementation

```typescript
// Components automatically support dark mode via Tailwind
<div className="bg-background">         // Adapts to theme
<div className="border border-border">  // Theme-aware borders
<p className="text-muted-foreground">   // Secondary text

// Testing dark mode
// Toggle via: document.documentElement.classList.toggle('dark')
```

### Best Practices

1. **Always test in both modes** during development
2. **Use semantic color tokens** (background, foreground, etc.)
3. **Avoid color-specific names** (use "primary" not "blue")
4. **Check contrast ratios** for accessibility

---

## ♿ Accessibility Standards

### Required Elements

| Feature | Implementation | Testing |
|---------|---------------|---------|
| **Labels** | `aria-label` or visible text | Screen reader |
| **Focus** | `focus-visible:` styles | Tab navigation |
| **Contrast** | AA minimum (4.5:1) | Browser DevTools |
| **Semantics** | Proper HTML elements | Accessibility tree |

### Code Examples

```typescript
// ✅ Accessible button
<Button aria-label="Save document">
  <Save className="h-4 w-4" />
</Button>

// ✅ Keyboard navigation
<div className="focus-visible:ring-2 focus-visible:ring-offset-2">

// ✅ Screen reader text
<span className="sr-only">Loading...</span>
```

---

## 📱 Responsive Design

### Breakpoints

```typescript
// Tailwind default breakpoints
sm: '640px'   // Mobile landscape
md: '768px'   // Tablet
lg: '1024px'  // Desktop
xl: '1280px'  // Wide desktop
2xl: '1536px' // Ultra-wide

// Usage
<div className="px-4 md:px-6 lg:px-8">
```

### Mobile-First Approach

```typescript
// Start with mobile, add larger screen styles
<div className="
  grid grid-cols-1      // Mobile: single column
  md:grid-cols-2        // Tablet: two columns  
  lg:grid-cols-3        // Desktop: three columns
">
```

---

## 🔧 Component Guidelines

### Creating New Components

1. **Check shadcn-ui first** - don't reinvent the wheel
2. **Use composition** - combine existing primitives
3. **Follow naming conventions** - PascalCase for components
4. **Document props** - TypeScript interfaces + JSDoc
5. **Follow Rules of Hooks** - all hooks MUST be called before any early returns or conditional logic

### Example Component

```typescript
interface MyComponentProps {
  /** The title to display */
  title: string;
  /** Optional click handler */
  onClick?: () => void;
  /** Visual variant */
  variant?: 'default' | 'outline';
}

export function MyComponent({ 
  title, 
  onClick, 
  variant = 'default' 
}: MyComponentProps) {
  return (
    <Card className="p-4 transition-colors hover:bg-accent">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
    </Card>
  );
}
```

### ⚠️ Critical: Rules of Hooks

**ALWAYS call all hooks before any early returns or conditional logic.** This prevents React's "Expected static flag was missing" warnings and ensures consistent component behavior.

```typescript
// ❌ WRONG - hooks called conditionally
function BadComponent({ shouldRender, data }) {
  if (!shouldRender) return null; // ❌ Early return before hooks
  
  const [state, setState] = useState(false); // ❌ Hook called conditionally
  const ref = useRef(null);
  
  return <div>...</div>;
}

// ✅ CORRECT - all hooks before early returns
function GoodComponent({ shouldRender, data }) {
  // ✅ ALL hooks called first, unconditionally
  const [state, setState] = useState(false);
  const ref = useRef(null);
  const { value } = useCustomHook();
  
  // ✅ Early returns AFTER all hooks
  if (!shouldRender) return null;
  
  return <div>...</div>;
}
```

---

## 📱 Mobile Touch Interactions

### Double-Tap Detection Pattern

For components that need to respond to double-tap on mobile (where `onDoubleClick` is unreliable), use this standardized pattern:

```typescript
// Mobile double-tap detection refs
const lastTouchTimeRef = useRef<number>(0);
const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// Cleanup timeout on unmount
useEffect(() => {
  return () => {
    if (doubleTapTimeoutRef.current) {
      clearTimeout(doubleTapTimeoutRef.current);
    }
  };
}, []);

// Handle mobile double-tap detection
const handleMobileTap = (item: any) => {
  const currentTime = Date.now();
  const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
  
  if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
    // This is a double-tap, clear any pending timeout and execute action
    if (doubleTapTimeoutRef.current) {
      clearTimeout(doubleTapTimeoutRef.current);
      doubleTapTimeoutRef.current = null;
    }
    // Execute double-tap action (e.g., open lightbox)
    handleDoubleAction(item);
  } else {
    // This is a single tap, set a timeout to handle it if no second tap comes
    if (doubleTapTimeoutRef.current) {
      clearTimeout(doubleTapTimeoutRef.current);
    }
    doubleTapTimeoutRef.current = setTimeout(() => {
      // Handle single tap action (e.g., selection in batch mode)
      handleSingleTapAction(item);
      doubleTapTimeoutRef.current = null;
    }, 300);
  }
  
  lastTouchTimeRef.current = currentTime;
};
```

### Implementation Guidelines

- **Desktop**: Use standard `onDoubleClick` events
- **Mobile**: Use `onTouchEnd` with the double-tap detection pattern above
- **Timing**: 300ms window for detecting double-taps
- **Conditional**: Always use `isMobile` detection to conditionally apply touch vs. mouse handlers
- **Selection Conflict**: When implementing in components with selection (like batch mode), ensure the mobile tap handler manages both single-tap selection and double-tap actions to prevent interference

**Preventing Click Handler Interference on Mobile:**

```typescript
// Disable onClick on mobile to prevent interference with touch detection
<Component
  onClick={isMobile ? undefined : handleClick}
  onMobileTap={isMobile ? handleMobileTap : undefined}
  onDoubleClick={isMobile ? undefined : handleDoubleClick}
/>
```

### Components Using This Pattern

- `ImageGallery` - Double-tap to open image lightbox
- `VideoOutputsGallery` - Double-tap to open video lightbox  
- `ShotImageManager` - Double-tap to open image editor
- `Timeline` - Double-tap to open image lightbox
- `HoverScrubVideo` - Supports both `onDoubleClick` and `onTouchEnd` props

---

<div align="center">

**🔗 Quick References**

[Tailwind Docs](https://tailwindcss.com) • [shadcn-ui](https://ui.shadcn.com) • [Lucide Icons](https://lucide.dev) • [Back to Structure](../structure.md)

</div> 