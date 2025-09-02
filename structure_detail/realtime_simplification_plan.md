## Realtime and Polling Simplification Plan

### Goals
- Reduce complexity and crossed wires between realtime, polling, and invalidation.
- Guarantee freshness with deterministic fallbacks; treat realtime as an accelerator, not a correctness dependency.
- Centralize ownership and visibility of connection state, channel lifecycle, and cache invalidation.

### Symptoms Observed
- Realtime socket stuck disconnected; repeated reconnect attempts without successful channel re-subscription.
- “Boosted polling” logs but still user-visible stalls until manual refresh.
- Multiple query key families (`generations`, `unified-generations`, `all-shot-generations`, `shots`) invalidated from several places.
- Visibility change and debug recovery paths both nudging caches, creating overlap.

### Design Principles
- Single source of truth per domain: Gallery uses only `unified-generations` keys (project and shot scopes).
- Realtime as hint only: Never gate freshness on realtime. Polling provides liveness guarantees.
- One place to own channels and invalidation mapping.
- Predictable intervals: when realtime is down, always poll at a bounded cadence.
- Minimal state machines: avoid per-page channel setup/teardown and duplicated listeners.

### Target Architecture
1. RealtimeProvider (App-level)
   - Owns a single project-scoped channel per active `projectId`.
   - Exposes connection state, channel state, last activity timestamps via context.
   - Handles subscribe/re-subscribe with backoff; no page-level channel creation.

2. InvalidationRouter (single module)
   - Maps server events → React Query keys. Canonical map only.
   - Keys to support: `['unified-generations','project',projectId]`, `['unified-generations','shot',shotId]`, `['shots',projectId]`, `['task-status-counts',projectId]`, and minimal `['tasks','paginated',projectId,1]`.
   - Remove invalidations of legacy/non-canonical keys from scattered code.

3. Polling Policy (deterministic)
   - When realtime connected: use computed intervals (fast when recent activity; else off/slow).
   - When realtime down: never return false; forced min (5–10s visible, 15–30s hidden) with small jitter ±1s.
   - On window focus: one-time “kick” refetch for critical queries (unified generations + tasks counts).

4. Event Model Simplification
   - Prefer Postgres Changes on `generations`/`shot_generations` as primary source.
   - Optional: single broadcast type `GENERATIONS_UPDATED` with `{ projectId, shotId?, generationIds? }` to coalesce.
   - No per-tool bespoke event types; centralize.

5. Local Optimism for UX
   - When client enqueues a task, immediately write an optimistic placeholder to `unified-generations` (project scope), then let server correct via polling/realtime. This removes dependence on realtime for “instant” feel.

6. Kill Switch & Recovery
   - Env/flag to disable realtime entirely (force polling policy) for incident mitigation.
   - One “recover now” action that flushes InvalidationRouter keys and re-creates the single channel.

7. Observability
   - Centralized logs with a single tag `[RealtimeCore]` and `[InvalidationRouter]` (data-reduced in prod).
   - Lightweight metrics: last socket state change, last successful event, avg refetch latency after event.

### Migration Plan
Phase 0: Guardrails (1–2 hours)
- Add kill-switch for realtime to configuration.
- Ensure polling policy respects visibility and applies jitter when realtime is down.

Actions:
- Create `src/shared/lib/config.ts` with `REALTIME_ENABLED`, `LEGACY_LISTENERS_ENABLED`, `DEADMODE_FORCE_POLLING_MS` (read from env; default TRUE/FALSE/undefined).
- In `src/shared/hooks/useResurrectionPolling.ts`:
  - Enforce: if realtime is down OR `!REALTIME_ENABLED` then never return `false`; visible 5–10s ±1s, hidden 15–30s ±1s, clamp ≤15s visible.
  - Add a small `getJitter(ms, ±range)` helper and apply it.
- In `src/shared/hooks/useWebSocket.ts`:
  - Early-return no-op if `!REALTIME_ENABLED`.
- Add minimal counters/logs (gated by `NODE_ENV`) for: last realtime state, last event ts.

Search & update:
- Find config usages to consolidate: `rg "REALTIME_ENABLED|LEGACY_LISTENERS_ENABLED" src | cat` (expect none; add new refs).

Verify:
- Toggle `REALTIME_ENABLED=false`: gallery stays fresh via polling; CPU OK in hidden tab.
- Toggle `DEADMODE_FORCE_POLLING_MS=5000` (optional override): confirm cadence.

Phase 1: Centralize (0.5–1 day)
- Introduce `RealtimeProvider` at app root; move channel setup there.
- Expose `useRealtime()` hook (connectionState, isConnected, subscribe helpers).

Actions:
- Create `src/shared/providers/RealtimeProvider.tsx`:
  - Own a single supabase channel per `projectId`; implement exponential backoff and re-subscription.
  - Emit connection/channel state via context; expose `useRealtime()`.
- In `src/app/App.tsx`: wrap app with `RealtimeProvider`.
- In `src/shared/hooks/useWebSocket.ts`: remove channel creation; consume `useRealtime()` for connection state; keep only invalidation batching (to be migrated to Router in Phase 3).

Search & update:
- Identify any page-level channel creation to migrate: `rg "\.channel\(" src | cat`.

Verify:
- Logs show one channel topic per active project; switching projects recreates exactly one channel; no page-level subscriptions.

Phase 2: Canonical Keys (0.5–1 day)
- Audit and standardize gallery onto `useUnifiedGenerations` only.
- Remove/replace scattered invalidations with `InvalidationRouter.invalidate(event)` calls.

Actions:
- Ensure all gallery surfaces use unified keys:
  - Keep: `src/shared/hooks/useUnifiedGenerations.ts`, `tools/travel-between-images/components/VideoGallery/index.tsx`.
  - Migrate any remaining uses of `useGenerations` or `all-shot-generations` to unified.
- Create `src/shared/lib/queryKeys.ts` with wrappers for unified keys to avoid array literal drift.

Search & update:
- `rg "\['generations'|all-shot-generations" src | cat` → replace with unified usage or route via Router (Phase 3).

Verify:
- Gallery renders unchanged; cache keys consistently include `['unified-generations', ('project'|'shot'), ...]`.

Phase 3: Event Map (0.5 day)
- Implement `InvalidationRouter` map:
  - generation INSERT/UPDATE → unified (project), unified (shot if available), shots
  - shot_generations any change → unified (project), unified (shot)
  - task status changes → task counts + first page

Actions:
- Create `src/shared/lib/InvalidationRouter.ts`:
  - Export `routeEvent(event: { type: string; payload: any })` that computes keys using `queryKeys.ts` and calls `queryClient.invalidateQueries` with batching/backpressure (≥500ms per key family).
- In `RealtimeProvider` Postgres changes + broadcast handlers: call `routeEvent` instead of direct invalidations.
- Remove direct invalidations from `useWebSocket.ts` once Router is in place.

Search & update:
- `rg "invalidateQueries\(\{ queryKey: \['generations" src | cat` → replace via Router.
- `rg "invalidateQueries\(\{ queryKey: \['all-shot-generations" src | cat` → replace via Router.

Verify:
- Trigger generation insert/update/delete; confirm only Router logs fire and correct unified keys are invalidated.

Phase 4: Optional Broadcast Coalesce (0.5 day)
- Emit `GENERATIONS_UPDATED` broadcast from server paths that create media; route through the same map.

Actions (optional; can defer):
- In relevant server/Edge Functions (Supabase functions under `supabase/functions/**`), after successful generation creation: emit broadcast `{ type: 'GENERATIONS_UPDATED', payload: { projectId, shotId?, generationIds? } }`.
- In `RealtimeProvider`, hook broadcast handler to call Router with the same event shape.

Verify:
- With realtime up, gallery updates near-instantly without waiting for Postgres change.

Phase 5: Optimistic UX (0.5 day)
- On task enqueue, optimistic insert into unified project cache with minimal metadata and pending state.

Actions:
- In enqueue/creation path (`src/shared/lib/generationTaskBridge.ts` and any tool page submit handlers):
  - `queryClient.setQueryData(['unified-generations','project',projectId,...], insertPendingPlaceholder)`.
  - Reconcile on first fetch: drop placeholder if real record present; ensure id-based dedupe.

Verify:
- Immediately after enqueue, a pending tile appears; it transitions to real media once created.

Phase 6: Cleanup (0.5 day)
- Remove legacy listeners invalidations and duplicate channel setups from pages/hooks.
- Reduce debug noise; keep only core counters + last states.

Actions:
- Gate/strip page-level channel creation (search results from Phase 1) and scattered invalidations (Phase 3 searches).
- Replace legacy key invalidations with Router calls; delete dead code behind `LEGACY_LISTENERS_ENABLED` once stable.
- Trim debug logs to `[RealtimeCore]` and `[InvalidationRouter]` in prod.

Search & update:
- `rg "\[DeadModeInvestigation\]|\[GalleryPollingDebug\]" src | cat` → reduce noisy logs behind `NODE_ENV`.

Verify:
- With flags default (REALTIME_ENABLED=ON, LEGACY_LISTENERS_ENABLED=OFF), parity tests pass and logs are concise.

### Risks & Mitigations
- More polling cost during outages → clamp intervals by visibility, apply jitter, and use kill-switch.
- Single provider becomes a choke point → keep logic small, well-tested; expose read-only state.
- Optimistic items drift → auto-reconcile by ID after first successful fetch.

### Rollback
- Flip kill-switch to disable realtime; rely on deterministic polling.
- Revert to prior per-page listeners behind a feature flag if needed.

### Success Metrics
- Time-to-visibility for a completed generation: P50 ≤ 2s with realtime; P95 ≤ 7s via polling.
- No stalls > 30s without manual refresh when realtime is down.
- Reduction of invalidation codepaths by ≥ 50%.

### Immediate Triage Checks (No-Code)
- Confirm only one Supabase client instance is created.
- Verify Realtime URL/key and that the project’s Realtime replication is enabled.
- Inspect `getChannels()`: ensure a single project-topic channel; if “joining” forever, the provider will recreate it.
- If still failing, run with realtime kill-switch ON to validate polling-only UX (isolation test).

### One-Shot Rollout Plan (Single Release)
1. Freeze legacy listeners
   - Keep legacy page-level listeners but gate them behind a feature flag (default OFF) to allow quick fallback without code revert.
2. Introduce RealtimeProvider + InvalidationRouter
   - Wire provider at app root and route all Postgres changes + broadcast events through the router.
3. Canonicalize gallery data source
   - Migrate all gallery views (images/videos, project/shot) to `useUnifiedGenerations` keys only.
4. Enable deterministic dead-mode polling
   - Force min polling when realtime is down (visible 5–10s, hidden 15–30s) with ±1s jitter.
5. Kill-switch & flags
   - `REALTIME_ENABLED` (default ON), `LEGACY_LISTENERS_ENABLED` (default OFF), `DEADMODE_FORCE_POLLING_MS` (optional override).
6. Deploy together; observe metrics; keep rollback plan ready (flip flags, no redeploy required).

#### Where (files/dirs) & how
- Provider wiring (new): `src/shared/providers/RealtimeProvider.tsx` (App root compose in `src/app/App.tsx`)
- Central router (new): `src/shared/lib/InvalidationRouter.ts`
- Unified keys (existing): `src/shared/hooks/useUnifiedGenerations.ts` (use `getUnifiedGenerationsCacheKey`)
- Polling policy (existing): `src/shared/hooks/useResurrectionPolling.ts`
- Websocket ownership (existing): `src/shared/hooks/useWebSocket.ts` (migrate channel creation into Provider)
- SW/cache behavior: `public/sw.js` and any fetch wrappers in `src/shared/lib/*`
- Flags: central config `src/shared/lib/config.ts` (env read), referenced in Provider/Router

### Canonical Invalidation Map (Authoritative)
- generations INSERT/UPDATE/DELETE
  - Invalidate: `['unified-generations','project',projectId]`
  - If `shotId` resolvable: also `['unified-generations','shot',shotId]`
  - If affects association count: `['shots',projectId]`
- shot_generations INSERT/UPDATE/DELETE
  - Invalidate: `['unified-generations','project',projectId]`
  - Also `['unified-generations','shot',shotId]` when available
- tasks status transitions
  - Invalidate: `['task-status-counts',projectId]`, `['tasks','paginated',projectId,1]`
- visibility recover (focus)
  - One-time nudge: `['unified-generations','project',projectId]`, `['task-status-counts',projectId]`

Note: Deprecate invalidations of `['generations', ...]` and `['all-shot-generations', ...]` in UI code. Keep server code compatible temporarily.

#### Key builder & contract
- Always build keys through a single utility:
  - Use existing `getUnifiedGenerationsCacheKey(options)` in `src/shared/hooks/useUnifiedGenerations.ts`.
  - Expose a tiny wrapper in `src/shared/lib/queryKeys.ts` to keep import sites consistent.
- All invalidations must call the builder (no array literals) to avoid drift.

### Parity Test Matrix (Pre- and Post-Deploy)
- New task → completes → new video visible in VideoOutputsGallery (shot)
  - Expect: ≤2s via realtime; ≤7s via polling during dead mode
- Delete generation → disappears from gallery
- Star/unstar generation → star state updates in gallery
- Move/associate generation to a shot → appears in that shot’s gallery
- Create new shot with outputs → counts update; gallery shows items
- Background → Foreground (visibility recover) → data up-to-date without manual refresh
- Multi-tab: two tabs running; no storming, both stay fresh

Additional: 
- Delete + undo (if available) maintains cache correctness
- Shot reordering updates (position changes) are reflected without duplicate/missing entries

### Supabase Configuration Checklist
- Realtime enabled for `public.generations` and `public.shot_generations`
- WAL level supports row-level replication for these tables
- RLS policies allow realtime payloads for the authenticated role used in the client
- JWT refresh path verified; auth token attached to realtime socket

Auth/Client invariants
- Enforce singleton Supabase client: `src/integrations/supabase/client.ts` must be the only exported instance; assert once at app boot.
- On reconnect, ensure JWT refresh occurs before (re)subscribe; otherwise the channel may remain in `joining`.

### Service Worker / Caching
- Ensure gallery/data requests use `cache: 'no-store'` or equivalent while dead mode is active
- Consider versioned API paths or `Cache-Control: no-store` headers for JSON endpoints

### Multi-Tab Coordination
- Add ±1s jitter to dead-mode polling intervals
- Optional: BroadcastChannel/localStorage leader election to let one tab poll fast, others slow

### Dead-Mode Polling Spec (exact)
- Visible: min 5000–10000 ms, add jitter ±1000 ms
- Hidden: min 15000–30000 ms, add jitter ±1000 ms
- If realtime is down, never return `false` from refetchInterval. Clamp any higher decision to ≤15000 ms while visible.
- Where: implement in `useResurrectionPolling.ts` (already partially in place).

### Invalidation Backpressure Spec
- Group invalidations per "key family" and flush no more than once every ≥500 ms under churn.
- Where: `useWebSocket.ts` batching (see `BATCH_FLUSH_DELAY`) or move into `InvalidationRouter`.

### Observability & Alerts
- Counters
  - Last realtime state, last event timestamp, event→fetch latency P50/P95
  - Poll cadence while realtime down
- Logs
  - `[RealtimeCore]` transitions; `[InvalidationRouter]` event→key map hit
  - Sampled in prod to reduce noise
- Alerts
  - Realtime disconnected > 60s (visible tab) AND poll cadence > 10s

### Performance/Battery Considerations
- Visible: target 5–10s min polling in dead mode; Hidden: 15–30s
- Clamp during high CPU (long tasks) and avoid heavy debug instrumentation in prod

### Definition of Done
- All gallery views read from unified keys only
- Legacy listeners flag default OFF; kill-switch default ON (realtime enabled)
- Parity test matrix passes in staging and production
- Metrics dashboards show acceptable event→visibility latencies

### Cleanup Checklist (what to remove or gate)
- Page-level websocket/channel setup outside the Provider
  - Search in `src/tools/**` and `src/shared/components/**`.
- Scattered invalidations not going through the Router
  - `src/app/App.tsx` visibility handler
  - `src/shared/lib/cacheValidationDebugger.ts` emergency paths
  - `src/shared/hooks/useShots.ts` invalidations of legacy keys
  - `src/tools/image-generation/pages/ImageGenerationToolPage.tsx` invalidations of legacy keys
- Legacy key usage in gallery surfaces
  - Replace `['generations', ...]` and `['all-shot-generations', ...]` with unified keys
- Excess debug logs in prod
  - Reduce to `[RealtimeCore]` and `[InvalidationRouter]`, gated by `NODE_ENV`

### Files Touched Index (guide per subtask)
- Provider: `src/shared/providers/RealtimeProvider.tsx` (new), `src/app/App.tsx`
- Router: `src/shared/lib/InvalidationRouter.ts` (new)
- Polling: `src/shared/hooks/useResurrectionPolling.ts`
- Websocket: `src/shared/hooks/useWebSocket.ts` (channel ownership shifts to Provider)
- Gallery data: `src/shared/hooks/useUnifiedGenerations.ts`, `src/tools/travel-between-images/components/VideoGallery/index.tsx`
- Legacy cleanup: `src/shared/hooks/useShots.ts`, `src/tools/image-generation/pages/ImageGenerationToolPage.tsx`, `src/app/App.tsx`, `src/shared/lib/cacheValidationDebugger.ts`
- Query keys helper: `src/shared/lib/queryKeys.ts` (new, optional)
- Supabase client singleton: `src/integrations/supabase/client.ts`
- Service worker/cache: `public/sw.js`


