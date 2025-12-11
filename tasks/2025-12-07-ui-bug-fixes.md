# Task Document – December 7, 2025

## Master Checklist

### Quick Wins
- [x] **Task 2** – Only Flash Blue for Truly New Tasks *(simple logic fix)*
- [x] **Task 4** – Show Generation Pane Handle Behind Open Panes *(z-index fix)*
- [x] **Task 7** – Show Model Type on Share Task Detail *(display addition)*
- [x] **Task 11** – Switch to /tools When Changing Projects *(nav fix)*
- [x] **Task 14** – Match Star Selector Style *(UI consistency)*
- [x] **Task 18** – Add Mobile Helper Text Above Upload Image Button *(copy addition)*
- [x] **Task 23** – Vary Assistant Tool Colors *(adjacent color fix)*

### Mobile UX Cluster (touch handling, panes)
- [x] **Task 1** – Show Task Buttons on First Tap (Mobile) *(touch event handling)*
- [x] **Task 8** – Pane Handles Sometimes Disappear on Mobile *(stability fix)*
- [x] **Task 10** – Fix Shot Selector Up-Arrow Tap Passing Through *(tap passthrough)*
- [x] **Task 12** – Allow Locking One Pane at a Time on iPad *(tablet breakpoint)*
- [x] **Task 20** – Edit/Clip Buttons Missing in Media Lightbox on Mobile *(visibility fix)*

### Task Pane & List
- [x] **Task 5** – New Tasks Not Appearing in Task Pane *(possible regression)*
- [x] **Task 22** – Succeeded Tasks Page 1 Shows "No Tasks" *(pagination bug)*

### Edit Video Tool
- [x] **Task 3** – Review "Limited to 7 Based on Shortest Segment" Logic *(validation)*
- [x] **Task 13** – Sync Segment Color with Settings UI *(color coordination)*
- [x] **Task 19** – Fix Video Flash/Disappear on Load *(loading state)*
- [x] **Task 21** – Video Selector Slows Down Edit Video Page *(performance)*

### Edit Images / Repositioning
- [x] **Task 15** – Save Tool Type for Repositioning Variants *(metadata)*
- [x] **Task 16** – Fix Repositioning Range (Image Off-Screen) *(calculation fix)*
- [x] **Task 17** – Fix Screen vs Image Coordinate Mismatch *(coordinate mapping)*

### Shot Management
- [x] **Task 6** – Duration per Pair Disabled on Mobile *(batch mode logic)*
- [x] **Task 9** – Persist "Last Added to Shot" Between Sessions *(persistence)*

---

## Task 1 – Show Task Buttons on First Tap (Mobile) 🚧

**Area:** Mobile UI → Task items / Task Pane

**Description:**
On **mobile**, the **buttons on tasks** still are not appearing on the **first tap**. The expected behavior is that the first tap on a task item should reveal its associated buttons.

**Observed Behavior:**
- First tap does not reveal action buttons on task items
- Multiple taps required before buttons appear
- Touch events may be swallowed or mis-routed

**Requirements:**
* For each task item on **mobile**:
  * Ensure the **first tap** on the task item reveals the associated action buttons.
  * A second tap (on a specific button) should execute that button's action.
* Fix any issues where taps are being swallowed, mis-routed, or require multiple presses before buttons appear.
* Test across different task states (running, succeeded, failed, etc.) to confirm consistent behavior.
* Verify that this change doesn't regress desktop behavior.

**Impacted Files:**
- `src/shared/components/TasksPane/TaskItem.tsx` – Main task item with `handleMobileTap`, `isMobileActive` logic
- `src/shared/components/TasksPane/TasksPane.tsx` – Parent managing `mobileActiveTaskId` state
- `src/shared/hooks/use-mobile.ts` – Mobile detection

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app on mobile device
2. Navigate to Task Pane
3. Tap on any task item (processing, succeeded, or failed)
4. Verify action buttons appear on first tap
5. Tap a specific button to verify it executes the action
6. Repeat for different task types and states

---

## Task 2 – Only Flash Blue for Truly New Tasks (Not Just Newly Visible) 🚧

**Area:** Task Pane → Task appearance / highlight animation

**Description:**
Currently, a **fresh task** flashes blue upon appearance, but sometimes tasks also flash blue when they are **not actually new**, just newly visible (e.g., from scrolling, filtering, or changing views).

**Observed Behavior:**
- Tasks flash blue when scrolling into view
- Tasks flash blue when switching filter tabs
- Flash animation triggers on pagination changes

**Requirements:**
* Update the blue "new task" flash logic so that:
  * The blue highlight only triggers for tasks that are **truly new** (e.g., just created or just completed and added to the list).
  * Tasks that become visible due to **scrolling, pagination, or view/filter changes** do **not** play the "new" flash animation.
* Consider using a more reliable signal for "newness" (e.g., task creation timestamp, ID vs last seen marker, or explicit "just added" flag) instead of relying solely on list mount/render.
* Test scenarios:
  * New task arrives in a live-updating list → should flash blue.
  * User scrolls down or switches filters and sees older tasks → should **not** flash.

**Impacted Files:**
- `src/shared/components/TasksPane/TaskList.tsx` – Contains `newTaskIds` state, `prevTaskIdsRef`, flash logic in useEffect
- `src/shared/components/TasksPane/TaskItem.tsx` – Contains `isNew` prop and `containerClass` with flash animation

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Task Pane on Processing tab
2. Create a new task via any tool
3. Verify task flashes blue when it appears
4. Switch to Succeeded tab and back to Processing
5. Verify tasks do NOT flash on filter change
6. Paginate to page 2 and back to page 1
7. Verify tasks do NOT flash on pagination

---

## Task 3 – Review "Limited to 7 Based on Shortest Video Segment" Logic 🚧

**Area:** Edit Videos → Segment/frames limit messaging & rules

**Description:**
Investigate whether the current logic and messaging for:
> "Limited to 7 based on shortest video segment"
on the **Edit Videos** flow actually makes sense and is implemented correctly.

**Observed Behavior:**
- Message shown: "Limited to {maxContextFrames} based on shortest video segment"
- Current logic limits context frames based on shortest segment

**Requirements:**
* Confirm what **"7"** represents (frames, seconds, segments, etc.) and how it is computed.
* Verify that the cap truly reflects a constraint based on the **shortest video segment** in the edit.
* Evaluate whether this rule is still correct given the current pipeline (model limits, context frames, etc.).
* Review the UX/copy:
  * Decide if the message shown to the user is clear and actionable.
  * Consider exposing which segment is limiting the max and how a user can change that.
* Propose and implement either:
  * An updated rule (if the current logic is wrong/outdated), and/or
  * Improved messaging that clearly explains the limit in user-friendly terms.

**Impacted Files:**
- `src/tools/edit-video/components/VideoPortionEditor.tsx` – Contains the "Limited to X based on shortest video segment" message (line 377)
- `src/tools/edit-video/components/InlineEditVideoView.tsx` – Video portion selection logic
- `src/shared/components/MediaLightbox/hooks/useVideoEditing.ts` – Validation and `maxContextFrames` calculation

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Video page
2. Select a video with multiple segments
3. Add multiple portions with varying durations
4. Observe context frames slider and max value
5. Verify message accurately reflects the limiting segment
6. Test with different segment configurations

---

## Task 4 – Show Generation Pane Handle Behind Open Task/Shot Pane (Mobile) 🚧

**Area:** Mobile UI → Generation pane handle + Task/Shot panes

**Description:**
On **mobile**, when the **Task Pane** or **Shot Pane** is open, the **generation pane handle** should visually sit **behind** those panes instead of overlapping on top.

**Observed Behavior:**
- Generation pane handle floats in front of open Task/Shot panes on mobile
- Creates visual clutter and potential interaction issues

**Requirements:**
* Update z-index / layering so that on **mobile**:
  * When the Task Pane or Shot Pane is open, their panels appear **above** the generation pane handle.
  * The handle is visually behind (or effectively hidden), not floating in front of the open pane.
* Ensure this change:
  * Doesn't break dragging/interaction for the handle when the panes are closed.
  * Keeps the overall layout clean and predictable on mobile.
* Verify behavior across different device sizes and orientations.

**Impacted Files:**
- `src/shared/components/GenerationsPane/GenerationsPane.tsx` – Generation pane with z-[100] (line 402)
- `src/shared/components/TasksPane/TasksPane.tsx` – Tasks pane with z-index: 60 (line 723)
- `src/shared/components/ShotsPane/ShotsPane.tsx` – Shots pane z-index
- `src/shared/components/PaneControlTab.tsx` – Pane handle/tab component
- `src/shared/config/panes.ts` – Pane configuration constants

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app on mobile device
2. Open Task Pane
3. Verify generation pane handle is NOT visible in front of Task Pane
4. Close Task Pane, verify handle is accessible
5. Repeat with Shot Pane
6. Test in both portrait and landscape orientations

---

## Task 5 – New Tasks Not Appearing in Task Pane (Possible Regression) 🚧

**Area:** Mobile UI → Shot settings / Duration per pair

**Description:**
On **mobile**, the **Duration per pair** control is disabled. This seems to be happening because the shot is technically not considered to be in **batch mode**, even though the user expects to adjust Duration per pair for that shot. This could be due to the **desktop setting not being on batch mode**, and **mobile not distinguishing well enough** between different modes or contexts.

**Observed Behavior:**
- Duration per pair slider is disabled on mobile
- Shot appears to not be in batch mode on mobile even when it should be
- Mobile may be inheriting desktop mode settings that don't apply to mobile context

**Requirements:**
* Investigate the conditions under which **Duration per pair** is enabled/disabled.
* Confirm how **batch mode** is determined for a shot and why, on mobile, the shot is not treated as batch mode in this context.
* **Examine if mobile is incorrectly inheriting desktop mode settings** that cause the control to be disabled.
* **Make mobile more clever about distinguishing** when Duration per pair should be available, potentially independent of desktop batch mode settings.
* Adjust the logic so that:
  * Duration per pair is available when it should be, even on mobile.
  * Mobile has its own logic for determining when batch controls are appropriate.
  * The enable/disable state is consistent between mobile and desktop for the same shot configuration, but not necessarily dependent on desktop mode.
* Ensure that any batch-mode checks are accurate and not inadvertently disabling the control on mobile due to desktop context.
* Fix the logic so that newly created Qwen Image tasks (and other task types) reliably appear in the Task Pane in real time (or on the next refresh, depending on design).
* Add basic logging or tests to catch similar regressions in the future.

**Impacted Files:**
- `src/shared/components/TasksPane/TasksPane.tsx` – Main pane component with `usePaginatedTasks`
- `src/shared/components/TasksPane/TaskList.tsx` – Task list rendering
- `src/shared/hooks/useTasks.ts` – `usePaginatedTasks`, query keys, refetch logic
- `src/shared/providers/SimpleRealtimeProvider.tsx` – Realtime subscriptions
- `src/shared/lib/taskConfig.ts` – Task visibility filtering with `filterVisibleTasks`, `isTaskVisible`

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** [TaskAppearanceIssue] if logs needed

**Testing Instructions:**
1. Open Task Pane on Processing tab
2. Create a new image generation task
3. Verify task appears in Task Pane immediately or within a few seconds
4. Create a video travel task
5. Verify it also appears
6. Check browser console for any errors

---
## Task 6 – Duration per Pair Disabled on Mobile (Shot Not in Batch Mode) 🚧

**Area:** Mobile UI → Shot settings / Duration per pair

**Description:**
On **mobile**, the **Duration per pair** control is disabled. This seems to be happening because the shot is technically not considered to be in **batch mode**, even though the user expects to adjust Duration per pair for that shot.

**Observed Behavior:**
- Duration per pair slider is disabled on mobile
- Shot appears to not be in batch mode on mobile even when it should be

**Requirements:**
* Investigate the conditions under which **Duration per pair** is enabled/disabled.
* Confirm how **batch mode** is determined for a shot and why, on mobile, the shot is not treated as batch mode in this context.
* Adjust the logic so that:
  * Duration per pair is available when it should be, even on mobile.
  * The enable/disable state is consistent between mobile and desktop for the same shot configuration.
* Ensure that any batch-mode checks are accurate and not inadvertently disabling the control on mobile.

**Impacted Files:**
- `src/tools/travel-between-images/components/BatchSettingsForm.tsx` – Duration per pair slider (line 377-422)
- `src/tools/travel-between-images/settings.ts` – `videoControlMode`, `generationMode` settings
- `src/tools/travel-between-images/components/ShotEditor/state/types.ts` – `ShotSettings` interface
- `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx` – Shot settings management
- `src/tools/travel-between-images/hooks/useShotSettings.ts` – Settings hook


**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Travel Between Images on mobile
2. Select or create a shot with multiple images
3. Verify Duration per pair slider is enabled
4. Change the value and verify it persists
5. Compare behavior to desktop for same shot

---

## Task 7 – Show Model Type on Share Task Detail 🚧

**Area:** Share Task detail view

**Description:**
In the **Share Task detail** view, we should display the **model type** used for that task so viewers can see which model produced the result.

**Observed Behavior:**
- Share page shows task settings but not the model type
- Model info exists in task params but isn't displayed

**Requirements:**
* Retrieve and display the **model type** (e.g., model name/family) associated with the shared task.
* Place this information clearly in the Share Task detail UI (e.g., alongside other metadata like task type, duration, etc.).
* Ensure that:
  * The field is present for all relevant task types (image, video, inpaint, etc.) where model info exists.
  * If model info is missing or legacy, handle gracefully (e.g., "Model: Unknown" or hide field, depending on design).
* Verify that the model type shown matches the actual model used in the underlying generation/edit task.

**Impacted Files:**
- `src/pages/SharePage.tsx` – Share page container
- `src/tools/travel-between-images/components/SharedGenerationView.tsx` – Share view component with settings display
- `src/tools/travel-between-images/components/SharedTaskDetails.tsx` – Task details component (reused in share view)

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Share a video generation task
2. Open the share link in an incognito window
3. Verify model type is displayed in the task details
4. Test with different task types (image gen, character animate, etc.)
5. Test with legacy tasks that may not have model info

---

## Task 8 – Pane Handles Sometimes Disappear on Mobile 🚧

**Area:** Mobile UI → Pane handles (generation / task / shot panes, etc.)

**Description:**
On **mobile**, the **pane handles** (used to drag/open/close panes such as the generation pane, task pane, shot pane, etc.) sometimes **disappear**, leaving the user without an obvious way to interact with those panes.

**Observed Behavior:**
- Pane handles vanish after certain navigation or pane interactions
- No way to reopen panes when handles are missing

**Requirements:**
* Investigate scenarios where pane handles vanish on mobile (e.g., after certain navigation, orientation changes, opening/closing specific panes).
* Ensure that:
  * Pane handles are consistently rendered and visible whenever their corresponding pane can be interacted with.
  * State changes (open/closed) do not accidentally unmount or hide the handle permanently.
* Consider adding safeguards so that pane handles are re-mounted or re-shown when returning to the screen.
* Test across common mobile devices and orientations to confirm stability.

**Impacted Files:**
- `src/shared/components/PaneControlTab.tsx` – Pane handle/tab component
- `src/shared/hooks/useSlidingPane.ts` – Pane visibility and state management
- `src/shared/contexts/PanesContext.tsx` – Pane lock and open states
- `src/app/Layout.tsx` – Where panes are rendered

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** [PaneHandleDebug] if logs needed

**Testing Instructions:**
1. Open app on mobile
2. Open Task Pane, then close it
3. Navigate to different tool pages
4. Verify pane handles remain visible
5. Rotate device orientation
6. Verify handles persist through rotation
7. Open/close multiple panes in succession

---

## Task 9 – Persist "Last Added to Shot" Between Sessions 🚧

**Area:** State management → Shots / Add-to-shot behavior

**Description:**
The app should remember the **last shot** that content was "added to" and persist this selection **between sessions**, so the user can quickly continue adding to the same shot without re-selecting it each time.

**Observed Behavior:**
- `lastAffectedShotId` is stored in React context (runtime state only)
- Lost on page refresh or new session
- Currently overwrites the selection each time content is added to any shot

**Requirements:**
* Track the **last "added to shot"** target when the user adds content to a shot.
* Persist this information across sessions (e.g., via local storage or user-specific server state).
* On returning to the app or relevant tools:
  * Pre-select or highlight this last-used shot as the default "add to" target, where it makes sense.
* Ensure that clearing or explicitly changing the shot updates this persisted state.
* Handle edge cases where the shot no longer exists (deleted/invalid) by falling back to a sensible default.

**Impacted Files:**
- `src/shared/contexts/LastAffectedShotContext.tsx` – Context provider (currently runtime only)
- `src/shared/hooks/useLastAffectedShot.ts` – Hook to access context
- `src/shared/components/ShotSelectorWithAdd.tsx` – Uses `setLastAffectedShotId`
- `src/shared/components/ImageGalleryItem.tsx` – Uses `setLastAffectedShotId`
- `src/app/App.tsx` – Drag and drop also sets `lastAffectedShotId`

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Add an image to Shot 3
2. Refresh the page
3. Verify Shot 3 is pre-selected in shot selector
4. Close browser and reopen app
5. Verify Shot 3 is still pre-selected
6. Delete Shot 3 and verify fallback behavior

---

## Task 10 – Fix Shot Selector Up-Arrow Tap Passing Through (Mobile) 🚧

**Area:** Mobile UI → Image gallery items → Shot selector

**Description:**
On **mobile**, it's hard to scroll to the **top/bottom** of the shot selector on image gallery items. It seems that tapping the **up arrow** to scroll up is actually clicking on elements **behind** the selector instead of triggering the scroll.

**Observed Behavior:**
- Tap on up arrow in shot selector does not scroll
- Tap passes through to elements behind the selector

**Requirements:**
* Investigate the **hit area** and event handling for the **up arrow** (and any similar scroll controls) in the shot selector on mobile.
* Ensure that:
  * Taps on the arrow are captured by the shot selector and **do not** pass through to content behind it.
  * The arrow reliably triggers scrolling toward the top (and any corresponding down control toward the bottom, if present).
* Check z-index, pointer-events, and container structure to prevent tap passthrough.
* After the fix, verify that users can smoothly scroll to both the **top** and **bottom** of the shot selector on common mobile devices.

**Impacted Files:**
- `src/shared/components/ShotSelector.tsx` – Shot selector dropdown with scroll
- `src/shared/components/ShotSelectorWithAdd.tsx` – Wrapper with add functionality
- `src/shared/components/ImageGalleryItem.tsx` – Gallery item containing shot selector
- `src/shared/components/ui/select.tsx` – Base select component

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open image gallery on mobile
2. Tap shot selector dropdown to open
3. If list is long, tap up/down arrows to scroll
4. Verify scrolling works without tapping through to gallery
5. Select a shot from the scrolled position

---

## Task 11 – Switch to /tools When Changing Projects 🚧

**Area:** Navigation → Project switching behavior

**Description:**
When switching into a **new project**, the app should navigate back to **`/tools`**, just like it already does when a **new project is created**.

**Observed Behavior:**
- Switching projects keeps user on current page
- Creating a new project navigates to /tools
- Inconsistent behavior

**Requirements:**
* Update the **project switch** behavior so that:
  * On selecting a different project, the user is redirected to the **`/tools`** route.
* Ensure this is consistent with the behavior when **creating** a new project.
* Verify that any deep-linked or tool-specific state that should *not* persist across projects is reset appropriately when switching.
* Confirm that this navigation works correctly on both desktop and mobile.

**Impacted Files:**
- `src/shared/contexts/ProjectContext.tsx` – Project selection handler `handleSetSelectedProjectId`
- `src/shared/components/GlobalHeader.tsx` – Project switcher UI
- `src/app/routes.tsx` – Route definitions

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Create two projects
2. Navigate to Travel Between Images in Project A
3. Switch to Project B via header dropdown
4. Verify you are navigated to /tools
5. Test on both desktop and mobile

---

## Task 12 – Allow Locking One Pane at a Time on iPad-Sized Screens 🚧

**Area:** Responsive layout → Pane locking (iPad / tablet)

**Description:**
On **iPad-sized screens**, it should be possible to **lock one pane at a time** (e.g., task pane, shot pane, generation pane). Currently, due to the mobile settings/logic, pane locking is effectively disabled on these tablet layouts.

**Observed Behavior:**
- `useIsMobile()` returns true for iPad, disabling all locking
- Pane lock controls don't work on iPad
- Tablets treated same as phones

**Requirements:**
* Detect **iPad / tablet** screen sizes (or appropriate breakpoint) separately from small-phone mobile.
* On these screens:
  * Allow **one pane** to be **locked open** at a time.
  * Keep the other panes behaving as slide-over / temporary panels.
* Ensure that:
  * Pane locking controls are visible and usable on iPad-sized layouts.
  * The experience does not regress on true mobile-size screens, where current mobile behavior is still desired.
* Test in both portrait and landscape orientations on iPad/tablet resolutions.

**Impacted Files:**
- `src/shared/hooks/use-mobile.ts` – Mobile detection (needs tablet breakpoint)
- `src/shared/contexts/PanesContext.tsx` – Pane lock logic checks `isMobile`
- `src/shared/hooks/useSlidingPane.ts` – Pane behavior checks `isMobile`
- `src/shared/components/PaneControlTab.tsx` – Lock button visibility

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app on iPad or iPad simulator
2. Verify pane lock buttons are visible
3. Lock Task Pane
4. Verify it stays open and locked
5. Try to lock another pane - verify only one can be locked
6. Test in both portrait and landscape

---

## Task 13 – Sync Segment Color with Settings UI and Avoid Color Collisions 🚧

**Area:** Edit Video page → Timeline segments & settings panel

**Description:**
On the **Edit Video** page, each segment on the **timeline** has a specific color. The settings for that segment on the right (or below on mobile) should also prominently feature this same color so it's easy to visually connect the segment and its controls.

**Observed Behavior:**
- Timeline segments have colors but settings panel doesn't match
- May have color collisions between segments

**Requirements:**
* For each segment:
  * Use the **same segment color** in the settings UI on the right (desktop) or below (mobile).
  * A good candidate is to color the **number box** or a clear visual element with the segment's color.
* Ensure that:
  * Segment colors are **not duplicated** in a way that makes it hard to distinguish multiple segments.
  * The **timeline segment number** is clearly shown and matches the labeling in the settings panel.
* Review the color assignment logic to:
  * Avoid collisions where possible (e.g., cycling through a palette with enough distinct colors).
  * Maintain accessibility/contrast so the colored number box or badge remains readable.
* Test on both desktop and mobile so that the relationship between timeline segment and settings is visually obvious in both layouts.

**Impacted Files:**
- `src/tools/edit-video/components/InlineEditVideoView.tsx` – Edit video view with segments
- `src/tools/edit-video/components/VideoPortionEditor.tsx` – Settings panel for segments
- `src/tools/training-data-helper/components/VideoSegmentEditor.tsx` – Reference: has `segmentColors` array (line 132-145) and `getSegmentColor` function

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Video page
2. Add multiple video segments (3+)
3. Verify each segment has a unique color on timeline
4. Verify settings panel shows matching color for each segment
5. Verify segment numbers match between timeline and settings
6. Test on mobile layout

---

## Task 14 – Match Star Selector Style with Image Generation Tool 🚧

**Area:** Gallery → Generation pane → Star selector

**Description:**
The **star selector** shown in the **gallery generation pane** should use the same **style/design** as the star selector on the **Image Generation** tool page, for consistency.

**Observed Behavior:**
- Star button in generation pane has different styling
- Inconsistent with star button on Image Generation page

**Requirements:**
* Identify the current star selector component/styles used on the **Image Generation** tool page.
* Update the star selector in the **gallery generation pane** to:
  * Use the same component or shared styling.
  * Match hover/tap states, spacing, size, and icon appearance as closely as possible.
* Ensure that behavior (e.g., how many stars, selection logic, rating state) remains correct while adopting the new design.
* Confirm that the updated star selector looks and works correctly on both desktop and mobile.

**Impacted Files:**
- `src/shared/components/GenerationsPane/GenerationsPane.tsx` – Star filter in generations pane (line 433-452)
- `src/shared/components/ImageGalleryItem.tsx` – Star button on gallery items (line 1616-1651)
- `src/shared/components/MediaLightbox/components/ButtonGroups.tsx` – Star in lightbox (line 283-291)
- `src/shared/components/ImageGallery/components/ImageGalleryHeader.tsx` – Star filter in header

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Image Generation page
2. Note star button appearance on gallery items
3. Open Generations Pane
4. Compare star filter/button styling
5. Verify they match after changes
6. Test hover and click states

---

## Task 15 – Save Tool Type for New Image Variants from Repositioning Images 🚧

**Area:** Image Edit tool → Repositioning mode / variant creation

**Description:**
When **repositioning an image** in the **Image Edit** tool (reposition mode) and creating a **new image variant**, the resulting variant should have its **tool type** saved/marked as coming from this repositioning workflow in the Image Edit tool.

**Observed Behavior:**
- Repositioned image variants may not have correct tool_type
- May be missing or have generic tool type

**Requirements:**
* When a new image variant is created via the **repositioning** flow in the Image Edit tool:
  * Set the variant's **tool type** to the Image Edit tool's repositioning identifier (consistent with how tool type is stored elsewhere).
* Ensure that:
  * This metadata is persisted correctly in the backend/store.
  * Any views that rely on tool type (e.g., galleries, filters, analytics, share views) see the new variant as coming specifically from the repositioning image edit tool.
* Verify that variants created via **other image tools or modes** (e.g., basic edits, inpaint, etc.) are unaffected and still carry their correct tool types.

**Impacted Files:**
- `src/tools/edit-images/components/InlineEditView.tsx` – Contains `useRepositionMode` hook usage
- `src/shared/components/MediaLightbox/hooks/useRepositionMode.ts` – Reposition mode hook (needs to set tool_type)
- `src/tools/edit-images/pages/EditImagesPage.tsx` – TOOL_TYPE constant = 'edit-images'

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Images page
2. Select an image to edit
3. Use reposition controls to transform image
4. Save as new variant
5. Check variant metadata for correct tool_type
6. Verify variant appears in correct filtered views

---

## Task 16 – Fix Repositioning Range so Image Doesn't Move Far Off-Screen 🚧

**Area:** Image Edit tool → Repositioning mode (position/scale calculations)

**Description:**
When **repositioning an image**, the **maximum and minimum movement ranges** are often far too large. Turning a control up to its maximum can move the image **far off the screen**, making it unusable. This likely relates to how movement ranges are calculated when the image is scaled and displayed in a smaller screen/canvas.

**Observed Behavior:**
- Moving slider to max moves image completely off screen
- Ranges not normalized to displayed canvas size
- Controls feel imprecise and unusable at extremes

**Requirements:**
* Investigate how the repositioning **X/Y offsets** (and any related controls) are currently calculated, especially when the image is **scaled** within a smaller canvas.
* Ensure that:
  * Movement ranges are normalized to the **actual canvas/screen size** and current **image scale**.
  * Max/min ranges keep the image within a reasonable on-screen area (or only slightly beyond, if intentionally allowed), rather than completely off-screen.
* Fix any issues where the calculations are based on the wrong reference size (e.g., full-resolution image instead of displayed canvas size).
* Test with different image sizes, aspect ratios, and scales to confirm the repositioning controls feel **precise and usable** without wild jumps off-screen.

**Impacted Files:**
- `src/shared/components/MediaLightbox/hooks/useRepositionMode.ts` – Transform calculations
- `src/tools/edit-images/components/InlineEditView.tsx` – Uses repositionHook with transform

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Images page
2. Select an image
3. Enter reposition mode
4. Move X/Y sliders to maximum values
5. Verify image stays mostly on screen
6. Test with images of different sizes/aspect ratios

---

## Task 17 – Fix Screen vs Image Coordinate Mismatch for New Image & Mask Saving 🚧

**Area:** Image Edit tool → Saving new images and masks (repositioning / inpaint)

**Description:**
There appears to be a mismatch between the **on-screen, scaled image** and the **coordinates** used when saving a **new image** or **new mask**. What the user sees in the UI does not line up with what is actually saved, likely due to incorrect screen-size or scale calculations. This issue was observed with **repositioning without generating** (where the transformed image doesn't match the preview) and is assumed to also affect **inpainting** operations.

**Observed Behavior:**
- Saved image/mask doesn't match what was shown on screen
- Coordinate mapping incorrect between display and save
- Issue likely related to scale factor miscalculation
- Specifically observed in repositioning without generating workflow
- Assumed to also affect inpainting mask alignment

**Requirements:**
* Investigate how coordinates are mapped from the **displayed (scaled) image on screen** to the **underlying full-resolution image** when:
  * Saving a **new image** (e.g., after repositioning without generating).
  * Saving a **new mask** (e.g., in inpaint or similar flows).
* Identify and fix any incorrect assumptions about:
  * Screen size vs canvas size.
  * Display scale vs underlying image resolution.
  * Origin/offset calculations.
* Ensure that:
  * What the user sees and interacts with on screen (image + mask regions) matches exactly what is saved and sent to the backend.
  * Masks and transformed images line up correctly when reloaded or used downstream.
  * Repositioning without generating produces accurate results that match the preview.
* Test across multiple screen sizes and device types to confirm the mapping works consistently.

**Impacted Files:**
- `src/shared/components/MediaLightbox/hooks/useRepositionMode.ts` – Coordinate calculations for saving
- `src/shared/components/MediaLightbox/hooks/useMagicEditMode.ts` – Mask coordinate handling
- `src/tools/edit-images/components/InlineEditView.tsx` – Image dimensions and container ref

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Images page
2. Reposition an image with visible transform
3. Save as variant (without generating)
4. Compare saved result to what was shown on screen
5. Test inpaint mask creation and verify alignment
6. Test on different screen sizes

---

## Task 18 – Add Mobile Helper Text Above Upload Image Button (Edit Image Page) 🚧

**Area:** Edit Image page → Mobile UI

**Description:**
On **mobile**, there is currently **no text above the "Upload Image" button** on the Edit Image page. We should show a **shortened version of the desktop helper text**, similar to what already exists on the **Edit Video** page.

**Observed Behavior:**
- Mobile Edit Image page has upload button with no explanatory text
- Desktop has helper text that doesn't appear on mobile

**Requirements:**
* Add concise helper text above the **Upload Image** button on the **Edit Image** page for mobile users.
* Base the copy on the existing **desktop** text, but:
  * Shorten/simplify it for mobile.
  * Mirror the approach used on the **Edit Video** page.
* Ensure the text:
  * Explains what the upload is for / expected input.
  * Fits nicely on small screens without wrapping awkwardly.
* Verify appearance and readability on common mobile viewport sizes.

**Impacted Files:**
- `src/tools/edit-images/pages/EditImagesPage.tsx` – Edit images page with upload button
- `src/tools/edit-video/pages/EditVideoPage.tsx` – Reference: has mobile helper text pattern

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Images page on mobile
2. Verify helper text appears above upload button
3. Compare text style to Edit Video page
4. Verify text is readable and doesn't wrap oddly
5. Confirm desktop layout is unchanged

---

## Task 19 – Fix Video Flash/Disappear on Load in Image Gallery (e.g., Travel Between Images) 🚧

**Area:** Image gallery → Video items (e.g., Travel Between Images page)

**Description:**
When loading **videos in the image gallery**, there is a brief moment where the video **flashes or disappears** right after load, then reappears. This does **not** happen in the **video output gallery**, but does happen in galleries like the one on the **Travel Between Images** page. The video (or its thumbnail) should remain visible and stable.

**Observed Behavior:**
* In image-gallery-style views that contain videos (e.g., Travel Between Images):
  * After a video item is loaded, it briefly **disappears/flash-blinks** before showing again.
* In the dedicated **video output gallery**, this flashing does **not** occur.

**Requirements:**
* Compare the rendering logic between:
  * The **video output gallery** (no flashing) and
  * The **image gallery with videos** (flashing).
* Identify why, in the image gallery:
  * The video or its container briefly unmounts/rehides or switches state (e.g., placeholder → video element) in a way that causes a visible flash.
* Ensure that:
  * The **thumbnail/preview** is shown immediately and **never disappears** until the video is ready to play.
  * Transition from thumbnail to playable video is smooth and does **not** produce a blink/flash.
* Look specifically at:
  * Conditional rendering (thumbnail vs video tag).
  * Any state changes on load events.
  * Layout reflows or key changes that might be causing a remount.
* Align the image gallery's video handling with the more stable behavior used in the **video output gallery**.

**Impacted Files:**
- `src/shared/components/ImageGalleryItem.tsx` – Image gallery item with video handling (line 249-295)
- `src/tools/travel-between-images/components/VideoGallery/components/VideoItem.tsx` – Video gallery item (stable implementation)
- `src/tools/travel-between-images/components/VideoGallery/hooks/useVideoLoader.ts` – Video loading state management
- `src/tools/travel-between-images/components/VideoGallery/hooks/useVideoElementIntegration.ts` – Video element integration

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** [VideoFlashDebug] if logs needed

**Testing Instructions:**
1. Open Travel Between Images page
2. Navigate to a shot with generated videos
3. Scroll through the video gallery
4. Watch for any flash/blink when videos load
5. Compare to video output gallery behavior
6. Verify thumbnails stay visible during transitions

---

## Task 20 – Edit/Clip Buttons Missing in Media Lightbox on Mobile (Edit Video Page) 🚧

**Area:** Edit Video page → Media lightbox (mobile)

**Description:**
On **mobile**, when opening a video in the **media lightbox** from the **Edit Video** page, there is **no visible Edit or Clip button**. These controls should be available so the user can continue editing or clipping directly from the lightbox.

**Observed Behavior:**
- Edit/Clip buttons not visible on mobile in lightbox
- Buttons may be hidden by responsive styles or z-index issues

**Requirements:**
* Ensure that on **mobile**, in the media lightbox opened from the Edit Video page:
  * The **Edit** button is clearly visible.
  * The **Clip** button (if part of the intended controls) is also visible and usable.
* Confirm that:
  * These buttons are not hidden due to responsive styles, z-index issues, or mobile-specific layouts.
  * Their tap targets are large enough for comfortable mobile use.
* Align the mobile lightbox controls with the expected set of actions available on desktop, adapted appropriately for small screens.

**Impacted Files:**
- `src/shared/components/MediaLightbox/MediaLightboxRefactored.tsx` – Main lightbox component
- `src/shared/components/MediaLightbox/components/MediaControls.tsx` – Media control buttons
- `src/shared/components/MediaLightbox/components/ButtonGroups.tsx` – Button group components
- `src/tools/edit-video/pages/EditVideoPage.tsx` – Edit video page with lightbox

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open Edit Video page on mobile
2. Select a video and view results
3. Tap a video to open lightbox
4. Verify Edit button is visible
5. Verify Clip button is visible (if applicable)
6. Test tap targets are usable

---

## Task 21 – Video Selector Slows Down Edit Video Page 🚧

**Area:** Edit Video page → Video selector UI

**Description:**
The **video selector** on the **Edit Video** page appears to be causing the page to **slow down**, making interactions feel laggy or unresponsive.

**Observed Behavior:**
- Page becomes laggy when video selector is rendered
- Scrolling and selection feel unresponsive
- Possible excessive re-renders or data transformations

**Requirements:**
* Profile the **video selector** component on the Edit Video page to identify performance bottlenecks.
* Look for issues such as:
  * Excessive re-renders when scrolling or selecting videos.
  * Heavy computations or large data transformations in render cycle.
  * Inefficient data fetching or state updates tied to the selector.
* Optimize the selector so that:
  * Scrolling and selecting videos feels smooth and responsive.
  * Changes in selection do not trigger unnecessary page-wide rerenders.
* Verify improvements on typical project sizes and on both desktop and mobile.

**Impacted Files:**
- `src/tools/edit-video/pages/EditVideoPage.tsx` – Contains `VideoSelectionPanel` component (line 454+)
- `src/tools/edit-video/pages/EditVideoPage.tsx` – Contains `ShotsVideoView` component (line 546+)
- `src/shared/hooks/useGenerations.ts` – Generations query hook

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** [EditVideoPerf] if profiling logs needed

**Testing Instructions:**
1. Open Edit Video page with project containing many videos
2. Open video selector panel
3. Scroll through videos - should be smooth
4. Select a video - should be instant response
5. Use React DevTools Profiler to verify no excessive re-renders

---

## Task 22 – Succeeded Tasks Page 1 Shows "No Tasks Succeeded" Despite Many Results 🚧

**Area:** Task Pane → Succeeded tasks view / pagination

**Description:**
In at least one project, the **Succeeded** tasks view shows **"No tasks succeeded"** on **page 1**, even though there are many succeeded tasks and later pages do show results.

**Example:**
* `3524 succeeded tasks, showing 50 per page`
* `Page 1 of 71`
* Page 1 content: **"No tasks succeeded"**
* Clicking to later pages (e.g., page 2+) shows succeeded tasks as expected.

**Observed Behavior:**
- Page 1 shows empty state despite task count > 0
- Later pages show tasks correctly
- Possible off-by-one or filter issue

**Requirements:**
* Investigate the query and pagination logic for the **Succeeded** tasks view.
* Confirm why **page 1** can report no results even though the overall count is > 0 and later pages are populated.
  * Check for off-by-one issues in offsets, sorting, or filters.
  * Check whether filters are being applied differently on the first page.
* Ensure that:
  * Page 1 correctly shows the first 50 succeeded tasks when there are any.
  * The total count, page count, and actual page contents are in sync.
* Add safeguards or tests to prevent regressions where page 1 can be empty while later pages are not.

**Impacted Files:**
- `src/shared/hooks/useTasks.ts` – `usePaginatedTasks` hook with offset/limit logic (line 332+)
- `src/shared/components/TasksPane/TasksPane.tsx` – Pagination state and `currentPage`
- `src/shared/components/TasksPane/TaskList.tsx` – Renders tasks from `paginatedData`

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** [TaskPaginationDebug] if logs needed

**Testing Instructions:**
1. Open project with many succeeded tasks (100+)
2. Switch to Succeeded filter in Task Pane
3. Verify Page 1 shows tasks (not empty)
4. Verify task count matches reality
5. Navigate to page 2 and back to page 1
6. Verify consistency

---

## Task 23 – Vary Assistant Tool Colors to Avoid Adjacent Duplicates 🚧

**Area:** Tool Selector Page → Assistant tools grid

**Description:**
The **assistant tools** (Edit Images, Edit Videos, Join Clips, Characters, etc.) on the Tool Selector page currently have color gradients that are too similar or use the same colors adjacent to one another. This makes it harder to distinguish tools at a glance.

**Observed Behavior:**
Current gradient assignments:
- Edit Images: `from-wes-yellow via-wes-salmon to-wes-pink`
- Edit Videos: `from-wes-coral via-wes-salmon to-wes-pink` *(shares salmon & pink with Edit Images)*
- Join Clips: `from-wes-dusty-blue via-wes-lavender to-wes-pink` *(shares pink)*
- Characters: `from-wes-sage via-wes-mint to-wes-lavender`
- More Soon: `from-wes-dusty-blue via-wes-sage to-wes-mint` *(shares dusty-blue with Join Clips)*

Adjacent tools have overlapping colors, reducing visual distinction.

**Requirements:**
* Review the current color assignments for assistant tools in the grid layout.
* Ensure that **adjacent tools** (horizontally and vertically in the 2-col mobile / 3-col desktop grid) have visually distinct gradients.
* Consider:
  * Rotating through a broader color palette
  * Avoiding shared middle (`via-`) or end (`to-`) colors between neighbors
  * Using the full Wes Anderson palette: vintage-gold, mustard, yellow, coral, salmon, pink, lavender, dusty-blue, mint, sage
* Update gradient assignments to maximize visual distinction while maintaining the aesthetic.
* Test on both 2-column (mobile) and 3-column (desktop) layouts to ensure no adjacent duplicates.

**Impacted Files:**
- `src/pages/ToolSelectorPage.tsx` – `assistantTools` array (lines 75-144) with gradient definitions

**Execution Notes:**
*To be filled during implementation*

**Additional Data Needed:** None

**Testing Instructions:**
1. Open /tools page on desktop (3-column layout)
2. Verify no two adjacent tools share the same dominant colors
3. Open on mobile (2-column layout)
4. Verify adjacent tools are visually distinct
5. Confirm overall aesthetic remains cohesive

---

*End of Task Document*

