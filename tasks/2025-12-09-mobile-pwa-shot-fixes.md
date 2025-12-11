# Task Document – Mobile/PWA UI & Shot Operations Fixes

**Date:** 2025-12-09  
**Status:** ✅ Complete

---

## Master Checklist

### Quick Wins (unblock testing quickly)
- [x] **Task 5** – Remove "Shot Deleted Successfully" Toast ✅
  - *Simple single-line removal, no dependencies*

### Backend / Schema (do first - other tasks may depend)
- [x] **Task 4** – Fix "Failed to Duplicate Shot" Schema/Function Error ✅
  - *Requires DB migration + schema cache refresh before testing*

### Mobile UI Cluster (same area - HeroSection & install flows)
- [x] **Task 1** – Condense Layout When CTA Text Appears on Mobile ✅
  - *Touch HeroSection.tsx spacing*
- [x] **Task 2** – Use Correct Helper Image for Chrome on iOS ✅
  - *Touch InstallInstructionsModal.tsx and usePlatformInstall.ts*

---

## Task 1 – Condense Layout When CTA Text Appears on Mobile ✅

**Area:** Mobile UI → Auth / CTA section (HeroSection)

**Description:**  
On **mobile**, when the **text+CTA block** appears below (instead of just the "Sign in with Discord" button), the whole page feels **too spread out**. The spacing with only the "Sign in with Discord" button feels right, but the version with the extra text/CTA feels overly tall and loose.

**Observed Behavior:**  
When `platformInstall.showInstallCTA` is true, an additional "or sign in here instead" link appears below the main CTA button. The container uses fixed padding/margins that don't adapt well to the additional content on mobile viewports.

**Requirements:**
- Review the mobile layout for the state where **extra CTA text** is shown below the main content
- Condense vertical spacing so that:
  - The layout feels closer in density to the **"Sign in with Discord" only** state
  - There aren't large, unnecessary gaps between the text, CTA, and surrounding elements
- Adjust margins/padding/font sizes as needed, but keep readability and clarity
- Verify on common mobile viewport sizes so it feels compact but not cramped

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/pages/Home/components/HeroSection.tsx` | Main hero section with CTA buttons – lines 388-489 contain the CTA layout with conditional secondary button |
| `src/index.css` or `src/App.css` | May need mobile-specific overrides |

**Execution Notes:**  
- Reduced subtitle margin: `mt-8` → `mt-6 md:mt-8`, `mb-8` → `mb-6 md:mb-8`
- Reduced CTA container padding: `pb-6` → `pb-4 md:pb-6`
- Reduced CTA button-to-link gap: `gap-3` → `gap-2 md:gap-3` (both logged-in and logged-out states)
- Reduced social icons margin and spacing: `mt-8` → `mt-4 md:mt-8`, `space-y-3` → `space-y-2 md:space-y-3`
- Total mobile vertical space reduction: ~40px tighter layout

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app on mobile viewport (or use DevTools mobile emulation)
2. Ensure you are NOT logged in
3. Verify `platformInstall.showInstallCTA` is true (iOS Safari, or desktop Chrome/Edge)
4. Compare layout density between:
   - State A: Only "Sign in with Discord" button (when showInstallCTA is false)
   - State B: Install CTA + "or sign in here instead" link (when showInstallCTA is true)
5. Confirm State B now feels compact and similar in density to State A
6. Test on: iPhone SE (375px), iPhone 12/13 (390px), iPhone Plus sizes (428px)

---

## Task 2 – Use Correct Helper Image for "Add to Home Screen" on Chrome (iPhone) ✅

**Area:** Mobile helper UI → Add to Home Screen instructions (Chrome on iPhone)

**Description:**  
On **Chrome on iPhone**, the helper image for the **"Add to Home Screen"** flow currently shows the **Safari** version (share icon at bottom toolbar) instead of the actual Chrome UI. The helper should match the browser in use.

**Observed Behavior:**  
In `InstallInstructionsModal.tsx`, when `installMethod === 'safari-home-screen'` is true (which includes Chrome on iOS), it renders `<SafariShareIcon />` regardless of the actual browser. Chrome on iOS has a different UI for the share action (three-dot menu → "Add to Home Screen").

**Requirements:**
- Detect when the user is on **Chrome on iOS** (browser === 'chrome' && platform === 'ios')
- For that case, show a helper image/instructions that:
  - Match the actual **Chrome on iPhone** UI and steps for adding to home screen
- Continue to show the **Safari** helper only when the user is actually using Safari
- The `usePlatformInstall.ts` hook already detects `browser` and `platform` separately – pass these to the modal
- Verify behavior on real devices for both Safari and Chrome on iOS

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/pages/Home/components/InstallInstructionsModal.tsx` | Modal rendering install instructions – needs new Chrome iOS visual component and conditional rendering in `getMainVisual()` |
| `src/shared/hooks/usePlatformInstall.ts` | Already provides `browser` and `platform` – may need to expose additional instruction text for Chrome iOS |

**Execution Notes:**  
- Added `DeviceType` detection (`phone` | `tablet` | `desktop`) to `usePlatformInstall.ts`
- Added new visual components:
  - `ChromeIOSShareIcon` - iPhone Chrome three-dot menu
  - `iPadSafariShareIcon` - iPad Safari top toolbar with share button
  - `iPadChromeShareIcon` - iPad Chrome desktop-like toolbar with three-dot menu dropdown
- Updated `getMainVisual()` to differentiate:
  - iPad Chrome → `iPadChromeShareIcon`
  - iPad Safari → `iPadSafariShareIcon`  
  - iPhone Chrome → `ChromeIOSShareIcon`
  - iPhone Safari → `SafariShareIcon`
- Updated `installInstructions` with device-specific text:
  - iPad: "Tap ⋮ menu at top-right" / "Tap Share in the toolbar"
  - iPhone: "Tap ⋮ menu" / "Tap Share"
- Added `deviceType` prop to `InstallInstructionsModal`

**Additional Data Needed:** None

**Testing Instructions:**
1. Open app in **Safari on iPhone** → trigger install modal → verify Safari share icon shows
2. Open app in **Chrome on iPhone** → trigger install modal → verify Chrome-specific UI shows (three-dot menu mockup)
3. Verify instructions text is appropriate for each browser
4. Confirm fallback behavior works if browser detection fails

---

## Task 4 – Fix "Failed to Duplicate Shot" Schema/Function Error ✅

**Area:** Backend → DB functions / schema cache (shot duplication)

**Description:**  
Attempting to **duplicate a shot** shows an error:
> Failed to duplicate shot: Could not find the function `public.duplicate_shot(original_shot_id, project_id)` in the schema cache

**Observed Behavior:**  
The `useDuplicateShot` hook in `useShots.ts` (lines 154-189) calls:
```typescript
const { data, error } = await supabase.rpc('duplicate_shot', {
  original_shot_id: shotId,
  project_id: projectId
});
```
However, no migration file in `supabase/migrations/` creates this function. The function simply does not exist in the database.

**Requirements:**
- Create a new migration file with the `duplicate_shot` database function that:
  - Takes `original_shot_id UUID` and `project_id UUID` as parameters
  - Creates a copy of the shot (new ID, same name with " (copy)" suffix, same project_id)
  - Copies all `shot_generations` records from the original shot to the new shot
  - Preserves `timeline_frame` values for each copied shot_generation
  - Returns the new shot's ID
- Apply the migration to the database
- Refresh/rebuild the **schema cache** so the function is discoverable by the API
- Confirm that duplicating a shot now works without errors

**Impacted Files:**
| File | Purpose |
|------|---------|
| `supabase/migrations/20251209000000_add_duplicate_shot_function.sql` | **NEW** – Migration to create the `duplicate_shot` function |
| `src/shared/hooks/useShots.ts` | Contains `useDuplicateShot` hook (lines 154-189) – no changes needed, function signature matches |
| `src/integrations/supabase/types.ts` | Auto-generated types – will update after migration is applied |

**Execution Notes:**  
- Created migration `20251209000000_add_duplicate_shot_function.sql`
- Function `duplicate_shot(original_shot_id UUID, project_id UUID)` returns the new shot's UUID
- Copies shot name with " (copy)" suffix, preserves aspect_ratio and settings
- Copies all shot_generations with timeline_frame and metadata preserved
- No changes needed to `useShots.ts` - parameter names already match

**Additional Data Needed:** None

**Testing Instructions:**
1. Run `supabase db push` or apply migration manually
2. Restart Supabase local dev or refresh prod schema cache
3. Navigate to a project with at least one shot
4. Click duplicate on a shot
5. Verify:
   - No error appears
   - New shot is created with " (copy)" suffix
   - All images from original shot appear in the duplicated shot
   - Timeline positions are preserved

---

## Task 5 – Remove "Shot Deleted Successfully" Toast ✅

**Area:** UI Notifications → Shot deletion

**Description:**  
After deleting a shot, a **"Shot deleted successfully"** toast/notification is shown. Per project conventions (only show error toasts, not success toasts), this toast should be removed.

**Observed Behavior:**  
In `useShots.ts` line 207, `onSuccess` callback for `useDeleteShot` calls:
```typescript
toast.success('Shot deleted successfully');
```

**Requirements:**
- Remove or comment out the success toast in `useDeleteShot.onSuccess`
- Ensure that error handling remains intact (line 217: `toast.error(...)`)
- UI should still update appropriately (shot disappears from list)

**Impacted Files:**
| File | Purpose |
|------|---------|
| `src/shared/hooks/useShots.ts` | Line 207 – remove `toast.success('Shot deleted successfully')` |

**Execution Notes:**  
- Replaced `toast.success('Shot deleted successfully')` with a comment explaining the removal
- Error toast handling preserved on line 217

**Additional Data Needed:** None

**Testing Instructions:**
1. Navigate to a project with multiple shots
2. Delete a shot
3. Verify:
   - Shot is removed from the UI
   - **No** success toast appears
   - If deletion fails (simulate by disconnecting network), error toast still appears

---

## Notes

- Task 3 was not included in the original request
- Tasks are numbered as provided to maintain reference consistency
