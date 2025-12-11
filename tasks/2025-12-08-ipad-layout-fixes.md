# iPad/Tablet Layout & Interaction Fixes

**Created:** 2025-12-08  
**Status:** ✅ Completed

---

## Master Checklist

### Quick Wins (Unblock testing)
- [x] **Task 3** – Add sticky header on iPad (layout foundation for other fixes)

### Layout & Pane Cluster (do together - related layout systems)
- [x] **Task 4** – Fix inherited pane lock state on iPad (depends on Task 3 for header visibility)
- [x] **Task 1** – Stack video on top with settings below in Edit Video mode

### Interaction Fixes
- [x] **Task 2** – Single tap to open "View X Segments" cards

### iPad-Specific Media Bugs (related to iPad viewport/touch)
- [x] **Task 5** – Variant selection doesn't update video in lightbox (iPad)
- [x] **Task 6** – Repositioned image X/Y mismatch on iPad

### iPad PWA Issues
- [x] **Task 7** – Fix downloads in iPad PWA (weird screen instead of download)

---

## Task 1 – Stack Video on Top and Settings Directly Below (Edit Video Mode) ✅

**Area:** Edit Video mode → Layout

**Description:**  
In the **Edit Video** mode, the layout should show the **video at the top** and the **settings directly below it**, rather than being spaced far apart as they are now.

**Observed Behavior:**  
Currently the video player and settings panel are separated by large gaps or placed side-by-side in a way that feels disconnected, especially on mobile.

**Requirements:**
- Update the Edit Video layout so that:
  - The **video player/preview** is positioned at the **top** of the main area
  - The **settings panel/controls** appear **immediately below** the video
- Ensure that the video and settings feel visually connected, not separated by large gaps or unrelated content
- Apply this layout especially in the "support" / main edit view
- Confirm it works well on both desktop and mobile
- Check that scrolling and resizing still behave sensibly with the new stacked layout

**Impacted Files:**
- `src/tools/edit-video/pages/EditVideoPage.tsx` – Main page layout, contains video selection and edit view rendering
- `src/tools/edit-video/components/InlineEditVideoView.tsx` – The inline edit view with video player and timeline/settings
- `src/shared/components/MediaLightbox/MediaLightboxRefactored.tsx` – If editing via lightbox, may need layout adjustments

**Execution Notes:**  
- Added `useIsTablet()` hook to `InlineEditVideoView.tsx`
- Created `useStackedLayout = isMobile || isTablet` flag for consistent stacked layout on phones and tablets
- Changed layout from `md:flex-row` to `lg:flex-row` so tablets use stacked layout
- Updated all layout-related conditionals to use `useStackedLayout`

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Edit Video tool
2. Select a video to edit
3. Verify video appears at top with settings immediately below (no large gap)
4. Test on mobile viewport - confirm stacked layout
5. Test on desktop viewport - confirm layout is sensible
6. Scroll and resize window - verify layout remains stable

---

## Task 2 – Open Child Page on Single Tap for "View X Segments" Cards ✅

**Area:** Video Travel Tool → Video output gallery → Segment cards

**Description:**  
On the **Video Travel Tool** page, in the **video output gallery**, a **single tap** on a **"View X segments"** card should open the corresponding **child page**. Currently, it takes **two taps** to open.

**Observed Behavior:**  
- First tap appears to focus/select the card
- Second tap actually navigates to the segments page
- This extra step is frustrating on mobile/touch devices

**Requirements:**
- Update the interaction for **"View X segments"** cards so that:
  - A **single tap** on the card immediately navigates to the correct child page
- Investigate why two taps are currently required (e.g., first tap focusing/selecting the card, second tap activating it) and remove that extra step
- Ensure this behavior is consistent on both mobile and desktop
- Verify that there are no conflicting handlers or overlays that are swallowing the first tap

**Impacted Files:**
- `src/tools/travel-between-images/components/VideoGallery/components/VideoItem.tsx` – Contains the collage view with "View X Segments" overlay click handler (lines 882-908)
- `src/tools/travel-between-images/components/VideoGallery/index.tsx` – Passes `onViewSegments` callback to VideoItem
- `src/tools/travel-between-images/pages/SegmentsPage.tsx` – Destination page for segments

**Execution Notes:**  
- Added `onTouchEnd` handler to the collage view in `VideoItem.tsx`
- The `onTouchEnd` handler calls `onViewSegments` immediately on touch, bypassing any double-tap delay
- Uses `e.preventDefault()` and `e.stopPropagation()` to prevent event bubbling

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to Video Travel Tool
2. Find a parent generation that has child segments (shows "View X Segments" collage)
3. Single tap/click on the collage card
4. Verify it immediately navigates to the segments page
5. Test on both mobile (touch) and desktop (click)
6. Ensure no double-tap is required

---

## Task 3 – Add Sticky Header on iPad-Sized Screens ✅

**Area:** Responsive layout → Header behavior (iPad / tablet)

**Description:**  
On **iPad-sized screens**, there should be a **sticky header** just like on **desktop**, so key navigation and controls remain visible while scrolling.

**Observed Behavior:**  
- On desktop, header is sticky (fixed at top while scrolling)
- On mobile (phones), header scrolls away
- On iPad/tablet, header currently scrolls away like mobile, but should be sticky like desktop

**Requirements:**
- Identify the breakpoint(s) used for **iPad / tablet** layouts
- Enable the **sticky header** behavior for these screen sizes, matching desktop behavior
- Ensure that:
  - The header remains fixed at the top while scrolling content
  - It doesn't conflict with existing mobile-specific header behavior on smaller phone screens
- Test in both portrait and landscape orientations on typical tablet resolutions

**Impacted Files:**
- `src/shared/components/GlobalHeader.tsx` – Main header component, contains sticky positioning logic
- `src/shared/hooks/use-mobile.tsx` – Contains `useIsMobile()` and `useIsTablet()` hooks, breakpoint definitions (MOBILE_BREAKPOINT = 768, TABLET_BREAKPOINT = 1024)
- `src/app/Layout.tsx` – Root layout where header is rendered

**Execution Notes:**  
- Added `useIsTablet()` hook to `GlobalHeader.tsx`
- Created `shouldHaveStickyHeader = !isMobile || isTablet` flag
- Changed header className to use `shouldHaveStickyHeader ? "sticky top-0" : ""`
- Now tablets have sticky header like desktop, only phones have scrolling header

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app on iPad or resize browser to iPad dimensions (~768-1024px width)
2. Scroll down on any page with scrollable content
3. Verify header stays fixed at top (sticky) like desktop
4. Test in portrait mode (~768px width)
5. Test in landscape mode (~1024px width)
6. Verify phone-sized screens (<768px) still have scrolling header

---

## Task 4 – Fix Inherited Pane Lock State on iPad (Invisible Pane & No Lock Icon) ✅

**Area:** Responsive layout → Pane locking behavior (desktop → iPad)

**Description:**  
On **iPad**, if the layout inherits a **pane locking state** from desktop, the main content area is still **constrained as if a pane is open**, but the pane itself is **not actually visible**. Additionally, there is **no lock/unlock icon** visible on iPad like there is on desktop.

**Observed Behavior:**  
- User locks a pane on desktop (e.g., shots pane)
- Switch to iPad viewport
- Main content is constrained (reduced width) as if pane is open
- But the pane itself is not visible
- No lock/unlock icon is shown to manage this state

**Requirements:**
- Investigate how pane lock state is persisted and applied when transitioning from **desktop** to **iPad-sized** layouts
- Ensure that on iPad:
  - If a pane is **not visible**, it should **not reserve space** as if it were open
  - The **lock/unlock icon** (or an equivalent control) is available where pane locking is supported
- Fix cases where a **locked** state from desktop:
  - Leaves the iPad layout constrained (reduced content width) while not actually rendering the pane
- Consider resetting or adapting lock state appropriately when changing between desktop and iPad breakpoints
- Test switching between desktop ↔ iPad sizes to confirm the layout and lock controls remain consistent and intuitive

**Impacted Files:**
- `src/shared/contexts/PanesContext.tsx` – Pane lock state management, handles tablet vs phone vs desktop logic (lines 35-97), persists locks to user settings
- `src/shared/hooks/useSlidingPane.ts` – Manages pane open/close behavior, syncs with lock state
- `src/shared/components/PaneControlTab.tsx` – Lock/unlock button UI, different behavior for mobile vs desktop
- `src/shared/hooks/use-mobile.tsx` – `useIsTablet()` hook used to determine tablet behavior

**Execution Notes:**  
- Updated `PaneControlTab.tsx` to use `useIsTablet()` hook
- Created `useDesktopBehavior = !isMobile || isTablet` flag
- Tablets now show lock/unlock icons like desktop instead of simplified mobile controls
- Updated `useSlidingPane.ts` to use `isSmallMobile = isMobile && !isTablet` 
- Tablets now support pane locking with one pane at a time (desktop-like behavior)
- Fixed all mobile-only behaviors to only apply to phones, not tablets

**Additional Data Needed:** None

**Testing Instructions:**
1. On desktop, lock the shots pane (or tasks pane)
2. Resize browser to iPad dimensions (~768-1024px)
3. Verify content area is NOT constrained if pane is not visible
4. If pane IS visible on tablet, verify lock/unlock icon is present
5. Unlock on tablet, resize back to desktop - verify behavior is consistent
6. Test both shots pane and tasks pane

---

## Task 5 – Variant Selection on iPad Doesn't Update Video in Media Lightbox ✅

**Area:** iPad UI → Media lightbox → Video variants

**Description:**  
On **iPad**, selecting a different **video variant** does **not** update the main video shown in the **media lightbox**.

**Observed Behavior:**
- User opens the media lightbox on the Edit Video page (or similar view) on iPad
- Tapping a different variant:
  - Does **not** switch the main video to that selected variant
- Works correctly on desktop and phone

**Requirements:**
- Investigate the variant selection behavior specifically on **iPad** in the media lightbox
- Ensure that:
  - Tapping a variant updates the main video to that variant
  - The selected state (highlight) matches the active variant
- Confirm that this fix works on iPad without breaking existing behavior on desktop and phone-sized mobile devices

**Impacted Files:**
- `src/shared/components/MediaLightbox/MediaLightboxRefactored.tsx` – Main lightbox, contains `setActiveVariantId` logic (lines 397-437), variant state management
- `src/shared/components/MediaLightbox/components/DerivedGenerationsGrid.tsx` – Variant click handler, calls `onVariantSelect` (lines 232-264)
- `src/shared/components/MediaLightbox/components/ActiveVariantDisplay.tsx` – Shows which variant is active, switch-to-primary button
- `src/shared/components/MediaLightbox/hooks/useLayoutMode.ts` – Layout mode detection (may affect variant display)

**Execution Notes:**  
- Updated `DerivedGenerationsGrid.tsx` to add `onTouchEnd` handler to variant items
- Touch handler calls `handleItemSelect()` immediately, bypassing any double-tap delay
- Uses `e.preventDefault()` and `e.stopPropagation()` for clean touch handling
- Single tap now works reliably on touch devices for variant selection

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app on iPad or resize to iPad dimensions
2. Navigate to a video that has multiple variants
3. Open the media lightbox
4. Click/tap on a different variant in the derived generations grid
5. Verify the main video updates to show the selected variant
6. Verify the variant highlight indicates the correct selection
7. Test same flow on desktop and phone to ensure no regressions

---

## Task 6 – Repositioned Image X/Y Don't Match Preview on iPad (Less Extreme in Saved Result) ✅

**Area:** Edit Images (iPad) → Repositioning mode

**Description:**  
On **iPad**, when repositioning an image in the **Edit Images** tool, the saved image's **X/Y coordinates** do **not** match what is shown in the live preview while editing. The final saved result interprets the movement as **less extreme** than the preview.

**Observed Behavior:**
- While editing, pushing an image strongly to the left/right shows a clear offset in the preview
- After saving the new image variant:
  - The resulting image is **less shifted** (e.g., less left) than what the preview indicated

**Requirements:**
- Investigate how **X/Y offsets** from the repositioning UI on **iPad** are translated into the saved image coordinates
- Ensure that:
  - The same coordinate system / scaling used for the preview is used for saving
  - Pushing left/right/up/down in the editor produces a **matching** position in the saved output
- Check for:
  - Rounding, clamping, or normalization differences between preview and save
  - iPad-specific scaling or viewport calculations that might be altering the effective offset
- Test multiple repositioning extremes to confirm preview and saved result now align closely

**Impacted Files:**
- `src/shared/components/MediaLightbox/hooks/useRepositionMode.ts` – Core reposition logic, `handleSaveAsVariant` (lines 399-528), `getTransformStyle` for preview, transform state management
- `src/tools/edit-images/components/InlineEditView.tsx` – Uses `useRepositionMode` hook (lines 179-209), renders transform controls
- `src/tools/edit-images/pages/EditImagesPage.tsx` – Main Edit Images page

**Execution Notes:**  
- Fixed `getTransformStyle()` in `useRepositionMode.ts` to use percentage-based CSS transforms
- Changed from `translate(${pixels}px, ${pixels}px)` to `translate(${percent}%, ${percent}%)`
- CSS percentage-based translate is relative to the element's own dimensions
- This ensures preview matches saved result regardless of display scaling
- The canvas still uses source dimensions for high-quality output

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app on iPad or resize to iPad dimensions
2. Navigate to Edit Images tool
3. Select an image and enter reposition mode
4. Drag/slide the image significantly to one side (e.g., far left)
5. Note the preview position
6. Save as variant
7. View the saved variant
8. Verify the saved position matches what was shown in the preview
9. Test with multiple transform combinations (translate + scale, translate + rotate)

---

## Task 7 – Fix Downloads in iPad PWA (Weird Screen Instead of Download) ✅

**Area:** iPad PWA → Downloads (images/videos/files)

**Description:**  
When using the **iPad PWA**, trying to download something (e.g. an image or video) does **not** behave like a normal download. Instead of downloading directly, it opens a **weird intermediate screen/page**. The expected behavior is that the thumbnail stays visible and the file either downloads normally or opens in a standard viewer/download flow.

**Observed Behavior:**
- Open the app as a PWA on iPad
- Trigger a download action (e.g. download image/video from gallery or tool)
- Instead of downloading or invoking normal iOS share/download behavior:
  - Opens an odd/in-between blank or white screen
  - May navigate away from the current view

**Requirements:**
- Reproduce in the iPad PWA:
  - Open the app as a PWA on iPad
  - Trigger a download action (e.g. download image/video from gallery or tool)
  - Observe the strange intermediate screen behavior
- Investigate how downloads are currently triggered:
  - Check whether downloads are initiated via:
    - `<a href="..." download>` links
    - Blob/object URLs
    - `window.open` or similar patterns
  - Compare behavior between:
    - PWA on iPad
    - Safari in-browser on iPad for the same action
- Update the download behavior for iPad PWA so that:
  - It either:
    - Opens the standard iOS viewer/share sheet cleanly, or
    - Starts a proper download without the strange white/blank or intermediate screen
  - Make sure:
    - There's no layout flash or disappearance of the media before/after the download
    - Behavior is consistent across the main file types (images and videos at least)
- Regression-check:
  - Confirm this change doesn't break normal browser downloads on desktop or non-PWA mobile use

**Impacted Files:**
- `src/shared/components/MediaLightbox/utils/download.ts` – Core download utility using fetch + blob + `<a download>` pattern (lines 1-117)
- `src/shared/components/ImageGallery/hooks/useImageGalleryActions.ts` – Gallery download handler using XHR + blob + `<a download>` (lines 306-361)
- `src/shared/components/MediaLightbox/MediaLightboxRefactored.tsx` – Calls `downloadMedia` utility (line 1031-1035)
- `src/shared/components/MediaLightbox/components/ButtonGroups.tsx` – Download button UI in lightbox (lines 133-149)

**Execution Notes:**  
- Added `isIOSPwa()` detection function to `download.ts`
- Detects standalone mode + iOS/iPadOS combination
- For iOS PWA: First tries Web Share API (allows saving to Photos/Files)
- Fallback: Opens URL in new window with toast "Long press to save"
- Regular browser downloads still use the existing blob+download approach

**Additional Data Needed:** None

**Testing Instructions:**
1. Install the app as a PWA on iPad (Add to Home Screen)
2. Open the PWA
3. Navigate to any image or video in gallery or lightbox
4. Tap the download button
5. Verify:
   - No weird intermediate/blank screen appears
   - Either iOS share sheet opens OR file downloads directly
   - Current view remains visible (no navigation away)
6. Test downloading:
   - An image
   - A video
7. Compare behavior with Safari in-browser on iPad - should be similar or better
8. Regression test on:
   - Desktop Chrome/Safari
   - Mobile phone Safari
   - Mobile phone PWA

---

## Notes

- Tasks 3 and 4 are layout foundation tasks - fixing sticky header and pane behavior will make testing other iPad issues easier
- Tasks 5 and 6 are iPad-specific bugs that may share root causes related to viewport/touch handling
- Task 2 may be related to touch event handling - check for overlapping click handlers or touch delay workarounds
- Task 7 (PWA downloads) may require special handling for iOS PWA context where `download` attribute and blob URLs behave differently than in Safari browser

