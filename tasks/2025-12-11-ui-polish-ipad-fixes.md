# Task Document – UI Polish & iPad Fixes

**Date:** 2025-12-11  
**Status:** 🚧 In Progress

---

## Master Checklist

### Quick Wins (unblock testing quickly)
- [x] **Task 12** – Remove Shot Dimensions Tooltip ✅
  - *Simple tooltip removal, no dependencies*
- [x] **Task 13** – Left-Align Sign Out Button on iPad ✅
  - *Single alignment fix*
- [x] **Task 18** – Remove Share Button from Generation Pane Gallery Items ✅
  - *Hide one button conditionally*

### Video Travel Tool Page Cluster (same area)
- [x] **Task 3** – Video Gallery Thumbnail Flashing on Back Navigation ✅
  - *Requires state preservation logic*
- [x] **Task 4** – Shots/Videos Toggle Alignment on iPad ✅
  - *Simple alignment, do with Task 3*

### MediaLightbox / Gallery Cluster (same area)
- [x] **Task 1** – PO Output Gallery Thumbnail Loading Transition ✅
  - *Smooth loading transition*
- [x] **Task 7** – Fix Image Z-Index During Reposition Toggle Dragging ✅
  - *Z-index layering fix*
- [x] **Task 21** – Add Skeleton for Variants in Media Lightbox ✅
  - *Show one skeleton if variant count unknown*

### Task Pane Cluster
- [x] **Task 6** – Add Project Scope Filter to Task Pane ✅
  - *Also add project symbol next to task ID with jump-to-project*
- [x] **Task 8** – Fix Inconsistent Open Video Button Tapping ✅
  - *Touch event debugging*

### Settings Modal Cluster
- [x] **Task 5** – Add Restore Default Settings Button (JoinClips) ✅
  - *New button component - positioned above Gap/Context Frames on the right*
- [x] **Task 14** – Fix Command Button Position Shift on Settings Modal ✅
  - *Move copy/hide buttons to bottom of command line simulator, centered*
- [x] **Task 15** – Add Skeletons for Transactions and Privacy Views ✅
  - *Loading states for credits history and task log tables*

### Mobile/iPad Specific Cluster
- [x] **Task 2** – OpenShot Editor Button Layout on Image Generator Modal (Mobile) ✅
  - *Layout repositioning*
- [x] **Task 9** – Reduce Edited Video Size on iPad ✅
  - *Size constraint adjustment*
- [x] **Task 10** – Fix iPad Freeze on Edit Images Shots View ✅
  - *Performance investigation - potentially complex*

### Tool Selector Page
- [x] **Task 16** – Remember Tool Selector Button Visibility State ✅
  - *Session state + animation, removed CLOUD MODE badge*

### Generate Video Modal
- [x] **Task 17** – Fix Generate Video Modal Skeleton Size Mismatch ✅
  - *Skeleton dimension matching*

### Edit Pages Cluster (do together - shared patterns)
- [x] **Task 19** – Fix Text Input Pop-up on iPad ✅
  - *Debug pop-up trigger*
- [x] **Task 20** – Cache and Preload Media in Edit Views ✅
  - *Preloading logic*
- [x] **Task 22** – Hide or Fix All Tools Filter on Edit Pages ✅
  - *Filter visibility/functionality*
- [x] **Task 23** – Add Create Variant/New Image to Edit Views ✅
  - *"Create as new image" toggle - creates generation instead of variant*

---

## Task 1 – PO Output Gallery Thumbnail Loading Transition ✅

**Area:** Video Travel Tool Page → PO output gallery

**Description:**  
The transition from gray placeholder to thumbnail in the PO output gallery is jarring. Images load partially then fully, which feels low quality.

**Observed Behavior:**  
Thumbnails appear abruptly after loading, with visible partial loading states that create a choppy visual experience.

**Requirements:**
- Implement a smoother loading transition similar to the image gallery
- Options: fade-in effect or progressive load effect
- Maintain placeholder until image is fully loaded, then transition smoothly

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/travel-between-images/components/VideoGallery/components/VideoItem.tsx` | Video thumbnail component - needs loading transition |
| `src/tools/travel-between-images/components/VideoGallery/components/ChildGenerationsView.tsx` | Child generations display - may need similar treatment |

**Execution Notes:**  
Added smooth fade-in transitions to VideoItem.tsx:
- Mobile poster images: Start with `opacity: 0`, transition to `opacity: 1` on load with `duration-300`
- Collage segment images: Same fade-in pattern, transitioning to `0.8` opacity (then `1.0` on hover)
- Uses CSS transitions for smooth visual effect

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Video Travel Tool page
2. Generate or view existing PO outputs in the gallery
3. Observe thumbnail loading - should fade in smoothly
4. Compare with image gallery loading behavior for consistency
5. Test with slow network throttling in DevTools

---

## Task 2 – OpenShot Editor Button Layout on Image Generator Modal (Mobile) ✅

**Area:** Video Generation Modal → Open Shot Editor button

**Description:**  
On mobile, the Open Shot Editor button still overlaps weirdly with the images in the modal.

**Observed Behavior:**  
Button positioning conflicts with image display, creating visual overlap and usability issues on mobile viewports.

**Requirements:**
- Reposition layout so Open Shot Editor button is on the right
- Button may span over 3 lines if needed
- Images should be constrained to the left (max 2/3 width)
- Shot name should be above the images
- Ensure no overlap on various mobile viewport sizes

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/VideoGenerationModal.tsx` | Video generation modal with Open Shot Editor button - mobile layout fix |

**Execution Notes:**  
Fixed mobile layout in VideoGenerationModal.tsx:
- On mobile, restructured DialogHeader to use vertical layout
- Shot name is now on its own line above
- Images and button are side-by-side below with proper width constraints:
  - Images container: max 2/3 width (66.666%)
  - Button: max 1/3 width (33.333%), allows text wrapping across multiple lines
- Added `whitespace-normal` and `h-auto` to button to allow multi-line text
- Desktop layout remains unchanged (horizontal layout)
- No overlap guaranteed by max-width constraints and proper flex layout

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Image Generator on mobile device or mobile emulation
2. Navigate to modal with OpenShot generation button
3. Verify button is positioned on the right, not overlapping images
4. Verify images are constrained to left side
5. Verify title is left of images
6. Test on iPhone SE (375px), iPhone 12 (390px), iPhone Plus (428px)

---

## Task 3 – Video Gallery Thumbnail Flashing on Back Navigation ✅

**Area:** Video Travel Tool Page → Video gallery

**Description:**  
When navigating between gallery pages, clicking forward then back causes thumbnails to flash and reappear. First load looks fine with no flashing, but subsequent back navigation triggers the flash.

**Observed Behavior:**  
Initial page load renders thumbnails smoothly. Navigating to next page then back causes all thumbnails to briefly disappear and re-render, creating a flashing effect.

**Requirements:**
- Prevent thumbnail re-rendering/flashing when navigating back to previously loaded pages
- Implement caching or state preservation for already-loaded pages
- First load and subsequent visits to the same page should look identical

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/travel-between-images/components/VideoGallery/hooks/useThumbnailLoader.ts` | Thumbnail loader hook - fixed initial state |

**Execution Notes:**  
Fixed the `useThumbnailLoader` hook to properly initialize `thumbnailLoaded` state:
- Changed from simple `useState(initialCacheStatus.isInitiallyCached)` to a function initializer
- The initializer now does an immediate synchronous browser cache check using `isInBrowserCache()`
- If the thumbnail is already in the browser cache (from previous page visit), state starts as `true`
- This prevents the flash because the loading placeholder is never shown for cached images

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Video Travel Tool page
2. Open video gallery with multiple pages of content
3. Click to page 2
4. Click back to page 1
5. Verify thumbnails do NOT flash/re-render
6. Repeat forward/back navigation several times
7. All transitions should be smooth without flashing

---

## Task 4 – Shots/Videos Toggle Alignment on iPad ✅

**Area:** Video Travel Tool Page → Shots/Videos toggle

**Description:**  
The Shots/Videos toggle needs better alignment on iPad.

**Observed Behavior:**  
Toggle is not right-aligned as expected on iPad viewports.

**Requirements:**
- Right-align the shots/videos toggle on iPad
- Ensure alignment is consistent across iPad sizes (standard, Pro, mini)

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx` | Main page with toggle - needs alignment adjustment for iPad |

**Execution Notes:**  
Moved the toggle out of the left-aligned search container into its own container with `ml-auto` to push it to the right side of the parent `justify-between` flex container.

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Video Travel Tool page on iPad (or iPad emulation)
2. Locate the Shots/Videos toggle
3. Verify it is right-aligned
4. Test on iPad mini, iPad, iPad Pro viewport sizes

---

## Task 5 – Add Restore Default Settings Button ✅

**Area:** JoinClipsSettingsForm component

**Description:**  
Add a "Restore Default Settings" button to allow users to reset settings to defaults.

**Observed Behavior:**  
No current way to reset to default settings - users must manually remember or guess defaults.

**Requirements:**
- Add a "Restore Default Settings" button to JoinClipsSettingsForm
- Button should reset all form fields to their default values
- Consider confirmation dialog or undo option to prevent accidental resets
- Style consistently with other form buttons

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/join-clips/components/JoinClipsSettingsForm.tsx` | Settings form component - add reset button |
| `src/tools/join-clips/settings.ts` | Default settings definition - source of reset values |
| `src/tools/join-clips/pages/JoinClipsPage.tsx` | Parent page - implements reset callback |

**Execution Notes:**  
- Added `onRestoreDefaults` optional callback prop to `JoinClipsSettingsForm`
- Button positioned above Gap Frames/Context Frames controls on the right (per user request)
- Implemented reset logic in `JoinClipsPage.tsx` using `joinSettings.updateFields` to reset all settings and `loraManager.clearAll()` to reset LoRAs

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Join Clips tool
2. Modify several settings from their defaults
3. Click "Restore Default Settings" button
4. Verify all settings return to default values
5. Verify form is still functional after reset
6. Test that Cancel/Save still work correctly after reset

---

## Task 6 – Add Project Scope Filter to Task Pane ✅

**Area:** Task pane → Filter controls

**Description:**  
Add a filter toggle for "This Project" vs "All Projects" to show tasks scoped to current project or all projects. Additionally, when filtering for a specific project, show a small project symbol next to the task ID that can be clicked to jump into that project.

**Observed Behavior:**  
Currently no way to filter tasks by project scope. All tasks are shown regardless of which project they belong to.

**Requirements:**
- Add filter toggle to the right of the task type filter
- Toggle options: "This Project" / "All Projects"
- When "All Projects" is selected and filtering by a specific project, show a small project symbol/icon next to the task ID
- Clicking the project symbol should navigate to that project
- Remember filter preference within session

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/TasksPane/TasksPane.tsx` | Main task pane - add filter controls |
| `src/shared/components/TasksPane/TaskList.tsx` | Task list rendering - filter logic |
| `src/shared/components/TasksPane/TaskItem.tsx` | Individual task items - add project symbol and click handler |
| `src/shared/hooks/useTasks.ts` | Tasks data hook - may need project filtering logic |

**Execution Notes:**  
Implemented project scope filtering:

1. **useTasks.ts** - Added `allProjects` and `allProjectIds` parameters to `usePaginatedTasks`:
   - When `allProjects=true`, queries tasks across ALL user's projects using `.in('project_id', allProjectIds)`
   - Cache key includes 'all' vs project ID to separate cache entries
   - Both count and data queries updated to support multi-project mode

2. **TasksPane.tsx** - Added project scope toggle:
   - State: `projectScope: 'current' | 'all'` with session storage persistence
   - Toggle UI: "This Project" / "All Projects" buttons below task type filter
   - Gets `projects` list from `useProject()` context, creates `allProjectIds` array
   - Creates `projectNameMap` lookup for displaying project names
   - Passes `showProjectIndicator` and `projectNameMap` to TaskList

3. **TaskList.tsx** - Added props passthrough:
   - New props: `showProjectIndicator?: boolean`, `projectNameMap?: Record<string, string>`
   - Passes these to each TaskItem with the correct project name

4. **TaskItem.tsx** - Added project indicator button:
   - Shows FolderOpen icon + truncated project name when `showProjectIndicator=true`
   - On click: calls `setSelectedProjectId(task.projectId)` and navigates to home page
   - Touch support with `onTouchEnd` handler for iPad
   - On mobile: shows only icon (not project name) for space

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Task Pane
2. Locate new project scope filter (right of task type filter)
3. Toggle between "This Project" and "All Projects"
4. Verify tasks filter correctly
5. In "All Projects" mode, verify project symbols appear next to task IDs
6. Click a project symbol - should navigate to that project
7. Switch between projects and verify filter state persists within session

---

## Task 7 – Fix Image Z-Index During Reposition Toggle Dragging ✅

**Area:** MediaLightbox → Reposition controls

**Description:**  
On iPad (at least), when dragging the reposition toggles, the image sometimes pops in front of the settings form.

**Observed Behavior:**  
During drag operations on reposition toggles, z-index conflicts cause the image to layer incorrectly, appearing above the settings form.

**Requirements:**
- Fix z-index layering so the image stays behind the settings form during dragging
- Ensure consistent layering across all drag states
- Test on iPad specifically

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/MediaLightbox/components/MediaDisplayWithCanvas.tsx` | Media display - z-index container |

**Execution Notes:**  
Added explicit `zIndex: 40` and `position: 'relative'` to the `<img>` element when in reposition mode. This ensures the image stays below the settings panel (z-index 80) during CSS transforms that create new stacking contexts.

**Additional Data Needed:** None

**Testing Instructions:**
1. Open MediaLightbox on iPad
2. Enter reposition mode
3. Drag reposition toggles
4. Verify image stays behind settings form at all times
5. Test rapid dragging and edge cases
6. Test on multiple iPad sizes

---

## Task 8 – Fix Inconsistent Open Video Button Tapping ✅

**Area:** Task pane → Open video button

**Description:**  
On iPad, tapping the open video button works inconsistently.

**Observed Behavior:**  
Button taps are not reliably registered on iPad. Some taps work, others don't respond.

**Requirements:**
- Debug and fix touch/click event handling
- Ensure reliable button response on every tap
- May need to investigate touch target size, event handlers, or competing gestures

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/TasksPane/TaskItem.tsx` | Task item with open video button - fix touch handling |

**Execution Notes:**  
Fixed touch handling for all action buttons (Open Video, Open Image, Visit Shot):
- Added `onTouchEnd` handlers with `e.preventDefault()` and `e.stopPropagation()` for reliable iPad touch
- Increased touch target size on mobile: `p-2 min-w-[32px] min-h-[32px]` (was `p-1`)
- Increased icon size on mobile: `w-4 h-4` (was `w-3 h-3`)
- Uses `cn()` utility with `isMobile` check to apply mobile-specific styles

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Task Pane on iPad
2. Locate a task with a video
3. Tap "Open Video" button repeatedly
4. Verify every tap registers correctly
5. Test with different tap speeds and positions on button
6. Compare behavior with desktop click

---

## Task 9 – Reduce Edited Video Size on iPad ✅

**Area:** Edit Video page

**Description:**  
The edited video is too large on iPad.

**Observed Behavior:**  
Video display takes up too much screen space on iPad, unlike the more compact desktop version.

**Requirements:**
- Make the edited video much smaller on iPad
- Match the desktop size/proportions
- Ensure video remains usable and viewable

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/edit-video/pages/EditVideoPage.tsx` | Main edit video page - responsive sizing |
| `src/tools/edit-video/components/InlineEditVideoView.tsx` | Inline video editor - tablet size constraints |

**Execution Notes:**  
Added tablet-specific size constraints to InlineEditVideoView.tsx:
- Video container: `max-h-[35vh]` on tablet (vs `aspect-video` on mobile, `max-h-[40vh]` on desktop)
- Video element: `max-h-[30vh]` on tablet for compact display
- Uses `isTablet` hook to detect iPad/tablet devices
- Maintains usability while reducing visual footprint

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Video page on iPad
2. Load a video for editing
3. Verify video size matches desktop proportions
4. Video should be compact, not oversized
5. Ensure video controls remain accessible
6. Test on iPad mini, iPad, iPad Pro

---

## Task 10 – Fix iPad Freeze on Edit Images Shots View ✅

**Area:** Edit Images page → Shots view

**Description:**  
Clicking into the shots view causes iPad to freeze - likely heavy/inefficient rendering or processing.

**Observed Behavior:**  
iPad becomes unresponsive when entering shots view. May require force-closing the app.

**Requirements:**
- Investigate root cause of freeze (rendering, data processing, memory)
- Implement optimizations:
  - Lazy loading
  - Virtualization for long lists
  - Reduce initial render load
  - Debounce expensive operations
- Ensure smooth performance on iPad

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/edit-images/pages/EditImagesPage.tsx` | Main edit images page - performance optimization |
| `src/tools/edit-images/components/InlineEditView.tsx` | Inline edit view - may have heavy rendering |

**Execution Notes:**  
Root cause: All images in all shots were rendered at once, causing memory pressure and blocking the main thread on iPad.

Fix in `ShotImagesRow` component:
- Limit initial render to 10 images per shot (`MAX_INITIAL_IMAGES = 10`)
- Show "+N more" button to load additional images on demand
- Added `loading="lazy"` for browser-level lazy loading
- Added `decoding="async"` for non-blocking image decode
- Prefer thumbnails over full-size images (`thumbUrl || imageUrl || url || location`)

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Images page on iPad
2. Click into Shots view
3. Verify page remains responsive
4. Test with varying amounts of shots data
5. Monitor memory usage if possible
6. No freeze or significant lag should occur

---

## Task 12 – Remove Shot Dimensions Tooltip ✅

**Area:** Create Project and Update Project Settings modals

**Description:**  
Remove the tooltip for Shot Dimensions field.

**Observed Behavior:**  
Shot Dimensions field has a tooltip that should be removed.

**Requirements:**
- Remove tooltip from Shot Dimensions field in Create Project modal
- Remove tooltip from Shot Dimensions field in Update Project Settings modal

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/AspectRatioSelector.tsx` | Shared component - removed tooltip wrappers |

**Execution Notes:**  
The tooltip was in the shared `AspectRatioSelector` component, not in the modals directly. Removed `TooltipProvider`, `Tooltip`, and `TooltipTrigger` wrappers from around the `Select` component in both layout variations (with and without visualizer).

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Create Project modal
2. Hover over Shot Dimensions field
3. Verify no tooltip appears
4. Open Project Settings modal
5. Hover over Shot Dimensions field
6. Verify no tooltip appears

---

## Task 13 – Left-Align Sign Out Button on iPad ✅

**Area:** App settings modal

**Description:**  
Make the "Sign out" button at the bottom left-aligned on iPad.

**Observed Behavior:**  
Sign out button is not left-aligned on iPad.

**Requirements:**
- Left-align the "Sign out" button on iPad
- Maintain consistent styling with rest of modal

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/SettingsModal.tsx` | Settings modal - adjust sign out button alignment for iPad |

**Execution Notes:**  
Removed the conditional `modal.isMobile ? '' : 'mr-auto'` class, simplifying to always use `mr-auto` for consistent left-alignment on all devices.

**Additional Data Needed:** None

**Testing Instructions:**
1. Open App Settings modal on iPad
2. Scroll to bottom
3. Verify "Sign out" button is left-aligned
4. Test on multiple iPad sizes

---

## Task 14 – Fix Command Button Position Shift on Settings Modal ✅

**Area:** Settings modal → Commands section

**Description:**  
When revealing commands, the "copy" and "reveal" buttons (reveal becomes "hide") move to a different position below the command line. The buttons should be at the bottom of the command line simulator and stay in a fixed position.

**Observed Behavior:**  
Buttons shift position when toggling between reveal/hide states, causing jarring layout changes.

**Requirements:**
- Move copy/hide buttons to the bottom of the command line simulator
- Keep buttons in the same fixed position when toggling between reveal/hide states
- No layout shift when command is revealed or hidden

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/SettingsModal.tsx` | Settings modal - fix button positioning in commands section |

**Execution Notes:**  
- Refactored command line simulator to use absolute positioning for buttons
- Added `pb-12` padding to command area to make space for buttons
- Positioned buttons with `absolute bottom-2 left-3 right-3 flex items-center justify-center gap-2` (centered per user request)
- Adjusted fade overlay to have `bottom-10` so it doesn't cover buttons
- Applied to both Install and Run tabs

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Settings modal
2. Navigate to Commands section
3. Note position of copy/reveal buttons
4. Click reveal to show command
5. Verify buttons remain in exact same position (now at bottom of command line simulator)
6. Click hide
7. Verify buttons still don't move
8. Repeat toggle several times

---

## Task 15 – Add Skeletons for Transactions and Privacy Views ✅

**Area:** Settings modal → Transactions and Privacy views

**Description:**  
Add skeleton loading states for the Transactions views and Privacy views.

**Observed Behavior:**  
Views show no loading indicator while data is being fetched.

**Requirements:**
- Add skeleton loading states for Transactions view
- Add skeleton loading states for Privacy view
- Skeletons should match approximate layout of loaded content

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/CreditsManagement.tsx` | Credits management - add skeleton states for history and task-log tabs |

**Execution Notes:**  
- Added skeleton tables for the 'history' tab (ledger) with Date, Type, Amount columns
- Added skeleton tables for the 'task-log' tab with ID, Date, Task Type, Project, Status, Duration, Cost columns
- Skeletons match the actual table structure of loaded content

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Settings modal
2. Navigate to Transactions view
3. If data is loading, verify skeleton appears
4. Navigate to Privacy view
5. If data is loading, verify skeleton appears
6. Skeletons should match final content layout
7. Test with slow network throttling to see loading states

---

## Task 16 – Remember Tool Selector Button Visibility State ✅

**Area:** Tool Selector page

**Description:**  
When buttons disappear (e.g., "animate characters" for cloud users only), the state resets every time the page is revisited.

**Observed Behavior:**  
Button visibility state is not persisted. Disappearing button animation replays on every page visit.

**Requirements:**
- Remember the button visibility state within the session
- Add a subtle animation/transition when buttons disappear (first time only)
- On subsequent visits, hidden buttons should simply not render (no animation)

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/pages/ToolSelectorPage.tsx` | Tool selector page - add session state for button visibility and improved transitions |

**Execution Notes:**  
- Added session storage tracking for tools seen in disabled state (`SEEN_DISABLED_TOOLS_KEY`)
- Character-animate is always included in the grid (so ToolCard can render and track state)
- During loading: if tool was previously seen as disabled, show it disabled immediately (no flash)
- After loading: based on actual cloud mode setting
- Removed "CLOUD MODE" badge - tool just appears grayed out when disabled
- Tool automatically becomes enabled when user switches to cloud mode

**Additional Data Needed:** None

**Testing Instructions:**
1. Log in as a user where some tools are hidden (e.g., cloud user without "animate characters")
2. Visit Tool Selector page
3. Observe button disappear animation (should be subtle/elegant)
4. Navigate away
5. Return to Tool Selector page
6. Verify hidden buttons are simply not shown (no re-animation)
7. Verify visible buttons render correctly

---

## Task 17 – Fix Generate Video Modal Skeleton Size Mismatch ✅

**Area:** Generate Video modal

**Description:**  
Skeleton loader is a different size than the actual content, causing the modal to snap/jump down after loading.

**Observed Behavior:**  
Modal height changes noticeably when skeleton is replaced with actual content, creating a jarring layout shift.

**Requirements:**
- Match skeleton dimensions to actual content size
- Prevent layout shift when content loads
- Modal size should remain stable throughout loading process

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/VideoGenerationModal.tsx` | Video generation modal - fixed footer skeleton |

**Execution Notes:**  
The issue was that the footer with the "Generate" button was only rendered after loading completed, causing a height jump. Fixed by:
- Always rendering the footer div
- Showing a skeleton (`h-11 w-full max-w-md`) during loading
- Showing the actual button after loading
- This maintains consistent modal height throughout

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Generate Video modal
2. Observe skeleton during loading
3. Watch transition from skeleton to content
4. Verify no visible height/width jump
5. Modal should remain same size throughout
6. Test with slow network throttling to see full loading state

---

## Task 18 – Remove Share Button from Generation Pane Gallery Items ✅

**Area:** Generation pane → Gallery items

**Description:**  
Share button is showing on gallery items in the generation pane on iPad (at least) when it shouldn't.

**Observed Behavior:**  
Share button appears on gallery items where it should be hidden.

**Requirements:**
- Hide/remove the share button from gallery items in the generation pane
- Ensure removal applies to iPad and other affected devices

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/GenerationsPane/GenerationsPane.tsx` | Generations pane - hide share button on gallery items |

**Execution Notes:**  
Added `showShare={false}` prop to the `ImageGallery` component in GenerationsPane. The ImageGallery already supported this prop (defaulting to true), so just needed to explicitly set it to false.

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Generation pane on iPad
2. View gallery items
3. Verify no share button is visible on gallery items
4. Test on multiple iPad sizes
5. Verify share functionality still works where intended (e.g., detail view)

---

## Task 19 – Fix Text Input Pop-up on iPad ✅

**Area:** Text input fields → Pop-up (shown alongside voice input)

**Description:**  
The text input pop-up doesn't open when triggered on iPad.

**Observed Behavior:**  
Tapping to open text input pop-up does nothing on iPad. Works on other platforms.

**Requirements:**
- Debug and fix the pop-up trigger mechanism on iPad
- Ensure pop-up opens reliably when triggered
- Maintain functionality alongside voice input

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/components/ui/ai-input-button.tsx` | AI input button - added Popover wrapper for mobile text mode |

**Execution Notes:**  
Root cause: On mobile/iPad (`isMobile=true`), the text mode button was returned without its Popover wrapper, so the popup couldn't open.

Fix: Added complete Popover wrapping for text mode on mobile devices, matching the desktop implementation but without the Tooltip wrapper (which isn't needed on touch devices).

**Additional Data Needed:** None

**Testing Instructions:**
1. Open any page with text input + voice input on iPad
2. Tap to trigger text input pop-up
3. Verify pop-up opens correctly
4. Test voice input alongside text input
5. Test on multiple iPad sizes
6. Compare with desktop/other mobile behavior

---

## Task 20 – Cache and Preload Media in Edit Views ✅

**Area:** Edit Images and Edit Videos pages

**Description:**  
There's a weird snap when clicking into these views because media isn't preloaded.

**Observed Behavior:**  
Layout shifts and content snaps into place when navigating to edit views, as media loads after initial render.

**Requirements:**
- Cache whether we have an image loaded in edit images / video loaded in edit videos
- Preload the media so it displays smoothly without layout shift when clicking in
- Smooth transition into edit views

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/edit-images/pages/EditImagesPage.tsx` | Edit images page - preload logic |
| `src/tools/edit-video/pages/EditVideoPage.tsx` | Edit video page - preload logic |
| `src/tools/edit-images/components/InlineEditView.tsx` | Inline edit view - cache state |
| `src/tools/edit-video/components/InlineEditVideoView.tsx` | Inline video edit view - cache state |

**Execution Notes:**  
Added image/video preloading to both Edit Images and Edit Videos pages:

**EditImagesPage.tsx:**
- Added `preloadImage()` helper function
- Preloads image when restoring last edited media from settings
- Preloads image when clicking on an item in the selection modal
- Uses `new Image()` to warm up browser cache before navigation

**EditVideoPage.tsx:**
- Added `preloadVideoPoster()` helper function  
- Preloads poster/thumbnail when restoring last edited media
- Preloads poster when clicking on a video in the selection panel

This ensures the media is already in browser cache when the edit view mounts, preventing the visual "snap" from loading.

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Edit Images page
2. Click into edit view
3. Verify smooth transition with no layout snap
4. Navigate to Edit Videos page
5. Click into edit view
6. Verify smooth transition with no layout snap
7. Test with both cached and uncached media

---

## Task 21 – Add Skeleton for Variants in Media Lightbox ✅

**Area:** Media lightbox → Variants section

**Description:**  
Add skeleton loading state for variants while they're loading. Show one skeleton to start if we don't know how many variants there are.

**Observed Behavior:**  
Variants section shows empty or jumps when variants load, no loading indicator.

**Requirements:**
- Add skeleton loading state for variants
- If variant count is unknown, show a single skeleton placeholder
- Once count is known, show appropriate number of skeletons
- Smooth transition from skeletons to loaded variants

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/components/VariantSelector.tsx` | Variant selector - show single skeleton |

**Execution Notes:**  
Modified the `isLoading` block in VariantSelector to render only one skeleton (`<Skeleton className="w-16 h-10 rounded" />`) instead of three, as requested by user since the total variant count is unknown during loading.

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Media Lightbox with an item that has variants
2. Observe loading state
3. Verify single skeleton shows if count unknown
4. Verify skeletons match approximate variant layout
5. Verify smooth transition to loaded variants
6. Test with slow network throttling

---

## Task 22 – Hide or Fix All Tools Filter on Edit Pages ✅

**Area:** Edit Images and Edit Videos pages → All Tools filter

**Description:**  
The All Tools filter doesn't work on these pages.

**Observed Behavior:**  
All Tools filter is present but non-functional on Edit Images and Edit Videos pages.

**Requirements:**
- Either hide the All Tools filter on these pages
- Or fix it to work properly
- Ensure consistent behavior with other pages

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/tools/edit-images/pages/EditImagesPage.tsx` | Edit images page - filter fix or removal |
| `src/tools/edit-video/pages/EditVideoPage.tsx` | Edit video page - filter fix or removal |

**Execution Notes:**  
Fixed by disabling the tool type filter in Edit Images page galleries:
- Removed `currentToolType` and `currentToolTypeName` props from ImageGallery
- Added `initialToolTypeFilter={false}` to disable the filter UI
- The filter was non-functional because `onToolTypeFilterChange` wasn't connected to the query

Applied to both galleries in EditImagesPage:
1. Results gallery (showing edited images)
2. Selection gallery (ImageSelectionModal)

Edit Video page was already correct (didn't pass tool type props).

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Edit Images page
2. Check if All Tools filter is visible
3. If visible, verify it works or is hidden
4. Navigate to Edit Videos page
5. Check if All Tools filter is visible
6. If visible, verify it works or is hidden
7. Behavior should be consistent

---

## Task 23 – Add Create Variant/New Image to Edit Views ✅

**Area:** Edit Images and Edit Videos pages

**Description:**  
Add ability to create variant or new image from these views.

**Observed Behavior:**  
No option to create variants or new images directly from edit views.

**Requirements:**
- Add ability to create variant from Edit Images view
- Add ability to create new image from Edit Images view
- For new images, determine what data to pass for complete_task
- Consider passing parent_generation_id instead of full task data
- Same capabilities for Edit Videos view if applicable

**Impacted Files:**
| File | Purpose |
|------|---------|
| `supabase/functions/complete_task/index.ts` | Added `create_as_generation` flag check |
| `src/shared/lib/tasks/imageInpaint.ts` | Added `create_as_generation` parameter |
| `src/shared/lib/tasks/magicEdit.ts` | Added `create_as_generation` parameter |
| `src/shared/lib/tasks/annotatedImageEdit.ts` | Added `create_as_generation` parameter |
| `src/shared/components/MediaLightbox/hooks/useMagicEditMode.ts` | Pass flag through hook |
| `src/shared/components/MediaLightbox/hooks/useInpainting.ts` | Pass flag through hook |
| `src/shared/components/MediaLightbox/hooks/useRepositionMode.ts` | Create generation or variant based on flag |
| `src/shared/components/MediaLightbox/components/EditModePanel.tsx` | Added "Create as new image" toggle UI |
| `src/tools/edit-images/components/InlineEditView.tsx` | State and wiring for toggle |

**Execution Notes:**  
Implemented a "Create as variant" toggle in both the Edit Images view and MediaLightbox editor:
- **Toggle ON** (default): Creates a variant on the source generation - appears in variant selector
- **Toggle OFF**: Creates a standalone generation with `based_on` for lineage tracking - appears in gallery

**Implementation details:**
1. Added `create_as_generation` flag to all edit task creation functions (imageInpaint, magicEdit, annotatedImageEdit)
2. Modified `complete_task` server function to check for this flag and skip variant creation when true
3. Updated `useRepositionMode` hook to create either a variant or a new generation based on the flag
4. Added Switch toggle UI in EditModePanel with tooltip explaining the behavior
5. Threaded state through both InlineEditView and MediaLightboxRefactored to all relevant hooks
6. Toggle defaults to ON (variant mode) - inverted UI logic so "Create as variant" checked = variant mode

**Note:** Edit Videos page has a different flow (orchestrator tasks) and would need separate implementation if needed.

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Edit Images page
2. Select an image
3. Find and use "Create Variant" option
4. Verify variant is created correctly
5. Find and use "Create New Image" option
6. Verify new image is created with correct parent relationship
7. Check task data/complete_task handling
8. Test on Edit Videos page if applicable

---

## Notes

- Task 11 was skipped in the original list
- "Video Travel Tour page" should be referred to as "Video Travel Tool" page throughout
- For Task 14: copy/hide buttons should be positioned at the bottom of the command line simulator
- For Task 21: show one skeleton if variant count is unknown, then update once count is known
- For Task 6: include project symbol next to task ID with click-to-jump functionality
