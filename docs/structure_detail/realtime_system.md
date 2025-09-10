# Realtime System

This document describes the implemented unified realtime and polling system used to keep the UI instantly in sync with backend changes, while remaining resilient during connectivity issues ("dead mode"). It complements the migration blueprint in `structure_detail/realtime_simplification_plan.md` by documenting the final architecture and how to work with it.

## Goals
- Instant, predictable updates for galleries, tasks, and shots
- Simple, centralized ownership of realtime channels
- Safe fallback when realtime is degraded or offline
- Consistent, canonical React Query keys for cache invalidation
- Clear debugability with minimal performance overhead

## High-Level Architecture
- AuthStateManager centralizes all authentication state changes (eliminates race conditions)
- ReconnectScheduler centralizes all reconnection intents (prevents reconnect races)
- RealtimeProvider owns all Supabase channels and emits events
- InvalidationRouter translates events into React Query invalidations
- Unified Query Keys provide a canonical way to address caches
- Resurrection Polling guarantees freshness when realtime is down

```text
UI ↔ React Query cache ← InvalidationRouter ← RealtimeProvider ← Supabase
                                    ↑                    ↑
                         useResurrectionPolling    AuthStateManager
                              (fallback)               ↓
                                            ReconnectScheduler
                                         (reconnect coordination)
```

## Components & Files

- AuthStateManager
  - Path: `src/integrations/supabase/auth/AuthStateManager.ts` (initialized in `client.ts`)
  - Responsibilities:
    - Single source of truth for all `onAuthStateChange` events
    - Processes core auth logic FIRST (realtime auth sync, healing)
    - Notifies component subscribers in predictable order
    - Eliminates race conditions between multiple auth listeners
    - Components subscribe via: `authManager.subscribe('ComponentName', callback)`

- ReconnectScheduler
  - Path: `src/integrations/supabase/reconnect/ReconnectScheduler.ts` (initialized in `client.ts`)
  - Responsibilities:
    - Centralizes all reconnection intents from multiple sources
    - Coalesces and debounces reconnect requests (1s debounce, 5s minimum interval)
    - Prevents race conditions between AuthManager, console warn interceptor, and other triggers
    - Dispatches single `realtime:auth-heal` event with coalesced metadata
    - Priority-based processing (high > medium > low)

- RealtimeProvider
  - Path: `src/shared/providers/RealtimeProvider.tsx`
  - Responsibilities:
    - Creates a project-scoped Supabase channel: `task-updates:${projectId}`
    - Subscribes to:
      - Broadcast: `task-update`
      - Postgres changes: `tasks` (INSERT/UPDATE), `generations` (INSERT), `shot_generations` (*)
    - Converts payloads into domain events and forwards them to `InvalidationRouter`
    - Exposes minimal connection state via `useRealtime()` for diagnostics

- InvalidationRouter
  - Path: `src/shared/lib/InvalidationRouter.ts`
  - Responsibilities:
    - Accepts domain events and performs targeted, canonical invalidations
    - Coalesces frequent invalidations with a 500ms flush to reduce thrash

- Unified Query Keys
  - Path: `src/shared/lib/queryKeys.ts`
  - Builders:
    - `unifiedGenerationsProjectKey(projectId, page?, limit?, filtersKey?, includeTaskData?)`
    - `unifiedGenerationsShotKey(shotId, page?, limit?, filtersKey?, includeTaskData?)`
  - Use these builders (or the raw array forms they produce) everywhere you query or invalidate unified generations.

- Resurrection Polling
  - Path: `src/shared/hooks/useResurrectionPolling.ts`
  - Responsibilities:
    - Returns a `refetchInterval` that adapts to data staleness and visibility
    - When realtime is disabled or down, guarantees a minimum polling interval
    - Adds jitter and clamps to avoid synchronized bursts and long stalls

- Legacy hook (temporary fallback)
  - Path: `src/shared/hooks/useWebSocket.ts`
  - Notes:
    - The app no longer calls this by default. It remains available behind a kill-switch for safety during rollout.

## Runtime Configuration
- Path: `src/shared/lib/config.ts`
- Flags:
  - `VITE_REALTIME_ENABLED` (default: true)
    - Set to `false` to disable realtime and force polling-only mode.
  - `VITE_LEGACY_LISTENERS_ENABLED` (default: false)
    - Reserved to conditionally enable legacy listeners during debugging.
  - `VITE_DEADMODE_FORCE_POLLING_MS` (optional)
    - Base interval for forced polling when realtime is down. Jitter and visibility clamps apply.

## Event → Invalidation Map (Canonical)

- GENERATION_INSERT / GENERATION_UPDATE / GENERATION_DELETE
  - Payload: `{ projectId, shotId? }`
  - Invalidations:
    - `['unified-generations', 'project', projectId]`
    - If `shotId`: `['unified-generations', 'shot', shotId]` and `['unpositioned-count', shotId]`
    - Also nudges `['shots', projectId]` when relevant to lists

- SHOT_GENERATION_CHANGE (any change in `shot_generations`)
  - Payload: `{ projectId, shotId }`
  - Invalidations:
    - `['unified-generations', 'project', projectId]`
    - `['unified-generations', 'shot', shotId]`
    - `['unpositioned-count', shotId]` (for position changes affecting unpositioned generation count)

- TASK_STATUS_CHANGE (INSERT/UPDATE in `tasks`)
  - Payload: `{ projectId }`
  - Invalidations:
    - `['task-status-counts', projectId]`
    - `['tasks', 'paginated', projectId, 1]`

- GENERATIONS_UPDATED (broadcast convenience)
  - Payload: `{ projectId, shotId? }`
  - Invalidations:
    - `['unified-generations', 'project', projectId]`
    - If `shotId`: `['unified-generations', 'shot', shotId]`

Note: InvalidationRouter batches invalidations within a 500ms window to reduce redundant refetches under bursty updates.

## Polling in Dead Mode
- When realtime is down or disabled, `useResurrectionPolling` guarantees fresh data by:
  - Returning a minimum interval (default 5s in visible, min 15s when hidden)
  - Applying jitter (~±1s) to avoid herding
  - Clamping overly long intervals (ensuring periodic refresh)
- Visibility recovery:
  - On `visibilitychange` → when becoming visible, the app immediately invalidates critical caches and nudges realtime to reconnect.

## Using Unified Keys in New Code

- Querying project-wide unified generations:
```ts
import { unifiedGenerationsProjectKey } from '@/shared/lib/queryKeys';

const key = unifiedGenerationsProjectKey(projectId, page, limit, filtersKey, includeTaskData);
const { data } = useQuery({ queryKey: key, queryFn: fetchUnifiedProjectGenerations });
```

- Invalidating after a mutation:
```ts
queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
if (shotId) {
  queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
}
```

- Do not use legacy keys like `['generations', projectId]` or `['all-shot-generations', shotId]`.

## Realtime Flows

1) Task completion → Gallery refresh
- Postgres `tasks` UPDATE status → RealtimeProvider → TASK_STATUS_CHANGE → invalidate tasks counts + paginated tasks
- If completed, also emit GENERATIONS_UPDATED → invalidate unified project (and shot if available)

2) New generation persisted
- Postgres `generations` INSERT → GENERATION_INSERT → invalidate unified project + shot (if known)

3) Shot association changes
- Postgres `shot_generations` any change → SHOT_GENERATION_CHANGE → invalidate unified project + shot

## Resilience & Backoff
- The provider does not loop aggressively; reconnects are handled by Supabase + visibility nudges
- The legacy hook (if enabled) implements exponential backoff and channel re-subscription
- Polling guarantees liveness when realtime is degraded

## Multi-Tab Considerations
- Each tab owns its own RealtimeProvider and channel
- InvalidationRouter’s batching reduces pressure during bursts
- React Query de-duplicates concurrent fetches at the key level

## Service Worker & Caching
- If a service worker is added in the future, ensure network-first for API routes in dead mode to avoid stale data
- This system expects fresh reads when invalidations occur

## Debugging & Troubleshooting
- Look for logs tagged `[DeadModeInvestigation]` and `[DeadModeRecovery]`
- Look for logs tagged `[AuthManager]` for centralized auth state processing
- `useRealtime()` (from RealtimeProvider) exposes connection state for UI/dev tools
- Visibility changes log diagnostic context and trigger invalidations on focus

Checklist when "Gallery not updating": 
- Confirm invalidations target `['unified-generations', 'project', projectId]` and/or `['unified-generations', 'shot', shotId]`
- Ensure relevant UI queries use unified keys
- Check `VITE_REALTIME_ENABLED` and polling intervals
- Check for auth race conditions: all components should use `authManager.subscribe()` not direct `onAuthStateChange`

## Adding New Event Types
1. Emit a domain event from RealtimeProvider based on broadcast/DB change
2. Map it in `InvalidationRouter` to the minimal set of canonical keys
3. Keep event payloads small: prefer `{ projectId, shotId }`

## References
- AuthManager: `src/integrations/supabase/auth/AuthStateManager.ts` (initialized in `client.ts`)
- ReconnectScheduler: `src/integrations/supabase/reconnect/ReconnectScheduler.ts` (initialized in `client.ts`)
- Provider: `src/shared/providers/RealtimeProvider.tsx`
- Router: `src/shared/lib/InvalidationRouter.ts`
- Keys: `src/shared/lib/queryKeys.ts`
- Polling: `src/shared/hooks/useResurrectionPolling.ts`
- Config: `src/integrations/supabase/config/env.ts`
- Legacy (fallback only): `src/shared/hooks/useWebSocket.ts`
