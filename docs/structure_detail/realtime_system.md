# Realtime System

This document describes the current realtime system used to keep the UI in sync with backend changes. The design favors the official Supabase Realtime patterns, immediate React Query invalidation for fast UI updates, and a smart polling fallback that adapts when realtime is degraded.

## Goals
- Simple, reliable realtime updates using standard Supabase patterns
- Immediate UI updates via React Query invalidation
- Smart polling fallback driven by data freshness when realtime is degraded
- Clear separation between transport (Supabase), coordination (provider/manager), and presentation (components)
- Easy debugging and observability

## High-Level Architecture
- SimpleRealtimeManager handles all Supabase channel operations
- SimpleRealtimeProvider bridges realtime events to React and invalidates React Query
- DataFreshnessManager tracks freshness to drive smart polling for queries

```text
Supabase ──▶ SimpleRealtimeManager ──▶ (window) Custom Events
                                │
                                ▼
                     SimpleRealtimeProvider ──▶ React Query (invalidate)
                                │
                                ▼
                      DataFreshnessManager ──▶ Smart polling (fallback)

UI Components ◀──────── React Query cache (data)
```

## Components & Files

- SimpleRealtimeManager
  - Path: `src/shared/realtime/SimpleRealtimeManager.ts`
  - Responsibilities:
    - Creates and manages a single Supabase channel per project: `task-updates:${projectId}`
    - Follows official pattern: `channel.on(...).on(...).subscribe(cb)`
    - Subscribes to:
      - Broadcast: `task-update`
      - Postgres changes: `tasks` table (INSERT/UPDATE) filtered by `project_id`
    - Emits DOM events for React consumption: `realtime:task-update`, `realtime:task-new`
    - Reports events and connection status to `DataFreshnessManager`
    - **Enhanced Features:**
      - Authentication validation using `getSession()` (local/cached) before channel creation
      - Explicit `realtime.setAuth()` call with session token before subscribing
      - Listens for `realtime:auth-heal` events from ReconnectScheduler with proper cleanup
      - Exponential backoff reconnection with attempt limits (max 3 attempts)
      - Comprehensive error handling and debugging
      - Robust connection state management with unconditional timeout clearing

- SimpleRealtimeProvider
  - Path: `src/shared/providers/SimpleRealtimeProvider.tsx`
  - Responsibilities:
    - Manages connection lifecycle based on selected project
    - Listens to custom DOM events and performs React Query invalidation
    - Exposes connection state via `useSimpleRealtime()`
    - Invalidates the following query key families on relevant events:
      - `['tasks']`
      - `['task-status-counts']`
      - `['unified-generations']`
      - `['shots']`
      - `['unpositioned-count']`
      - `['project-video-counts']`

- DataFreshnessManager
  - Path: `src/shared/realtime/DataFreshnessManager.ts`
  - Responsibilities:
    - Tracks last event times per query key family
    - Tracks realtime connection status (connected/disconnected/error)
    - Provides polling intervals and freshness diagnostics
    - Integrated via `useSmartPolling` / `useSmartPollingConfig`

- useSimpleRealtime hook
  - Path: `src/shared/hooks/useSimpleRealtime.ts`
  - Responsibilities:
    - Access connection state in React components
    - Optional: consume last received event metadata for UI feedback

## Event Handling

### Supabase Channel Events (current coverage)
- Broadcast: `task-update`
- Postgres changes: `tasks` (INSERT, UPDATE), filtered by `project_id`

Note: There is no direct subscription to the `generations` table. Generation-related UI stays in sync via task-driven events and React Query invalidation.

### Custom DOM Events
- `realtime:task-update` — fired when task updates are received
- `realtime:task-new` — fired when new tasks are created

### React Query Invalidation (primary mechanism)
On realtime events, the provider invalidates these query key families:
- `['tasks']` — paginated tasks, single task queries, etc.
- `['task-status-counts']` — counts used by task panes and badges
- `['unified-generations']` — all variants (project/shot/paginated)
- `['shots']` — shot lists and shot details influenced by task outcomes
- `['unpositioned-count']` — per-shot generation counts
- `['project-video-counts']` — aggregated video counts by project

React Query invalidation uses prefix matching, so the families above cover concrete keys such as:
- `['tasks', 'paginated', projectId, page, limit, status]`
- `['task-status-counts', projectId]`
- `['unified-generations', 'project', projectId, page, limit, filters]`
- `['unified-generations', 'shot', shotId]`
- `['shots', projectId]`
- `['unpositioned-count', shotId]`
- `['project-video-counts', projectId]`

## Smart Polling Fallback

When realtime is degraded or temporarily unavailable, queries that opt in to smart polling use:
- `useSmartPolling` / `useSmartPollingConfig` (path: `src/shared/hooks/useSmartPolling.ts`)
- Polling intervals are derived from `DataFreshnessManager` and typically behave as:
  - Realtime connected with recent events (<30s): ~30s polling
  - Realtime connected but events aging: ~10–15s polling
  - Realtime disconnected/error: ~5s aggressive polling

This fallback complements (but does not replace) direct invalidation. With a healthy realtime connection, UI updates are immediate due to invalidation; smart polling ensures resilience.

## Usage Examples

### Basic Setup (already configured in `App.tsx`)
```tsx
import { SimpleRealtimeProvider } from '@/shared/providers/SimpleRealtimeProvider';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>
        <SimpleRealtimeProvider>
          {/* Your app components */}
        </SimpleRealtimeProvider>
      </ProjectProvider>
    </QueryClientProvider>
  );
}
```

### Using Connection Status
```tsx
import { useSimpleRealtime } from '@/shared/providers/SimpleRealtimeProvider';

function MyComponent() {
  const { isConnected, isConnecting, error } = useSimpleRealtime();
  
  return (
    <div>
      Status: {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
      {error && <div>Error: {error}</div>}
    </div>
  );
}
```

### Listening to Custom Events
```tsx
useEffect(() => {
  const onUpdate = (event: any) => console.log('Task update event', event.detail);
  const onNew = (event: any) => console.log('New task event', event.detail);
  window.addEventListener('realtime:task-update', onUpdate as EventListener);
  window.addEventListener('realtime:task-new', onNew as EventListener);
  return () => {
    window.removeEventListener('realtime:task-update', onUpdate as EventListener);
    window.removeEventListener('realtime:task-new', onNew as EventListener);
  };
}, []);
```

## Observability & Debugging

### Console Logs (key prefixes)
- `[SimpleRealtime]` — channel join/leave, event delivery, status, auth checks, reconnection attempts
- `[SimpleRealtimeProvider]` — provider lifecycle
- `[TasksPaneRealtimeDebug]` — end-to-end invalidation + query freshness
- `[DataFreshness]` — freshness state, intervals, subscribers
- `[SmartPolling]` — polling updates per query key
- `[ReconnectScheduler]` — reconnection intent management and debouncing

### Runtime Diagnostics
- `window.__REALTIME_SNAPSHOT__` — last channel state and event time
- `window.__DATA_FRESHNESS_MANAGER__` — freshness manager instance (diagnostics available)
- `window.__RECONNECT_SCHEDULER__` — reconnection scheduler state and pending intents

### Enhanced Error Handling
The system now provides detailed debugging information for connection failures:
- Authentication state verification using local session cache (`getSession()`) to avoid network-dependent auth checks
- Explicit `realtime.setAuth()` calls to ensure proper token synchronization before channel subscription
- Post-failure auth checks to identify authentication vs. network issues
- WebSocket readiness state logging
- Reconnection attempt tracking with exponential backoff timing
- Proper event listener cleanup to prevent memory leaks
- Unconditional timeout clearing to prevent zombie retry attempts

### Common Checks
1. **CHANNEL_ERROR issues**: Check authentication state in logs - user must be signed in
2. **Rapid reconnection loops**: Look for reconnection attempt limits being reached (max 3 attempts)
3. **Not receiving updates**: verify channel status logs, project id, and authentication
4. **UI not updating**: ensure invalidated query key families match active queries
5. **Excess polling**: check DataFreshness diagnostics and realtime connection state

## Notes & Limitations
- The system currently subscribes to `tasks` changes only. Generation-related UI updates are primarily driven by task events and by explicit mutation invalidations. Pure generation-only backend changes that are not accompanied by a task event (e.g., background thumbnail writes) are picked up by the smart polling fallback.
- Invalidation uses broad key families to ensure all relevant variants refetch without bespoke wiring per consumer.

Result: **Fast, reliable updates via direct invalidation, with intelligent polling as a resilient fallback.**
