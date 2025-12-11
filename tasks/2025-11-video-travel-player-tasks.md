# Task Document

*No tasks currently. Add new tasks and I’ll list them here.*

---

## Task 1 – Repositioning Should Scale Settings with Canvas Size

**Area:** Image editor → Repositioning / canvas-based transforms

**Description:**
When using the repositioning mode, the underlying settings for the image (position, scale, etc.) should be adjusted **proportionally to the canvas/screen size**. If the canvas is smaller, the saved settings for new images should reflect this scaling, so behavior is consistent across different screen sizes.

**Requirements:**

* Base repositioning (move/scale/etc.) on values that are **normalized to the canvas size**.
* When the canvas/screen is smaller:

  * Adjust the stored transform settings proportionally so the resulting saved image is positioned/scaled correctly in the final output.
* Ensure that saved settings for new images:

  * Are resolution- / canvas-independent (e.g., percentages or normalized coordinates).
  * Produce visually consistent results regardless of device or viewport size.
* Confirm this behavior both for repositioning and any related settings that depend on canvas dimensions.

---

## Task 2 – Variant Selector Overruns Bottom of Screen

**Area:** Media / editor UI → Variant selector (bottom bar)

**Description:**
The **variant selector** at the bottom of the screen still **overruns / extends far beyond** the bottom on some views, instead of fitting neatly within the visible area.

**Observed Behavior:**

* The bottom variant strip extends beyond the viewport.
* This may require unnecessary scrolling or cause visual clipping / overlap with other UI elements.

**Requirements:**

* Fix the layout of the bottom **variant selector** so that:

  * It fits entirely within the visible bottom area of the screen.
  * It no longer extends far beyond the bottom of the page/lightbox/editor.
* Verify behavior on:

  * Mobile (primary focus).
  * Desktop/tablet, to ensure no regressions.
* Adjust heights, overflow rules, and container structure as needed so the variants area is appropriately sized and scrollable (if needed) but not oversized.

---

## Task 3 – Task Filter Should Apply Across All Pages

**Area:** Task Pane → Task filter / pagination

**Description:**
When using the **task filter**, it currently appears to only filter tasks on the **current page** of results. Instead, the filter should apply to **all tasks across all pages**.

**Requirements:**

* Update the task filtering logic so that:

  * Filters are applied over the **entire task collection**, not just the tasks loaded on the current page.
  * Pagination reflects the filtered result set (e.g., page 1 of filtered tasks, etc.).
* Ensure that:

  * The task count and pages update correctly when a filter is active.
  * Changing or clearing the filter returns to the expected full list + pagination.
* Consider performance implications for large numbers of tasks (e.g., server-side filtering, efficient queries).

---

## Task 4 – Wrap Mobile Tool Buttons Two per Row in Floating Tool Selector

**Area:** Mobile UI → Floating tool selector

**Description:**
On mobile, the **tool buttons** in the floating tool selector run over the edge of the container, causing horizontal overflow / clipping. To fix this, the buttons should be laid out **two per row**.

**Requirements:**

* Update the layout of the **floating tool selector** on **mobile** so that:

  * Tool buttons are arranged **two per row**.
  * No buttons overflow or run past the edge of the selector/container.
* Ensure that:

  * Spacing and tap targets remain comfortable for touch.
  * The layout adapts cleanly across common mobile widths.
* Verify that desktop/tablet layouts remain unchanged (unless explicitly desired otherwise).

---

## Task 5 – Adjust Buttons in Media Lightbox (Remove Extra Flip, Move Edit Button)

**Area:** Media lightbox UI

**Description:**
Update the media lightbox controls so that the **extra flip button** is removed and the **Edit** button is positioned in the **top-left** of the lightbox.

**Requirements:**

* Identify and **remove** the redundant / secondary **flip button** from the media lightbox UI.
* Move or place the **Edit** button in the **top-left** corner of the lightbox.
* Ensure that:

  * The remaining controls are laid out cleanly and consistently.
  * There’s no visual gap or awkward spacing where the removed flip button used to be.
* Verify behavior on both desktop and mobile views for the media lightbox.

---

## Task 6 – Segment Thumbnails Not Showing for Selected Portions (Mobile)

**Area:** Mobile UI → Segment thumbnails / selection

**Description:**
On **mobile**, the **segment thumbnails** for selected portions are not appearing, even though segments are selected.

**Observed Behavior:**

* When a segment/portion is selected on mobile:

  * The expected thumbnail preview for that segment does **not** show.
* This makes it hard to see which portion is which while editing on mobile.

**Requirements:**

* Investigate why segment thumbnails are not being rendered on **mobile** for selected portions.
* Ensure that:

  * Selecting a segment shows the correct thumbnail preview.
  * Thumbnails update appropriately when selection changes.
* Verify behavior across relevant views (e.g., child generations, edit video timelines) where segment thumbnails should appear.
* Confirm desktop behavior remains correct after the fix.

---

## Task 7 – Open Correct Variant When Clicking Item (Edit Images & Edit Videos)

**Area:** Edit Images page / Edit Videos page → Item selection & variants

**Description:**
On the **Edit Images** and **Edit Videos** pages, when clicking into an item, it should open **that specific variant** rather than a default or different variant.

**Requirements:**

* Update item click behavior so that:

  * When the user taps/clicks a given item/thumbnail, the editor/lightbox opens with **that exact variant** active.
* Ensure that:

  * The correct variant data (ID, metadata, media) is passed into the editor.
  * The UI (e.g., variant strip) reflects that this variant is selected.
* Verify consistent behavior for both:

  * Edit Images page.
  * Edit Videos page.
* Confirm that any previous behavior where a "first" or default variant was opened is fully replaced by this explicit selection logic.

---

## Task 8 – Selected Segment Fill Color Between Markers Sometimes Disappears

**Area:** Edit Video page → Segment selection UI

**Description:**
On the **Edit Video** page, for a **selected segment**, the **fill color** that should appear between the two segment markers sometimes disappears, even though the segment is still selected.

**Observed Behavior:**

* A segment is selected with two markers indicating its boundaries.
* The area between the markers is normally filled/highlighted.
* Occasionally, the fill/highlight disappears while the markers remain, making it unclear which range is active.

**Requirements:**

* Investigate the rendering/selection logic for the **segment fill** between markers.
* Ensure that:

  * As long as a segment is selected, the fill color between the two markers remains visible.
  * The fill updates correctly when the selection changes or markers move.
* Check for interactions that may cause the fill to vanish (e.g., scrolling, resizing, timeline updates) and fix accordingly.
* Verify behavior on both desktop and mobile.

---

## Task 9 – iPad Segment Marker Taps Trigger Text Selection

**Area:** Edit Video page → Segment markers (iPad)

**Description:**
On **iPad**, tapping to move the **segment start/end markers** sometimes triggers **text selection mode** on the text below instead of adjusting the markers.

**Observed Behavior:**

* User taps near or on a segment start/end to adjust it.
* Instead of moving the marker, iPad enters text-selection mode on underlying text elements.

**Requirements:**

* Adjust the interaction handling on **iPad** so that:

  * Taps in the segment control area are captured by the segment/timeline component and **do not** fall through to text selection.
* Possible improvements:

  * Ensure the segment/timeline region fully covers the tap area (no transparent gaps).
  * Prevent default text-selection behavior for taps within the control.
* Test on physical/simulated iPad devices to confirm that tapping/moving segment start/ends works reliably without triggering text selection on the text below.

---

## Task 10 – Edited Videos Not Appearing in Gallery (Edit Videos Tool)

**Area:** Edit Videos tool → Task pipeline → Gallery display

**Description:**
When a video is edited via the **Edit Videos** tool, the resulting edited video is **not** showing up in the gallery within that tool.

**Requirements:**

* Trace and verify the entire pipeline for edited videos in the Edit Videos tool:

  1. **Create Task** – How the edit video task is created and what metadata/links are attached.
  2. **Complete Task** – How the completed result is stored (including variants, IDs, shot/parent associations).
  3. **Gallery Display** – How the gallery queries and displays items for this tool.
* Identify where the edited video is getting lost (e.g., missing associations, flags, or wrong collection key) so it fails to appear in the gallery.
* Fix the pipeline so that:

  * Edited videos created via the Edit Videos tool **always** appear in the corresponding gallery.
  * Any necessary metadata is written correctly on task completion for the gallery to discover them.
* Add basic logging or checks so future regressions in this pipeline are easier to detect.
