# Per-Pair Data Persistence

> How per-pair prompts, settings, and overrides are stored and flow through the system.

## Overview

In travel-between-images, a "shot" consists of multiple **images** arranged on a timeline. The gaps between consecutive images form **pairs** (or "segments"). Each pair can have its own:

- **Prompt** (what should happen in this transition)
- **Negative prompt**
- **Technical settings** (LoRAs, motion, phase config) — for regeneration only

This document explains where this data lives, how it flows, and the tradeoffs involved.

---

## Data Model

### Primary Storage: `shot_generations.metadata`

All per-pair data is stored on the **start image** of each pair:

```
Timeline:  [Image A] ----pair 0---- [Image B] ----pair 1---- [Image C]
Storage:      ↑                         ↑
         metadata for pair 0      metadata for pair 1
```

| Field | Purpose | Who Writes | Who Reads |
|-------|---------|-----------|-----------|
| `pair_prompt` | User's custom prompt for this pair | SegmentSettingsModal, MediaLightbox | Overall generation |
| `pair_negative_prompt` | User's negative prompt | SegmentSettingsModal, MediaLightbox | Overall generation |
| `enhanced_prompt` | AI-generated prompt (VLM) | Edge function `update-shot-pair-prompts` | Overall generation (fallback) |
| `user_overrides` | Technical regen settings (LoRAs, motion, etc.) | SegmentSettingsModal, MediaLightbox | Segment regeneration only |

### Example Metadata

```json
{
  "pair_prompt": "The camera slowly pans left as the character walks",
  "pair_negative_prompt": "blurry, distorted",
  "enhanced_prompt": "A cinematic dolly shot following the subject...",
  "user_overrides": {
    "amount_of_motion": 0.7,
    "additional_loras": {
      "https://example.com/lora.safetensors": 0.8
    },
    "phase_config": { ... }
  }
}
```

---

## Prompt Priority Chain

### For Generation (what gets sent to the backend)

When generating video, prompts are resolved with this priority (highest first):

```
1. pair_prompt        (user manually edited)
2. enhanced_prompt    (AI-generated via VLM)
3. base_prompt        (shot-level default prompt)
```

### For Display (what the form shows)

When opening SegmentSettingsModal or MediaLightbox regenerate tab:

```
1. enhanced_prompt    (show AI suggestion as starting point)
2. pair_prompt        (fallback if no AI prompt)
3. base_prompt        (shot-level default)
```

**Why different?** The form shows the AI-enhanced prompt so users see the VLM's description. When they edit, it saves to `pair_prompt` (which then takes priority for generation). The AI version is preserved for "restore to AI version".

### How This Works in Code

**Overall generation** (`generateVideoService.ts`):
```typescript
for (let i = 0; i < filteredShotGenerations.length - 1; i++) {
  const metadata = filteredShotGenerations[i].metadata;
  
  if (metadata?.pair_prompt) {
    pairPrompts[i] = { prompt: metadata.pair_prompt, ... };
  }
  if (metadata?.enhanced_prompt) {
    enhancedPrompts[i] = metadata.enhanced_prompt;
  }
}
// Backend merges: pair_prompt > enhanced_prompt > base_prompt
```

**Form display** (`SegmentSettingsModal.tsx`, `MediaLightboxRefactored.tsx`):
```typescript
// Show AI suggestion first, fall back to user edit, then default
const mergedParams = {
  base_prompt: enhancedPrompt || pairPrompt || defaultPrompt || '',
  // ...
};
// User edits → saved to pair_prompt → used for generation
```

---

## Entry Points

### 1. SegmentSettingsModal (Timeline)

**Location:** `src/tools/travel-between-images/components/Timeline/SegmentSettingsModal.tsx`

**Triggered by:** Clicking a pair gap on the timeline

**Data flow:**
1. `ShotImagesEditor` builds `initialParams` with:
   - Parent generation params (model, phase config, etc.)
   - Current timeline gaps (`segment_frames_expanded`)
   - Structure videos from shot settings
   - User overrides from `shot_generations.metadata.user_overrides`
2. `SegmentSettingsModal` merges with per-pair prompts from metadata
3. User edits → saved to `shot_generations.metadata`:
   - Prompts → `pair_prompt` / `pair_negative_prompt`
   - Technical → `user_overrides`

### 2. MediaLightbox (Regenerate Tab)

**Location:** `src/shared/components/MediaLightbox/MediaLightboxRefactored.tsx`

**Triggered by:** Opening a segment video and switching to "Regenerate" tab

**Data flow:**
1. Lightbox fetches the generation's stored `params`
2. Injects current timeline gaps from `shot_generations`
3. Injects `structure_videos` from shot tool settings
4. User edits → saved to `shot_generations.metadata` (same as SegmentSettingsModal)
5. Fallback: if can't resolve start image, saves to `generations.params.user_overrides`

---

## Technical Settings (user_overrides)

These settings are **regen-only** — they don't affect overall "Generate Video":

| Setting | Description |
|---------|-------------|
| `amount_of_motion` | Motion intensity (0-1) |
| `additional_loras` | LoRA URLs → strengths |
| `phase_config` | Advanced phase configuration |
| `motion_mode` | 'basic' or 'advanced' |
| `num_frames` | Frame count override |

### Why Regen-Only?

The backend orchestrator currently doesn't support per-segment LoRAs, motion, or phase config. All segments in an overall generation use the same settings. Only **prompts** have per-pair support via `base_prompts_expanded` / `enhanced_prompts`.

**Future:** When backend supports per-segment settings, we can promote `user_overrides` fields to affect overall generation.

---

## Enhanced Prompts (VLM)

AI-generated prompts are stored separately to preserve them as a fallback:

1. User clicks "Enhance prompts"
2. VLM analyzes each pair's images
3. Edge function `update-shot-pair-prompts` saves to `enhanced_prompt`
4. If user edits the prompt → saved to `pair_prompt` (enhanced_prompt preserved)
5. User can "Restore to AI version" → deletes `pair_prompt`, falls back to `enhanced_prompt`

```typescript
// Edge function (simplified)
for (let i = 0; i < imageGenerations.length - 1; i++) {
  await supabase
    .from('shot_generations')
    .update({ 
      metadata: { ...existingMetadata, enhanced_prompt: enhancedPrompts[i] }
    })
    .eq('id', imageGenerations[i].id);
}
```

---

## Tradeoffs & Design Decisions

### 1. Why `shot_generations.metadata` instead of `generations.params`?

| Approach | Pros | Cons |
|----------|------|------|
| **shot_generations.metadata** (current) | Survives image replacement; canonical per-pair location; matches edge function | Requires lookup by shot_generation ID |
| **generations.params** | Already loaded with generation | Lost if image replaced; not per-pair canonical |

**Decision:** Use `shot_generations.metadata` as source of truth. The start image's row is the canonical location for that pair's data.

### 2. Why separate `pair_prompt` from `enhanced_prompt`?

Allows non-destructive editing:
- User edits are explicit overrides
- AI prompts are preserved for "restore"
- Clear provenance (human vs AI)

### 3. Why is `user_overrides` regen-only?

Backend limitation. Orchestrator takes single values for LoRAs, motion, phase config. Supporting per-segment would require:
- Backend changes to accept arrays
- UI to show "mixed settings" warnings
- Merge logic for overall generation

**Planned:** See `docs/plans/generation-level-settings.md` for future work.

### 4. Why inject timeline gaps dynamically?

Timeline can change after initial generation:
- User drags images to new positions
- Images added/removed

Injecting current gaps ensures regeneration matches the visible timeline, not stale stored values.

---

## Data Flow Diagrams

### Overall Generation

```
User clicks "Generate Video"
        ↓
generateVideoService.ts
        ↓
Query shot_generations (ordered by timeline_frame)
        ↓
For each pair (i, i+1):
  - Read metadata from shot_generations[i]
  - pair_prompt → pairPrompts[i]
  - enhanced_prompt → enhancedPrompts[i]
        ↓
Build request body:
  - base_prompts: pairPrompts (or empty for fallback)
  - enhanced_prompts: enhancedPrompts
  - segment_frames_expanded: from timeline gaps
        ↓
Backend orchestrator merges:
  base_prompts[i] || enhanced_prompts[i] || global_base_prompt
```

### Segment Regeneration

```
User opens pair (SegmentSettingsModal or MediaLightbox)
        ↓
Load from shot_generations.metadata:
  - pair_prompt, pair_negative_prompt
  - enhanced_prompt
  - user_overrides
        ↓
Inject current timeline data:
  - segment_frames_expanded (from live timeline)
  - structure_videos (from shot tool settings)
        ↓
User edits form
        ↓
Debounced save to shot_generations.metadata:
  - Prompts → pair_prompt, pair_negative_prompt
  - Technical → user_overrides
        ↓
User clicks "Regenerate"
        ↓
createIndividualTravelSegmentTask()
  - Uses form values
  - Includes orchestrator_details with timeline context
```

---

## Extra "Color" (Invariants, Ordering, and Gotchas)

### Video-to-Pair Tethering (Critical)

**Videos are tethered to shot_generations via `start_image_generation_id`, not stored `segment_index`.**

When displaying or regenerating a segment video:
1. Extract `start_image_generation_id` from the video's params
2. Find that ID in the current `shot_generations` array
3. Use that position as the segment index

```typescript
// MediaLightbox / ChildGenerationsView
const startGenIdFromParams = segmentImageInfo.startGenId;
const segmentIndex = timelineImages.findIndex(img => img.id === startGenIdFromParams);
// Falls back to stored segment_index only if not found
```

**Why not use stored `segment_index`?**
- Stored index can become stale (e.g., after segment deletion, `child_order` is updated but `params.segment_index` is not)
- Tethering to the actual image ID is semantically correct — the video IS the transition from that image
- Automatically correct when timeline changes

**What if the start image is deleted?**
- Video becomes "orphaned" (no matching shot_generation)
- Falls back to stored `segment_index` or first available slot

### Pair Indexing Invariant (Critical)

If a shot has \(N\) positioned images on the timeline, it has **\(N-1\) pairs**.

- **Pair index `i`** describes the transition **from image `i` → image `i+1`**
- **Per-pair data is stored on the *start image* row**, i.e. `shot_generations[i].metadata`
- **Videos are tethered to pairs** via `start_image_generation_id` matching `shot_generations[i].id`
- The "last image" has **no outgoing pair**, so it should not need per-pair prompt data

This same convention is used by:
- Timeline UI pair editing
- Overall generation prompt extraction
- `update-shot-pair-prompts` (enhanced prompts)
- Video slot positioning in ChildGenerationsView
- MediaLightbox regenerate tab per-pair data lookup

### Filtering + Ordering Must Match

Any code that maps *pair index* → *shot_generation row* must use the same filtering & deterministic ordering, or indices will drift.

| Rule | Why it exists |
|------|---------------|
| Exclude **unpositioned** items (`timeline_frame < 0`) | Timeline has a sentinel for unpositioned media |
| Exclude **videos** (by `generation.type` and/or file extension) | Videos can exist in the same shot timeline but are not part of travel pairs |
| Sort by `timeline_frame ASC`, tie-break by `id ASC` | Stable ordering prevents “pair index shuffle” |

**Where this matters:** `generateVideoService.ts`, `update-shot-pair-prompts`, timeline pair UI, and MediaLightbox’s regeneration lookup.

### Snapshot vs Source-of-Truth (What to Trust)

| Data | Stored Where | Trust Level | Notes |
|------|--------------|------------|------|
| Per-pair prompts | `shot_generations.metadata.pair_prompt` | **Source of truth** | Used by overall generation |
| AI prompts | `shot_generations.metadata.enhanced_prompt` | **Source of truth (AI fallback)** | Never delete on user edit |
| Per-pair technical regen tweaks | `shot_generations.metadata.user_overrides` | **Source of truth (regen)** | Backend currently can’t apply per-segment to overall generation |
| Generation params | `generations.params` | Snapshot | Can be stale vs current timeline / per-pair edits |
| Task params | `tasks.params` | Snapshot | Good for debugging “what was sent” but not canonical |

### Prompt Field Naming Back-Compat

Historically the UI/params may use both `prompt` and `base_prompt`. Current code treats them as synonyms:

- **Persist (overall):** `pair_prompt` / `pair_negative_prompt`
- **In-form:** `base_prompt` (and sometimes `prompt` for compatibility)

**Rule of thumb:** don’t store prompts inside `user_overrides` long-term; keep prompts in the dedicated per-pair fields so overall generation picks them up.

### Reset / Restore Semantics (Important UX detail)

There are *three* conceptually different actions:

| Action | What it should do | Resulting prompt used |
|--------|--------------------|-----------------------|
| Clear field | Set `pair_prompt = ""` | **In current code this behaves like “no override”** (empty strings are treated as absent), so it falls back to `enhanced_prompt` / shot default |
| Restore to AI | Delete `pair_prompt` | Falls back to `enhanced_prompt` |
| Restore to defaults | Delete `pair_prompt` **and** `enhanced_prompt` | Falls back to shot default `base_prompt` |

**Note:** The current “Reset to variant defaults” in the regen form clears `user_overrides` only; it does **not** clear `pair_prompt` / `enhanced_prompt` unless we add explicit UI for those.

**Implication:** Today the system does not really support an “explicit blank prompt override” per pair. To support that, we’d need a separate flag (e.g. `pair_prompt_is_set: true`) or store a value that the generator treats as intentionally blank (and update the generator logic accordingly).

## Key Files

| File | Purpose |
|------|---------|
| `src/tools/travel-between-images/components/Timeline/SegmentSettingsModal.tsx` | Timeline segment settings editing UI |
| `src/shared/components/MediaLightbox/MediaLightboxRefactored.tsx` | Lightbox regenerate tab; derives segment from `start_image_generation_id` |
| `src/shared/components/SegmentSettingsForm.tsx` | Controlled form component for segment settings |
| `src/shared/components/MediaLightbox/components/SegmentRegenerateForm.tsx` | Lightbox-specific wrapper using SegmentSettingsForm |
| `src/shared/hooks/useSegmentSettings.ts` | Hook for fetching/merging/persisting segment settings |
| `src/shared/components/segmentSettingsUtils.ts` | Utilities, interfaces, and presets for segment settings |
| `src/shared/lib/tasks/individualTravelSegment.ts` | Task creation for segment regen |
| `src/tools/travel-between-images/components/ShotEditor/services/generateVideoService.ts` | Overall generation logic |
| `src/tools/travel-between-images/components/VideoGallery/components/ChildGenerationsView.tsx` | Video gallery slots; derives slot from `start_image_generation_id` |
| `src/tools/travel-between-images/components/VideoGallery/utils/gallery-utils.ts` | `extractSegmentImages()` utility |
| `supabase/functions/update-shot-pair-prompts/index.ts` | Edge function for VLM prompts |

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Prompt not used in overall gen | Saved to wrong field | Verify saving to `pair_prompt`, not `user_overrides.base_prompt` |
| Regen uses stale timeline gaps | Old `segment_frames_expanded` in params | Check timeline gaps injection in entry point |
| Enhanced prompt lost after edit | Code deleting `enhanced_prompt` | Verify only `pair_prompt` is set, not deleting enhanced |
| Settings not persisting | Wrong shot_generation ID | Check `pairData.startImage.id` matches shot_generations row |
| MediaLightbox different from Timeline | Different save paths | Both should save to `shot_generations.metadata` |
| Video shows wrong pair's data | Stale `segment_index` in params | Fixed: now derives segment from `start_image_generation_id` |
| Video in wrong slot in gallery | `child_order` doesn't match pair | Fixed: ChildGenerationsView derives slot from `start_image_generation_id` |

---

## Future Work

1. **Per-segment LoRAs/motion in overall generation** — requires backend changes
2. **"Restore to AI version" button** — deletes `pair_prompt` to fall back
3. **"Restore to defaults" button** — clears both `pair_prompt` and `user_overrides`
4. **Unified settings panel** — single place to edit all pairs at once
5. **Settings diff view** — show which pairs have custom settings

See also: `docs/plans/generation-level-settings.md`

