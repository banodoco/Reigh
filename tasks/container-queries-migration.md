# Container Queries Migration Plan

## Objective
Switch the project’s responsive system from viewport-based media queries to CSS Container Queries so that the UI reacts to the *actual* content area after panes are locked/unlocked.

---

## 1. Technical Approach
1. Use the official **@tailwindcss/container-queries** plugin (Tailwind ≥ 3.3).
2. Add a dedicated content wrapper (`.content-container`) around all main‐area pages.  
   • `container-type: inline-size;` – width-only containment for performance.
3. Disable Tailwind’s core `container` plugin to avoid conflicts.
4. Adopt the plugin’s `c-` prefix for container variants (`c-lg:flex-row`, `c-sm:grid-cols-2`, …).
5. Replace viewport breakpoints incrementally:  
   a. core layout components first (`Layout`, `PageHeader`, `Pane` toolbars).  
   b. shared primitives (`PaneHeader`, `GenerationsPane`)  
   c. individual pages & tool modules.
6. Delete any JS-only layout workarounds once migration reaches 100 %.

---

## 2. Roll-out Steps
| Step | Owner | Status |
|------|-------|--------|
| Add plugin & config changes | @AI | ✅  | 
| Introduce `.content-container` wrapper | @AI | ✅ |
| Migrate high-traffic pages (ToolSelector, ShotsPage, GenerationsPage) | @AI | ✅ |
| Migrate shared components (`PaneHeader`, cards, grids) | | ⬜ |
| Code-search & bulk convert remaining `lg:`/`xl:` classes | | ⬜ |
| Remove legacy breakpoint hacks (`useContentResponsive` only used for JS decisions) | | ⬜ |

---

## 3. Class Conversion Cheatsheet
| Viewport Class | Container Query Equivalent |
|---------------|--------------------------|
| `sm:` | `c-sm:` |
| `md:` | `c-md:` |
| `lg:` | `c-lg:` |
| `xl:` | `c-xl:` |
| `2xl:` | `c-2xl:` |

**Tip:** Use multi-cursor replace in VS Code:  
`Find: /(\s|:)(lg|xl|2xl|md|sm):/  →  $1c-$2:`

---

## 4. Testing Checklist
- [ ] Open/close each pane at multiple widths – layout should swap at identical visual widths as manual browser resize.
- [ ] Verify no CLS jumps when panes animate.
- [ ] Dark/light mode parity.
- [ ] Mobile Safari (iOS 15+) – container queries work behind feature flag but are now generally supported.
- [ ] Legacy browsers: fallback is viewport breakpoints (unchanged classes) until full migration.

---

## 5. Cleanup (Post-Migration)
- Remove `useContentResponsive` fallback that returns viewport sizes when `contentBreakpoints` present.  
- Delete any duplicate utility classes created during transition.
- Re-enable Tailwind’s core `container` if project needs it for max-width wrappers (optional).

---

*Last updated: <!-- Date placeholder, auto-filled on commit -->* 