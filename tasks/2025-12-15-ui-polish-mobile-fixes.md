# UI Polish & Mobile Fixes - December 15, 2025

---

## Master Checklist

### Quick Wins (CSS/Styling Only)
- [x] **Task 1**: Fix Travel Between Images Search Box Mobile Zoom ✅
- [x] **Task 4**: Reduce Font Weight on Dimensions Selector ✅
- [x] **Task 5**: Fix Contrast on Newest/Oldest Toggle ✅
- [x] **Task 9**: Fix Selected State Color for Buttons/Dropdowns in Dark Mode ✅
- [x] **Task 10**: Fix Pair Prompt Text Contrast in Dark Mode ✅
- [x] **Task 14**: Match Back Button Border to Aspect Ratio Button ✅

### Mobile Touch/Scroll Behavior
- [x] **Task 3**: Fix Double Tap to Open Images in Gallery (Mobile) ✅
- [x] **Task 6**: Enable Drag to Scroll on Project List ✅
- [x] **Task 11**: Fix Scroll-to-Top Behavior on Individual Shot Page (Mobile) ✅

### Component Logic/State Fixes
- [x] **Task 2**: Fix Open Video Button in Task Pane ✅
- [x] **Task 7**: Highlight Selected Project in Project List ✅
- [x] **Task 8**: Hide Shot Pane Handle on Shot List Page ✅
- [x] **Task 13**: Fix Single Segment Video Generation Child Creation ✅

### Layout Issues
- [x] **Task 12**: Fix Home Page Vertical Alignment on iPad ✅

---

## Task 1: Fix Travel Between Images Search Box Mobile Zoom ✅

**Area:** Travel Between Images Tool / Mobile

**Description:** The search box at the top of the Travel Between Images page has text that's too large, causing iOS to auto-zoom when the input is focused.

**Observed Behavior:** When tapping the search input on mobile (iOS), the page zooms in because the font size is below 16px.

**Requirements:**
- Set input font-size to at least 16px to prevent iOS auto-zoom
- Ensure the change doesn't break desktop layout
- Test on iOS Safari specifically

**Impacted Files:**
- `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx`
- `src/tools/travel-between-images/hooks/useVideoTravelHeader.tsx`
- Possibly `src/shared/components/ui/input.tsx` (if global fix is preferred)

**Execution Notes:**
- iOS auto-zooms on inputs with font-size < 16px
- Can use `@apply text-base` or explicit `font-size: 16px`
- May need `@media` query if desktop should remain smaller

**Testing Instructions:**
1. Open Travel Between Images on iOS Safari
2. Tap the search box
3. Verify page does NOT zoom in
4. Verify search still functions correctly

---

## Task 2: Fix Open Video Button in Task Pane ✅

**Area:** TasksPane Component

**Description:** The "open video" button in the task pane is clickable but doesn't open the lightbox as expected.

**Observed Behavior:** Clicking the button appears to do nothing - no lightbox opens.

**Requirements:**
- Debug the click handler on the open video button
- Ensure lightbox state is properly triggered
- Verify the video data is correctly passed to the lightbox

**Impacted Files:**
- `src/shared/components/TasksPane/TaskItem.tsx`
- `src/shared/components/TasksPane/TasksPane.tsx`
- `src/shared/components/MediaLightbox/` (lightbox opening logic)

**Execution Notes:**
- Check if onClick handler is properly bound
- Verify lightbox context/state management
- Look for conditional rendering that might prevent lightbox from showing
- Check console for any errors on click

**Additional Data Needed:**
- Which specific video type (generation, variant)?
- Does the button have the correct generation/video data attached?

**Testing Instructions:**
1. Create a video generation task
2. Wait for task to complete
3. Click the "open video" button in the task pane
4. Verify lightbox opens with the correct video

---

## Task 3: Fix Double Tap to Open Images in Gallery (Mobile) ✅

**Area:** Image Gallery / Mobile Gestures

**Description:** Double-tapping images on mobile often doesn't trigger the lightbox to open.

**Observed Behavior:** Double tap gesture is inconsistent - sometimes works, sometimes doesn't.

**Requirements:**
- Review double-tap detection timing thresholds
- Ensure double-tap doesn't conflict with other touch handlers
- Add visual feedback on first tap (optional, for UX clarity)
- Test across different devices/browsers

**Impacted Files:**
- `src/shared/components/ImageGallery/hooks/useMobileInteractions.ts`
- `src/shared/components/ImageGallery/index.tsx`
- `src/shared/components/ShotImageManager/hooks/useMobileGestures.ts`
- `src/shared/hooks/useDoubleTapWithSelection.ts`
- `src/shared/components/ImageGallery/utils/imageGallery-constants.ts` (tap timing constants)

**Execution Notes:**
- Check `DOUBLE_TAP_THRESHOLD` constant (typically 300ms is reliable)
- Verify touch event listeners aren't being cancelled prematurely
- Check for `event.preventDefault()` calls that might interfere
- Consider using pointer events instead of touch events

**Testing Instructions:**
1. Open gallery on mobile device
2. Double-tap multiple images
3. Verify lightbox opens consistently (at least 9/10 attempts)
4. Test on both iOS Safari and Chrome Android

---

## Task 4: Reduce Font Weight on Dimensions Selector ✅

**Area:** Video Travel Tool / Dimensions Selector

**Description:** The dimensions selector (label and options) text feels too bold compared to the rest of the UI.

**Observed Behavior:** Text appears heavier than surrounding UI elements.

**Requirements:**
- Reduce font-weight on the selector label
- Reduce font-weight on the dropdown options
- Match the weight to surrounding form elements

**Impacted Files:**
- `src/tools/travel-between-images/components/ShotEditor/ui/Header.tsx` (likely location)
- `src/tools/travel-between-images/components/ShotEditor/index.tsx`
- `src/tools/travel-between-images/components/ShotEditor/utils/dimension-utils.ts`
- Or shared component: `src/shared/components/ui/select.tsx`

**Execution Notes:**
- Use `font-normal` (400) or `font-light` (300) instead of current weight
- Check if this is a global select styling issue or specific to this component

**Testing Instructions:**
1. Navigate to video travel tool page
2. View the dimensions selector
3. Verify text weight matches surrounding elements
4. Check both label and dropdown options

---

## Task 5: Fix Contrast on Newest/Oldest Toggle ✅

**Area:** Gallery Controls / Toggle Component

**Description:** The Newest/Oldest toggle has poor contrast making it hard to see the current selection.

**Observed Behavior:** Selected state is not clearly distinguishable from unselected state.

**Requirements:**
- Improve contrast between selected and unselected states
- Ensure accessibility standards are met (4.5:1 contrast ratio minimum)
- Test in both light and dark mode

**Impacted Files:**
- `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx`
- `src/tools/travel-between-images/hooks/useVideoTravelHeader.tsx`
- `src/shared/components/ShotsPane/ShotsPane.tsx`
- `src/shared/components/ui/toggle.tsx` or `src/shared/components/ui/toggle-group.tsx`

**Execution Notes:**
- Use theme tokens for consistent theming
- Check `data-state="on"` styling for toggle
- May need to adjust both background and text color

**Testing Instructions:**
1. View the Newest/Oldest toggle
2. Toggle between states
3. Verify selected state is clearly visible
4. Test in both light and dark mode

---

## Task 6: Enable Drag to Scroll on Project List ✅

**Area:** Project List / Horizontal Scroll

**Description:** Users cannot drag to scroll horizontally through the project list.

**Observed Behavior:** Mouse/touch drag doesn't scroll the project list horizontally.

**Requirements:**
- Implement drag-to-scroll (momentum scrolling) on project list
- Support both mouse drag and touch swipe
- Prevent text selection during drag
- Maintain click functionality for project selection

**Impacted Files:**
- `src/shared/components/ProjectSelectorModal.tsx`
- `src/shared/components/GlobalHeader.tsx` (if project list is in header)
- May need new hook: `src/shared/hooks/useDragToScroll.ts`

**Execution Notes:**
- Consider using a library like `react-indiana-drag-scroll` or custom implementation
- Need to differentiate between click and drag (use movement threshold)
- CSS: `cursor: grab` when idle, `cursor: grabbing` when dragging
- May need `overflow-x: scroll` with `-webkit-overflow-scrolling: touch`

**Testing Instructions:**
1. Open project list view
2. Click and drag horizontally
3. Verify list scrolls smoothly
4. Verify clicking still selects projects (not just drags)

---

## Task 7: Highlight Selected Project in Project List ✅

**Area:** Project List / Visual State

**Description:** The currently selected project has no visual indicator in the project list.

**Observed Behavior:** All projects look the same - can't tell which one is active.

**Requirements:**
- Add visual highlight to the selected/active project
- Use consistent styling (background color, border, or similar)
- Ensure highlight is visible in both light and dark modes

**Impacted Files:**
- `src/shared/components/ProjectSelectorModal.tsx`
- `src/shared/contexts/ProjectContext.tsx` (to get current project ID)
- `src/shared/components/GlobalHeader.tsx`

**Execution Notes:**
- Compare current project ID with each project in list
- Use theme tokens: `bg-accent` or `ring-primary` for highlight
- Could add checkmark icon as secondary indicator

**Testing Instructions:**
1. Open project list
2. Verify currently active project is visually distinct
3. Switch projects and verify highlight moves
4. Test in both light and dark mode

---

## Task 8: Hide Shot Pane Handle on Shot List Page ✅

**Area:** Video Travel Tool / Shot Pane

**Description:** The shot pane handle/grip is visible on the shot list page where it shouldn't appear.

**Observed Behavior:** Handle shows when viewing the shot list, which is incorrect.

**Requirements:**
- Detect when user is on the shot list page
- Conditionally hide the shot pane handle in this view
- Ensure handle still appears on individual shot pages

**Impacted Files:**
- `src/shared/components/ShotsPane/ShotsPane.tsx`
- `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx`
- Possibly `src/shared/components/ui/resizable.tsx`

**Execution Notes:**
- May need to pass a prop to indicate current view
- Could use route matching or context to determine view state
- Check for existing `isShotListView` or similar flag

**Testing Instructions:**
1. Navigate to shot list page in video travel tool
2. Verify shot pane handle is hidden
3. Navigate to individual shot page
4. Verify handle is visible and functional

---

## Task 9: Fix Selected State Color for Buttons/Dropdowns in Dark Mode ✅

**Area:** Dark Mode Theme / UI Components

**Description:** Selected state colors for buttons (like page toggle in gallery) and dropdown menu items feel off in dark mode.

**Observed Behavior:** The selected/active state color doesn't feel cohesive with the dark mode theme.

**Requirements:**
- Audit selected state colors for buttons in dark mode
- Audit selected state colors for dropdown items in dark mode
- Adjust colors to feel more natural and cohesive
- Ensure sufficient contrast

**Impacted Files:**
- `src/index.css` (dark mode theme variables)
- `src/shared/components/ui/button.tsx`
- `src/shared/components/ui/toggle.tsx`
- `src/shared/components/ui/dropdown-menu.tsx`
- `src/shared/components/ui/select.tsx`

**Execution Notes:**
- Look at CSS variables like `--accent`, `--primary`, `--muted`
- Check `data-state="checked"` or `data-state="active"` styles
- May need to adjust both background and text color for sufficient contrast
- Reference: `dark:bg-accent` and similar classes

**Testing Instructions:**
1. Switch to dark mode
2. Check page toggle buttons in gallery - verify selected state looks good
3. Open dropdowns - verify selected/hover states look good
4. Compare to light mode to ensure consistency

---

## Task 10: Fix Pair Prompt Text Contrast in Dark Mode ✅

**Area:** Shot Editor / Timeline / Dark Mode

**Description:** Pair prompt text in the shot editor/timeline view is too dark (dark blue) in dark mode, making it hard to read.

**Observed Behavior:** Text is nearly invisible against the dark background.

**Requirements:**
- Lighten pair prompt text color in dark mode
- Maintain readability in light mode
- Ensure sufficient contrast ratio (4.5:1 minimum)

**Impacted Files:**
- `src/tools/travel-between-images/components/Timeline/PairRegion.tsx`
- `src/tools/travel-between-images/components/Timeline/PairPromptModal.tsx`
- `src/shared/components/ShotImageManager/components/PairPromptIndicator.tsx`
- `src/tools/travel-between-images/components/ShotEditor/index.tsx`

**Execution Notes:**
- Use `text-foreground` or `text-muted-foreground` for automatic theme support
- If custom color is needed, add dark mode variant: `text-blue-600 dark:text-blue-300`
- Check for hardcoded color values that don't respond to theme

**Testing Instructions:**
1. Open shot editor/timeline in dark mode
2. View pair prompt text
3. Verify text is clearly readable
4. Switch to light mode and verify still readable

---

## Task 11: Fix Scroll-to-Top Behavior on Individual Shot Page (Mobile) ✅

**Area:** Video Travel Tool / Mobile Navigation

**Description:** Scroll-to-top doesn't scroll completely to the top on mobile - the floating shot name element remains visible.

**Observed Behavior:** After triggering scroll-to-top, page stops just before the actual top, leaving floating element visible.

**Requirements:**
- Fix scroll behavior to reach absolute top of page
- Ensure floating shot element is hidden when at top
- Test on mobile specifically

**Impacted Files:**
- `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx`
- `src/tools/travel-between-images/hooks/useStickyHeader.ts`
- `src/shared/hooks/useShotNavigation.ts`

**Execution Notes:**
- Check scroll target element - may be scrolling to wrong reference
- Look for offset calculations that might be incorrect
- May need to account for header height in scroll calculation
- Check `scrollTo({ top: 0, behavior: 'smooth' })`

**Testing Instructions:**
1. Open individual shot page on mobile
2. Scroll down
3. Trigger scroll-to-top (tap header/button)
4. Verify page scrolls completely to top
5. Verify floating shot element is hidden

---

## Task 12: Fix Home Page Vertical Alignment on iPad ✅

**Area:** Home Page / iPad Layout

**Description:** Home page elements don't appear vertically centered/aligned on iPad.

**Observed Behavior:** Content feels off-center or misaligned vertically.

**Requirements:**
- Audit vertical centering on iPad (768px-1024px breakpoint)
- Fix flexbox/grid alignment for iPad viewport
- Ensure hero and content sections are properly centered

**Impacted Files:**
- `src/pages/Home/HomePage.tsx`
- `src/pages/Home/components/HeroSection.tsx`
- `src/pages/Home/components/CreativePartnerPane.tsx`
- `src/pages/Home/components/PhilosophyPane.tsx`
- `src/pages/Home/constants.ts`

**Execution Notes:**
- Use browser dev tools to emulate iPad (1024x768 or 768x1024)
- Check for `min-h-screen` with `flex items-center justify-center`
- May need tablet-specific breakpoint: `md:` or custom breakpoint
- Check for fixed heights that might not adapt to iPad

**Testing Instructions:**
1. Open home page on iPad (or emulator)
2. Verify content is vertically centered
3. Test both portrait and landscape orientations
4. Verify no awkward gaps or misalignments

---

## Task 13: Fix Single Segment Video Generation Child Creation ✅

**Area:** Video Generation / Backend Logic

**Description:** When generating a single segment video, the system doesn't create a child video properly. The indicator shows "0/1 videos generated".

**Observed Behavior:** Child video is not created/associated with the parent generation.

**Requirements:**
- Debug single segment video generation flow
- Ensure child video is properly created in database
- Update child count indicator after generation
- Verify `based_on` relationship is set correctly

**Impacted Files:**
- `src/shared/lib/tasks/individualTravelSegment.ts`
- `src/tools/travel-between-images/components/VideoGallery/components/ChildGenerationsView.tsx`
- `src/tools/travel-between-images/components/VideoGallery/components/VideoItem.tsx`
- `supabase/functions/complete_task/` (edge function)

**Execution Notes:**
- Compare with multi-segment flow to see what's different
- Check if `based_on` field is being set
- Look at `complete_task` edge function for child creation logic
- May be a task type detection issue

**Additional Data Needed:**
- Database query: check if child row exists but isn't linked
- Edge function logs from a single segment generation

**Testing Instructions:**
1. Create a single segment video generation
2. Wait for generation to complete
3. Check child indicator shows "1/1 videos generated"
4. Verify child video appears in variant selector

---

## Task 14: Match Back Button Border to Aspect Ratio Button ✅

**Area:** Video Travel Tool / Button Styling

**Description:** The back button border style is inconsistent with the aspect ratio button border.

**Observed Behavior:** Back button has different border styling than nearby aspect ratio button.

**Requirements:**
- Identify the aspect ratio button's border style
- Apply matching style to back button
- Ensure consistency across related buttons

**Impacted Files:**
- `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx`
- `src/tools/travel-between-images/components/ShotEditor/ui/Header.tsx`
- `src/shared/components/AspectRatioSelector.tsx`

**Execution Notes:**
- Inspect aspect ratio button to get exact border values
- Look for `border`, `ring`, or `outline` classes
- May be `border-border` or similar theme token

**Testing Instructions:**
1. Navigate to video travel tool page
2. Compare back button and aspect ratio button borders
3. Verify they now match visually
4. Check in both light and dark modes

---

## Notes

- Tasks 1, 4, 5, 9, 10, 14 are pure CSS changes - lowest risk
- Task 13 involves backend/edge function logic - highest complexity
- Tasks 3, 6, 11 involve touch/scroll behavior - test on real devices
- Task 12 requires iPad testing specifically

