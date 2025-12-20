# Project Understanding
- Use `structure.md` to understand where to make changes. Sub-docs in `docs/structure_detail/` have implementation specifics.
- Find and use common components in `src/shared/` before creating new ones.
- After each change, ask yourself "Did I unintentionally delete or edit something out of scope?"
- Test comment to verify auto-sync

# Code Quality Review
When reading or modifying code, proactively flag potential issues:
- **Duplication**: Similar logic in multiple places that should be abstracted
- **God components**: Files doing too much (>300 lines is a warning sign)
- **Prop drilling**: Props passed through 3+ levels - consider context or composition
- **Mixed concerns**: UI logic mixed with business logic, or data fetching in presentation components
- **Inconsistent patterns**: Code that doesn't follow established patterns in the codebase
- **Missing error handling**: Async operations without proper error boundaries or catches
- **Stale abstractions**: Utilities/components that exist but aren't used consistently
- **Naming issues**: Unclear or misleading names that don't reflect actual behavior

Mention these as brief observations (e.g., "Note: this file is getting large, might want to split out X") - don't derail the task, just flag for awareness.

# Key Concepts
- **Generations vs Variants**: A `generation` is a standalone image/video in the gallery. A `variant` belongs to a generation (shown in variant selector). Use `based_on` for lineage tracking.
- **Task creation**: Use helpers in `src/shared/lib/tasks/` (e.g., `imageInpaint.ts`, `magicEdit.ts`). Tasks are processed by workers, completed via `complete_task` edge function. See `docs/structure_detail/unified_task_creation.md`.
- **Shots data**: Use `ShotsContext` via `useShots()` hook - single source of truth. For shot images, use `useAllShotGenerations(shotId)`. See `docs/structure_detail/shared_hooks_contexts.md`.
- **React Query**: Invalidate caches after mutations with `queryClient.invalidateQueries({ queryKey: [...] })`.

# Code Patterns
- **Tool structure**: Each tool follows `src/tools/[name]/` with `pages/`, `components/`, `hooks/`, `settings.ts`. See `docs/structure_detail/adding_new_tool.md`.
- **UI components**: Use shadcn-ui from `src/shared/components/ui/`, icons from lucide-react. Never hardcode colors - use theme tokens (`bg-background`, `text-foreground`).
- **Responsive**: TailwindCSS with container queries (`@container`). Test both mobile and desktop.

# Git Workflow
- On push: run `git diff | cat`, update `structure.md` if files were added/deleted/changed purpose, then single command: `git add . && git commit -m "feat/fix: specific message" && git push`

# Supabase & Server-Side Logic
- Prefer server-side (Edge Functions, DB triggers) for: atomic transactions, elevated privileges, sensitive keys, guaranteed execution, or DB-triggered events.
- **Deployments**: See `docs/structure_detail/deployment_and_migration_guide.md`. Deploy edge functions individually: `npx supabase functions deploy function-name --project-ref wczysqzxlwdndgxitrvc`. Use `npx supabase db push --linked` for migrations (NEVER `db reset --linked`).
- SQL queries for Supabase editor: wrap in `SELECT json_agg(results) FROM (...) results;`

# Debugging
- Use unique tags like `[VideoLoadSpeedIssue]` - tell user the tag immediately so they can filter console.
- Log values directly, not nested: `console.log('id:', id)` not `console.log({ id, name })` - values visible without expanding.
- **Debug logs only fire in dev mode**: Production builds automatically strip console.log statements, so debug logging won't impact production performance.
- After finishing a debugging session, consider: "What additional logging, debug utilities, or diagnostic tools would have made this issue easier to identify?" If you spot opportunities, suggest them before closing out the debugging work.

# UI Conventions
- Toast notifications: only for errors, never success toasts for task creation etc.
- NEVER create documentation files (*.md) unless explicitly requested.

# Task Lists
Save in `tasks/` with date-based filename (e.g., `2025-12-06-video-player-tasks.md`).

**Per task:** Header (number, title, status emoji), Area, Description, Observed Behavior (if bug), Requirements (bullets), Impacted Files, Execution Notes, Additional Data Needed, Testing Instructions.

**Master Checklist:** `[ ]`/`[x]` checkboxes grouped by: Quick Wins first, then logical clusters (same files together), with dependency notes.
