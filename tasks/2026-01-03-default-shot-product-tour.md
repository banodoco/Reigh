# Default Shot + Product Tour Implementation Plan

## Overview

Create a "Getting Started" shot with sample generations for new users, plus a guided product tour that starts after the WelcomeBonusModal completes.

---

## Part 1: Default Shot with Sample Generations (Dynamic Template)

### Approach: Dynamic Template from Existing Project

Instead of hardcoding sample assets, we use a **live template** from an existing project. This allows updating the onboarding content simply by editing the template project/shot.

**How it works:**
1. Store template IDs in `onboarding_config` table (project, shot, video)
2. When new user signs up → copy content from template to their "Getting Started" shot
3. Update template anytime → new users automatically get latest version

**What gets copied:**
- **Starred images** from template project → New user's gallery
- **Timeline images** from template shot → New user's Getting Started shot (with positions, metadata, settings)
- **Featured video** → New user's shot

### Implementation Steps

#### 1.1 Create Config Table and Seed Template

**Migration:** `supabase/migrations/YYYYMMDD_onboarding_config.sql`

```sql
-- Config table for onboarding template references
CREATE TABLE IF NOT EXISTS onboarding_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Will be populated with actual IDs after selecting template content
-- Example:
-- INSERT INTO onboarding_config (key, value) VALUES (
--   'template',
--   '{
--     "project_id": "uuid-of-template-project",
--     "shot_id": "uuid-of-template-shot",
--     "featured_video_id": "uuid-of-video-generation"
--   }'
-- );
```

#### 1.2 Create `copyTemplateToNewUser` Helper

**File:** `src/shared/contexts/ProjectContext.tsx` (alongside existing `createDefaultShot`)

```typescript
/**
 * Copy template content to a new user's Getting Started shot.
 * Uses live data from template project/shot, so updates are automatic.
 */
const copyTemplateToNewUser = async (newProjectId: string, newShotId: string): Promise<void> => {
  try {
    // 1. Get template config
    const { data: config, error: configError } = await supabase
      .from('onboarding_config')
      .select('value')
      .eq('key', 'template')
      .single();

    if (configError || !config) {
      console.log('[Onboarding] No template config found, skipping sample content');
      return;
    }

    const { project_id, shot_id, featured_video_id } = config.value;

    // 2. Copy starred images from template project to new user's gallery
    const { data: starredGens } = await supabase
      .from('generations')
      .select('type, location, thumbnail_url, params')
      .eq('project_id', project_id)
      .eq('is_starred', true)
      .eq('type', 'image');

    if (starredGens?.length) {
      const starredInserts = starredGens.map(gen => ({
        project_id: newProjectId,
        type: gen.type,
        location: gen.location,
        thumbnail_url: gen.thumbnail_url,
        params: { ...gen.params, is_sample: true },
        is_starred: true, // Keep them starred for new user too
      }));

      await supabase.from('generations').insert(starredInserts);
      console.log(`[Onboarding] Copied ${starredGens.length} starred images`);
    }

    // 3. Copy template shot settings to new shot
    const { data: templateShot } = await supabase
      .from('shots')
      .select('settings, aspect_ratio')
      .eq('id', shot_id)
      .single();

    if (templateShot) {
      await supabase
        .from('shots')
        .update({
          settings: templateShot.settings,
          aspect_ratio: templateShot.aspect_ratio,
        })
        .eq('id', newShotId);
    }

    // 4. Copy timeline images from template shot
    const { data: shotGens } = await supabase
      .from('shot_generations')
      .select(`
        timeline_frame,
        metadata,
        generations:generation_id (
          type, location, thumbnail_url, params
        )
      `)
      .eq('shot_id', shot_id)
      .not('timeline_frame', 'is', null)
      .order('timeline_frame');

    if (shotGens?.length) {
      for (const sg of shotGens) {
        const gen = sg.generations as any;
        if (!gen || gen.type === 'video') continue;

        // Create new generation record (same URL, new project)
        const { data: newGen } = await supabase
          .from('generations')
          .insert({
            project_id: newProjectId,
            type: gen.type,
            location: gen.location,
            thumbnail_url: gen.thumbnail_url,
            params: { ...gen.params, is_sample: true },
          })
          .select('id')
          .single();

        if (newGen) {
          // Link to new shot with same position and metadata
          await supabase.from('shot_generations').insert({
            shot_id: newShotId,
            generation_id: newGen.id,
            timeline_frame: sg.timeline_frame,
            metadata: sg.metadata, // Preserves pair prompts etc.
          });
        }
      }
      console.log(`[Onboarding] Copied ${shotGens.length} timeline images`);
    }

    // 5. Copy featured video if specified
    if (featured_video_id) {
      const { data: videoGen } = await supabase
        .from('generations')
        .select('type, location, thumbnail_url, params')
        .eq('id', featured_video_id)
        .single();

      if (videoGen) {
        const { data: newVideo } = await supabase
          .from('generations')
          .insert({
            project_id: newProjectId,
            type: videoGen.type,
            location: videoGen.location,
            thumbnail_url: videoGen.thumbnail_url,
            params: { ...videoGen.params, is_sample: true },
          })
          .select('id')
          .single();

        if (newVideo) {
          // Link video to shot (no timeline_frame for videos)
          await supabase.from('shot_generations').insert({
            shot_id: newShotId,
            generation_id: newVideo.id,
          });
          console.log('[Onboarding] Copied featured video');
        }
      }
    }

    console.log('[Onboarding] Template content copied successfully');
  } catch (err) {
    console.error('[Onboarding] Exception copying template:', err);
  }
};
```

#### 1.3 Update `createDefaultShot` to Call Template Copy

Modify the existing `createDefaultShot` function:

```typescript
const createDefaultShot = async (
  projectId: string,
  initialSettings?: any,
  isFirstProject: boolean = false
): Promise<void> => {
  try {
    const shotName = isFirstProject ? 'Getting Started' : 'Default Shot';

    const { data: shot, error } = await supabase
      .from('shots')
      .insert({
        name: shotName,
        project_id: projectId,
        settings: initialSettings || {},
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ProjectContext] Failed to create default shot:', error);
      return;
    }

    // For first-time users, copy template content
    if (isFirstProject && shot) {
      await copyTemplateToNewUser(projectId, shot.id);
    }
  } catch (err) {
    console.error('[ProjectContext] Exception creating default shot:', err);
  }
};
```

#### 1.4 Update the `fetchProjects` Call Site

In `fetchProjects`, pass `isFirstProject: true` when creating the first project:

```typescript
// Around line 528-530 in ProjectContext.tsx
// Create default shot for the new project - mark as first project for sample content
await createDefaultShot(newProject.id, undefined, true /* isFirstProject */);
```

#### 1.5 Navigate to Getting Started Shot After Welcome Modal

```typescript
// In Layout.tsx handleWelcomeClose
const handleWelcomeClose = useCallback(async () => {
  closeWelcomeModal();

  // Find the Getting Started shot and navigate to it
  if (selectedProjectId) {
    const { data: shot } = await supabase
      .from('shots')
      .select('id')
      .eq('project_id', selectedProjectId)
      .eq('name', 'Getting Started')
      .maybeSingle();

    if (shot) {
      navigate(`/video-travel?shot=${shot.id}`);
    }
  }

  // Start product tour after brief delay
  setTimeout(() => startTour(), 500);
}, [closeWelcomeModal, selectedProjectId, navigate, startTour]);
```

#### 1.6 Helper Script: Set Template IDs

Once you've created the template content, run this to set the config:

```sql
-- Find your template project
SELECT id, name FROM projects WHERE name ILIKE '%template%' OR name ILIKE '%onboarding%';

-- Find starred images in template project
SELECT id, location FROM generations
WHERE project_id = 'YOUR_PROJECT_ID' AND is_starred = true AND type = 'image';

-- Find template shot
SELECT id, name FROM shots WHERE project_id = 'YOUR_PROJECT_ID';

-- Find a good video to feature
SELECT id, location FROM generations
WHERE project_id = 'YOUR_PROJECT_ID' AND type = 'video' LIMIT 5;

-- Set the template config
INSERT INTO onboarding_config (key, value)
VALUES ('template', '{
  "project_id": "YOUR_PROJECT_ID",
  "shot_id": "YOUR_SHOT_ID",
  "featured_video_id": "YOUR_VIDEO_ID"
}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

### Benefits of Dynamic Template

| Benefit | Description |
|---------|-------------|
| **Easy updates** | Edit template project/shot in UI, new users get latest |
| **No file duplication** | New records point to same storage URLs |
| **Full fidelity** | Preserves timeline positions, pair prompts, shot settings |
| **No deploys needed** | Change template content without code changes |
| **Testable** | Create test user to verify onboarding experience |

---

## Part 2: Product Tour with React Joyride

### Installation

```bash
npm install react-joyride
```

### Implementation Steps

#### 2.1 Create Tour State Management

**File:** `src/shared/hooks/useProductTour.ts`

```typescript
import { useState, useCallback, useEffect } from 'react';
import { useUserUIState } from './useUserUIState';
import { usePanes } from '@/shared/contexts/PanesContext';

interface TourState {
  completed: boolean;
  skipped: boolean;
  currentStep: number;
}

export function useProductTour() {
  const { value: tourState, update: saveTourState } = useUserUIState<TourState>(
    'productTour',
    { completed: false, skipped: false, currentStep: 0 }
  );

  const [isRunning, setIsRunning] = useState(false);
  const { setIsGenerationsPaneOpen, setIsTasksPaneOpen } = usePanes();

  const startTour = useCallback(() => {
    if (!tourState?.completed && !tourState?.skipped) {
      setIsRunning(true);
    }
  }, [tourState]);

  const completeTour = useCallback(() => {
    setIsRunning(false);
    saveTourState({ completed: true, skipped: false, currentStep: 0 });
  }, [saveTourState]);

  const skipTour = useCallback(() => {
    setIsRunning(false);
    saveTourState({ completed: false, skipped: true, currentStep: 0 });
  }, [saveTourState]);

  return {
    isRunning,
    startTour,
    completeTour,
    skipTour,
    tourState,
    setIsGenerationsPaneOpen,
    setIsTasksPaneOpen,
  };
}
```

#### 2.2 Create Tour Steps Configuration

**File:** `src/shared/components/ProductTour/tourSteps.ts`

The tour steps use the same color progression as WelcomeBonusModal for visual continuity:

```typescript
import { Step } from 'react-joyride';

// Color progression matching WelcomeBonusModal (continues from step 8)
export const tourStepColors = [
  { bg: 'bg-cyan-100 dark:bg-cyan-900/20', icon: 'text-cyan-600 dark:text-cyan-400' },      // Step 9
  { bg: 'bg-rose-100 dark:bg-rose-900/20', icon: 'text-rose-600 dark:text-rose-400' },      // Step 10
  { bg: 'bg-emerald-100 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400' }, // Step 11
  { bg: 'bg-amber-100 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400' },  // Step 12
  { bg: 'bg-violet-100 dark:bg-violet-900/20', icon: 'text-violet-600 dark:text-violet-400' }, // Step 13
  { bg: 'bg-teal-100 dark:bg-teal-900/20', icon: 'text-teal-600 dark:text-teal-400' },      // Step 14
];

export const tourSteps: Step[] = [
  // Step 1: Open Generations pane
  {
    target: '[data-tour="generations-pane-tab"]',
    content: 'Click here to open the Generations pane and see your sample generations.',
    title: 'Your Generations',
    disableBeacon: true,
    spotlightClicks: true,
    placement: 'top',
  },
  // Step 2: Show sample generations in pane
  {
    target: '[data-tour="generations-pane"]',
    content: 'These are sample generations we created for you. You can use these as keyframes for your videos, or generate new ones.',
    title: 'Sample Generations',
    placement: 'top',
  },
  // Step 3: Point to the Getting Started shot (already navigated there)
  {
    target: '[data-tour="shot-selector"]',
    content: 'This is your Getting Started shot. Shots organize your keyframes into sequences.',
    title: 'Your First Shot',
    placement: 'bottom',
  },
  // Step 4: Scroll DOWN to timeline and explain it
  {
    target: '[data-tour="timeline"]',
    content: 'The timeline shows your keyframes in sequence. Drag images here to add them, or reorder to change the video flow.',
    title: 'The Timeline',
    placement: 'top',  // Show tooltip above timeline
    // Joyride will auto-scroll to this element
  },
  // Step 5: Scroll UP to video gallery to show outputs
  {
    target: '[data-tour="video-gallery"]',
    content: 'Generated videos appear here. Each video "travels" between your keyframes on the timeline.',
    title: 'Video Outputs',
    placement: 'bottom',  // Show tooltip below the gallery
    // Joyride will auto-scroll back up to this element
  },
  // Step 6: Open Tasks pane
  {
    target: '[data-tour="tasks-pane-tab"]',
    content: 'Click here to see your task queue. All generation tasks appear here with their progress.',
    title: 'Tasks Pane',
    spotlightClicks: true,
    placement: 'left',
  },
  // Step 7: Open Tools pane
  {
    target: '[data-tour="tools-pane-tab"]',
    content: 'Different tools help you create images, videos, and more. Start with Image Generation to create your first keyframe!',
    title: 'Available Tools',
    spotlightClicks: true,
    placement: 'right',
  },
  // Step 8: Final encouraging message (centered modal)
  {
    target: 'body',
    content: "You're all set! Start by generating some images, add them to your timeline, then generate a video to bring them to life. Have fun creating!",
    title: 'Ready to Create!',
    placement: 'center',
  },
];
```

#### 2.3 Create ProductTour Component

**File:** `src/shared/components/ProductTour/index.tsx`

The component uses custom tooltip styling to match WelcomeBonusModal's aesthetic - circular colored icons, same typography, step dots, and retro buttons.

```typescript
import Joyride, { CallBackProps, STATUS, TooltipRenderProps } from 'react-joyride';
import { tourSteps, tourStepColors } from './tourSteps';
import { useProductTour } from '@/shared/hooks/useProductTour';
import { usePanes } from '@/shared/contexts/PanesContext';
import { Button } from '@/shared/components/ui/button';
import { ChevronRight, ChevronLeft, Images, Layout, Film, ListTodo, Wrench, Sparkles, MousePointerClick, PartyPopper } from 'lucide-react';

// Icons for each step (matching the step content)
const stepIcons = [Images, Images, Layout, Film, Film, ListTodo, Wrench, PartyPopper];

// Custom tooltip component matching WelcomeBonusModal aesthetic
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}: TooltipRenderProps) {
  const colors = tourStepColors[index % tourStepColors.length];
  const Icon = stepIcons[index] || Sparkles;
  const totalSteps = size;

  return (
    <div
      {...tooltipProps}
      className="bg-background border border-border rounded-lg shadow-lg p-6 max-w-sm"
    >
      {/* Header with colored icon - matching WelcomeBonusModal */}
      <div className="text-center space-y-4 mb-4">
        <div className={`mx-auto w-12 h-12 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${colors.icon}`} />
        </div>
        {step.title && (
          <h3 className="text-xl font-bold text-center text-foreground">
            {step.title}
          </h3>
        )}
      </div>

      {/* Content */}
      <div className="text-center mb-6">
        <p className="text-muted-foreground">{step.content}</p>
      </div>

      {/* Navigation buttons - matching WelcomeBonusModal button styles */}
      <div className="flex flex-col space-y-2">
        {continuous && (
          <Button
            {...primaryProps}
            variant="retro"
            size="retro-sm"
            className="w-full"
          >
            {isLastStep ? 'Start Creating!' : 'Next'}
            {!isLastStep && <ChevronRight className="w-4 h-4 ml-2" />}
          </Button>
        )}

        <div className="flex justify-between items-center">
          {index > 0 ? (
            <button
              {...backProps}
              className="flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <button
            {...skipProps}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip Tour
          </button>
        </div>
      </div>

      {/* Step indicators - matching WelcomeBonusModal dots */}
      <div className="flex justify-center space-x-2 pt-4 border-t mt-4">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === index ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function ProductTour() {
  const { isRunning, completeTour, skipTour } = useProductTour();
  const { setIsGenerationsPaneOpen, setIsTasksPaneOpen } = usePanes();

  const handleCallback = (data: CallBackProps) => {
    const { status, index, type } = data;

    // Handle step-specific actions (open panes when needed)
    if (type === 'step:before') {
      // Before showing generations pane content, ensure it's visible
      if (index === 1) {
        setIsGenerationsPaneOpen(true);
      }
      // Before showing tasks pane step
      if (index === 5) {
        setIsTasksPaneOpen(true);
      }
    }

    // Handle tour completion/skip
    if (status === STATUS.FINISHED) {
      completeTour();
    } else if (status === STATUS.SKIPPED) {
      skipTour();
    }
  };

  return (
    <Joyride
      steps={tourSteps}
      run={isRunning}
      continuous
      scrollToFirstStep
      showSkipButton
      showProgress
      disableCloseOnEsc={false}
      disableOverlayClose
      spotlightClicks
      callback={handleCallback}
      tooltipComponent={CustomTooltip}
      styles={{
        options: {
          zIndex: 10000,
          arrowColor: 'var(--background)',
        },
        spotlight: {
          borderRadius: 8,
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        },
      }}
      floaterProps={{
        styles: {
          floater: {
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
          },
        },
      }}
    />
  );
}
```

#### 2.4 Add data-tour Attributes to Target Elements

**Files to modify:**

| File | Element | Attribute |
|------|---------|-----------|
| `src/shared/components/PaneControlTabs.tsx` | Generations tab button | `data-tour="generations-pane-tab"` |
| `src/shared/components/PaneControlTabs.tsx` | Tasks tab button | `data-tour="tasks-pane-tab"` |
| `src/shared/components/PaneControlTabs.tsx` | Tools tab button | `data-tour="tools-pane-tab"` |
| `src/shared/components/GenerationsPane/GenerationsPane.tsx` | Main container | `data-tour="generations-pane"` |
| `src/tools/travel-between-images/components/Timeline.tsx` | Timeline container | `data-tour="timeline"` |
| `src/tools/travel-between-images/components/VideoGallery/index.tsx` | Gallery container | `data-tour="video-gallery"` |
| `src/tools/travel-between-images/components/SortableShotItem.tsx` | Shot items (conditional) | `data-tour={isFirst ? "shot-item-0" : undefined}` |

#### 2.5 Integrate into Layout.tsx

```typescript
// In Layout.tsx
import { ProductTour } from '@/shared/components/ProductTour';
import { useProductTour } from '@/shared/hooks/useProductTour';

function Layout() {
  const { showWelcomeModal, closeWelcomeModal } = useWelcomeBonus();
  const { startTour } = useProductTour();

  const handleWelcomeClose = useCallback(() => {
    closeWelcomeModal();
    // Start tour after a brief delay to let modal animate out
    setTimeout(() => startTour(), 500);
  }, [closeWelcomeModal, startTour]);

  return (
    <>
      {/* ... existing layout ... */}
      <WelcomeBonusModal
        isOpen={showWelcomeModal}
        onClose={handleWelcomeClose}
      />
      <ProductTour />
    </>
  );
}
```

---

## Part 3: Database Changes

### 3.1 Track Tour Completion in `onboarding` JSONB

No migration needed - the `onboarding` JSONB column already exists. Will store:

```json
{
  "productTour": {
    "completed": true,
    "skipped": false,
    "completedAt": "2026-01-03T..."
  }
}
```

### 3.2 Track Getting Started Shot Creation

Either:
- Add `getting_started_created: boolean` to user record
- Or check for shot existence each time (simpler, idempotent)

---

## Implementation Order (Master Checklist)

### Phase 1: Sample Assets & Client-Side Creation
- [ ] Create `sample-content` bucket in Supabase (public read access)
- [ ] Upload sample images (2) and video (1) to bucket
- [ ] Add `createSampleGenerationsForNewUser` helper to ProjectContext.tsx
- [ ] Update `createDefaultShot` to accept `isFirstProject` param
- [ ] Update `fetchProjects` to pass `isFirstProject: true` for first project
- [ ] Test: New user signup creates "Getting Started" shot with sample content

### Phase 2: Product Tour Core
- [ ] `npm install react-joyride`
- [ ] Create `useProductTour` hook
- [ ] Create `tourSteps.ts` configuration
- [ ] Create `ProductTour` component
- [ ] Integrate into Layout.tsx

### Phase 3: UI Target Attributes
- [ ] Add `data-tour` to PaneControlTabs (3 tabs)
- [ ] Add `data-tour` to GenerationsPane
- [ ] Add `data-tour` to Timeline
- [ ] Add `data-tour` to VideoGallery
- [ ] Add `data-tour` to first shot item

### Phase 4: Flow Integration
- [ ] Update Layout.tsx `handleWelcomeClose` to navigate to Getting Started shot
- [ ] Start product tour after WelcomeBonusModal closes
- [ ] Ensure panes open at correct tour steps (programmatic control)
- [ ] Test full flow: signup → modal → tour → ready

### Phase 5: Polish
- [ ] Style Joyride tooltips to match app theme (dark mode support)
- [ ] Test on mobile (may need to disable or simplify tour)
- [ ] Add "Restart Tour" option in Settings modal
- [ ] Handle edge case: user closes modal early / skips tour

---

## Files to Create

| Path | Purpose |
|------|---------|
| `src/shared/hooks/useProductTour.ts` | Tour state management |
| `src/shared/components/ProductTour/index.tsx` | Main tour component |
| `src/shared/components/ProductTour/tourSteps.ts` | Step definitions |

## Files to Modify

| Path | Change |
|------|--------|
| `src/shared/contexts/ProjectContext.tsx` | Add sample generation creation for first project |
| `src/app/Layout.tsx` | Add ProductTour, handle tour start + navigation |
| `src/shared/components/PaneControlTabs.tsx` | Add data-tour attributes |
| `src/shared/components/GenerationsPane/GenerationsPane.tsx` | Add data-tour |
| `src/tools/travel-between-images/components/Timeline.tsx` | Add data-tour |
| `src/tools/travel-between-images/components/VideoGallery/index.tsx` | Add data-tour |
| `src/tools/travel-between-images/components/SortableShotItem.tsx` | Add data-tour to first item |

---

## Seamless Transition & Scroll Behavior

### Transition from WelcomeBonusModal

The tour should feel like a **continuation** of the onboarding flow, not a separate experience:

1. **No gap:** Tour starts immediately (500ms delay) after modal close animation completes
2. **Visual continuity:** Custom tooltip uses same aesthetic:
   - Circular colored icon header (continuing the color progression)
   - Same typography (`text-2xl font-bold`, `text-muted-foreground`)
   - Same button styles (`variant="retro"`, `size="retro-sm"`)
   - Same step indicator dots
   - Same back button styling
3. **Step counter continues:** WelcomeBonusModal has 8 steps → tour feels like steps 9-16

### Scroll Behavior

React Joyride handles scrolling automatically via `scrollToFirstStep` and per-step targeting:

1. **Step 4 (Timeline):** Page scrolls DOWN to bring timeline into view
   - Timeline is typically below the fold on VideoTravelToolPage
   - Tooltip appears above the timeline (`placement: 'top'`)

2. **Step 5 (Video Gallery):** Page scrolls BACK UP to show video outputs
   - Video gallery is at the top of the page
   - Tooltip appears below the gallery (`placement: 'bottom'`)

3. **Smooth scrolling:** Joyride uses `scrollIntoView` with smooth behavior by default

### Flow Summary

```
WelcomeBonusModal (8 steps)
├── Step 1: Welcome
├── Step 2: Community
├── Step 3: Generation Method
├── Step 4: Promise/Credits
├── Step 5: Credits Result
├── Step 6: Theme
├── Step 7: Privacy
└── Step 8: "One more thing" → Close

[500ms delay - modal animates out]

Product Tour (8 steps, feels like continuation)
├── Step 9: Click Generations pane tab
├── Step 10: See sample generations
├── Step 11: Your Getting Started shot
├── Step 12: Timeline (scrolls down)
├── Step 13: Video outputs (scrolls up)
├── Step 14: Tasks pane
├── Step 15: Tools pane
└── Step 16: Ready to create!
```

---

## Notes

1. **Mobile:** React Joyride works on mobile but may need adjusted positioning. Consider showing simpler tour or skipping on very small screens.

2. **Sample Assets:** Use high-quality, diverse samples that showcase what the tool can do. Consider using actual AI-generated content.

3. **Idempotency:** The setup function should be safe to call multiple times (check for existing shot before creating).

4. **Future Tours:** The `onboarding` JSONB field can track multiple feature tours as we add new capabilities.

5. **Restart Tour:** Add a "Restart Tour" button in Settings modal that resets the `productTour.completed` state.
