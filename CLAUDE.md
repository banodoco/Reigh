# Reigh: Working Rules (read first)

## Docs (consult before editing cross-cutting code)
- **Cross-cutting** = spans multiple tools, or touches core tables/storage/auth/billing.
- Start at `structure.md` (links to sub-docs). Deep dives live in `docs/structure_detail/`.
- **Read the relevant sub-doc before editing**:
  - Settings/persistence → `settings_system.md` (+ `data_persistence.md`)
  - Performance → `performance_system.md`
  - Image loading → `image_loading_system.md`
  - Realtime → `realtime_system.md`
  - Task creation → `unified_task_creation.md`
  - Workers/lifecycle → `task_worker_lifecycle.md`
  - DB triggers, RPCs, storage → `db_and_storage.md`
  - Edge Functions → `edge_functions.md`
  - Payments/credits → `auto_topup_system.md`
  - Debugging/logs → `debugging.md` (CLI, `system_logs` table, frontend logging)
- **Multiple docs apply?** Start with most specific (e.g., `image_loading` before `performance`).
- **New feature?** Check `adding_new_tool.md` for tool pattern; `structure.md` for where things live.
- **Debugging a flow?** Trace: UI → hook → task creation (`unified_task_creation.md`) → worker (`task_worker_lifecycle.md`) → `complete_task` edge function.

## Supabase safety (non-negotiable)
- Prefer Edge Functions/DB triggers for atomic/elevated/sensitive/guaranteed work.
- Deploy functions individually: `npx supabase functions deploy <name> --project-ref wczysqzxlwdndgxitrvc`
- Migrations: `npx supabase db push --linked` (**never** `db reset --linked`)
- SQL for editor: wrap results in `SELECT json_agg(results) FROM (...) results;`

## UI conventions
- Toasts: **errors only** (no “success” toasts for task creation).
- Don’t create new `*.md` unless explicitly requested.

## Prefer existing patterns
- Reuse shared components/hooks in `src/shared/` before creating new ones.
- Tools follow `src/tools/[name]/{pages,components,hooks,settings.ts}` (see `adding_new_tool.md`).
- UI: shadcn (`src/shared/components/ui/`), lucide icons, **never hardcode colors** (use `bg-background`, `text-foreground`, etc.). Responsive: Tailwind + `@container`.

## Key concepts / correctness
- Generations vs variants: generations are gallery items; variants are per-generation alternates; use `based_on` for lineage.
- Shots data: use `ShotsContext` via `useShots()`; shot images via `useAllShotGenerations(shotId)`.
- React Query: invalidate after mutations; scope invalidations where possible.

## Review discipline
- After changes: ensure nothing out-of-scope was deleted/edited.
- Flag briefly (don’t derail): duplication, giant components (>300 LOC), prop drilling (3+ levels), mixed concerns, inconsistent patterns, missing error handling.

## Debugging
- **Server-side (tasks/workers)**: Use `system_logs` table (48h retention). Query via:
  - CLI: `cd scripts && python3 debug.py task <task_id>` — shows full timeline + related data
  - SQL: `SELECT * FROM system_logs WHERE task_id = '...' ORDER BY timestamp`
  - Views: `v_recent_errors`, `v_worker_log_activity`
- **Client-side (browser logs)**:
  1. Start dev server: `VITE_PERSIST_LOGS=true npm run dev`
  2. Use app in browser (all console.log/warn/error captured)
  3. Query: `cd scripts && python3 debug.py logs --latest`
  - Filter by tag: `debug.py logs --latest --tag ShotNav`
  - List sessions: `debug.py logs --sessions`
  - Add `VITE_DEBUG_LOGS=true` to also see logs in browser console
- Debug logs are dev-only (production builds strip `console.log`), so temporary instrumentation is OK.
- After debugging, suggest what extra diagnostics/logging would have made it easier.
- See `debugging.md` for full details on CLI, frontend logging, and SQL queries.

## Doc maintenance
- **When to update**: Adding/changing system patterns (triggers, RPCs, storage paths, shared hooks) → update the relevant sub-doc.
- **Which doc?**: Use the routing table above. If none fits: DB patterns → `db_and_storage.md`; other cross-cutting → `structure.md`.
- **Style (rubric)**: Each sub-doc should have:
  1. Header: `> **Purpose**: [1 sentence]` + `> **Source of Truth**: [code paths]`
  2. **Key Invariants**: 3-8 bullets of "break these, things fail"
  3. Tables > prose; point to code instead of copying it
  4. Keep sub-docs under ~150 lines
- **Where**: Sub-docs live in `docs/structure_detail/`. Update `structure.md` only if adding new sub-docs or changing file paths.

## Git workflow (when pushing)
- Before push: review `git diff`, update docs if system patterns changed, then `git add . && git commit -m "feat/fix: ..." && git push`.

## Task lists (when asked)
- Save to `tasks/YYYY-MM-DD-*.md` with per-task sections + a master checklist (quick wins first; group by area/files).
