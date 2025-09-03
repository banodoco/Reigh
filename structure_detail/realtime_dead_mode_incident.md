# Realtime Dead-Mode Incident: Tab Resume Fails to Reconnect

## Summary
- Symptom: After backgrounding the tab and returning, Supabase Realtime remains disconnected indefinitely: connected=false, connectionState=undefined, while a project channel still exists. Polling keeps the UI alive, but realtime never recovers.
- Observed: Repeated auth refresh events (INITIAL_SESSION, SIGNED_IN) fire on resume. Multiple reconnect attempts via supabase.realtime.disconnect()/connect() never flip the socket to connected. Channel subscribe statuses do not fire. No WebSocket open/error/close events are observed.
- Impact: Realtime-driven instant updates stall until full page reload. Polling fallback works but latency increases.

## Timeline & Logs
- On tab resume:
  - [DeadModeInvestigation] Realtime auth sync { event: 'SIGNED_IN' } (multiple)
  - [DeadModeInvestigation] visibilitychange { visibility: 'visible', connected: false }
  - Connect sequence attempts with exponential backoff: 0.5s → 1s → 2s → 4s → 8s → … 30s
  - Each attempt logs: Connect sequence result { nowConnected: false }
  - Snapshots continue to report: connected: false, connectionState: undefined, channelCount: 1
  - No WS lifecycle logs appear (no WS new/open/error/close), indicating realtime WebSocket is not opening at all.

## Root Cause Hypothesis
- Browser backgrounding suspends/kills websocket. On resume, environment blocks new websocket creation or connection establishment for the Supabase realtime endpoint.
- Since no WebSocket lifecycle events are observed (including the explicit probe), the failure happens before or during the socket initiation at the network layer.
- Potential external factors:
  - Service Worker or browser extension interception blocking wss://<project>.supabase.co/realtime/v1/websocket
  - CSP or firewall disallowing websocket on resume
  - OS/Browser network/battery policy that throttles/blocks websocket creation shortly after resume

## What We Implemented (Client)
- Coordinated reconnect with backoff in RealtimeProvider:
  - Public API: supabase.realtime.disconnect() then supabase.realtime.connect()
  - Exponential backoff 0.5s → 30s, single in-flight sequence, detailed logs
  - Only after socket connected: (re)create and join project channel with full handlers
- Visibility + Auth-heal triggers:
  - Start reconnect sequence on visibilitychange: visible and on SIGNED_IN auth event
- Diagnostics:
  - Realtime snapshots with connected, connectionState, channel topics, lastEventAgoSec
  - Channel subscribe status logs
  - WebSocket constructor instrumentation: log WS new/open/error/close globally
  - Realtime probe: direct WebSocket to Supabase realtime endpoint to test reachability
- Polling grace window after visibility to avoid immediate dead-mode boosts while reconnecting

## Why It Still Fails in Your Environment
- No WS new/open/error/close logs appear during attempts, and probe never reports onopen → suggests the browser/session disallows websocket initiation at that moment (transport blocked).
- Because transport never opens, client cannot progress to connected state nor join channels.

## Mitigations & Next Steps
- App-side
  - Continue polling fallback (enabled) to keep UI responsive.
  - Optionally auto-disable realtime after N failed attempts, and auto-refresh after a 45–60s window:
    - Disable realtime: VITE_REALTIME_ENABLED=false (fallback to polling until reload)
    - Offer user-facing banner: “Realtime offline, using polling. Click to refresh.”
- Environment checks
  - Try incognito / a clean profile (no extensions), and another browser (Safari/Firefox) to rule out extensions/SW.
  - Confirm wss://<project>.supabase.co/realtime/v1/websocket is reachable (no corporate firewall / VPN block).
  - Ensure HTTPS origin (avoid mixed-content WS issues).
  - Check for Service Worker intercepts that might disrupt websocket during resume.

## How to Read the New Logs
- Reconnect attempts: Connect sequence attempt/result
- Socket lifecycle: Realtime onOpen/onClose/onError (or Socket conn.onopen/onerror/onclose)
- Global WebSocket: WS new/open/error/close for all sockets
- Probe: Realtime probe onopen/onerror/onclose
- Snapshots: periodic connectivity and channel count/state
- Polling: [DeadModeInvestigation] Polling boosted due to realtime=down

## Files & Code References
- src/shared/providers/RealtimeProvider.tsx
  - startConnectSequence() with backoff and logs
  - ensureRealtimeHealthy() for channel rejoin/recreation
  - realtime snapshots and event-age tracking
- src/integrations/supabase/client.ts
  - Auth sync logs and dispatch of realtime:auth-heal
  - Global WebSocket instrumentation (constructor wrapper)
- src/app/App.tsx
  - visibilitychange logs and foreground recovery markers
  - WS instrumentation (redundant safeguard)
- src/shared/hooks/useResurrectionPolling.ts
  - Dead-mode aware refetchInterval generation, realtime-down boost, visibility grace window
- src/shared/lib/cacheValidationDebugger.ts
  - DeadModeDetector installation, long-task observer, periodic health checks; gated by VITE_ENABLE_DEADMODE_DIAGNOSTICS
- src/shared/lib/InvalidationRouter.ts
  - Routes Postgres/broadcast events to canonical React Query invalidations
- src/shared/hooks/useUnifiedGenerations.ts
  - Uses useResurrectionPollingConfig; main consumer for gallery updates
- src/shared/hooks/useTasks.ts (useCreateTask)
  - 20s client-side timeout safety for create-task mutations; targeted invalidations
- src/shared/lib/taskCreation.ts
  - 20s AbortController timeout around supabase.functions.invoke with detailed logs
- src/shared/lib/invokeWithTimeout.ts
  - Helper to call supabase.functions.invoke with a client-side timeout
- src/shared/lib/config.ts
  - Runtime flags: VITE_REALTIME_ENABLED, VITE_LEGACY_LISTENERS_ENABLED, VITE_DEADMODE_FORCE_POLLING_MS

## Environment Flags
- VITE_REALTIME_ENABLED: disable realtime entirely to rely on polling
- VITE_DEADMODE_FORCE_POLLING_MS: base interval when forcing dead-mode polling
- VITE_LEGACY_LISTENERS_ENABLED: optional legacy listeners (debug only)
- VITE_ENABLE_DEADMODE_DIAGNOSTICS: enable DeadMode diagnostics (cacheValidationDebugger)

## Definition of Done for Realtime Recovery
- On resume:
  - A WebSocket open event appears for the realtime endpoint OR the probe
  - RealtimeProvider logs nowConnected: true
  - Channel subscribe status shows SUBSCRIBED
  - Snapshots report connected: true

If the WS open never appears across attempts, the issue is external to the app (network/policy). In that case: rely on polling + prompt refresh, and investigate environment/network constraints.
