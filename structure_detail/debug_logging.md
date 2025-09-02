# Debug Logging & Performance Profiling

> **Status:** ✅ Active
>
> **Purpose:** Provide high-signal, low-overhead diagnostics to surface performance regressions such as infinite render loops, excessive React-Query invalidations, and long-running cron pollers.

---

## 1. Enabling Logs

### Method 1: Runtime Console Control (Recommended)

**Enable logs instantly from browser console** (works in both dev and production):

```javascript
// Enable debug logs and restore full console output
enableDebugLogs()

// Disable debug logs and suppress console spam
disableDebugLogs() 

// Check current debug state
isDebugEnabled()
```

### Method 2: Environment Variable

Logging can be enabled at build time:

```bash
# One-shot
VITE_DEBUG_LOGS=true npm run dev

# Persist across all dev runs
echo "VITE_DEBUG_LOGS=true" >> .env.local
```

Backend scripts (Express worker, Edge-Function tests) respect the **same** flag:

```bash
VITE_DEBUG_LOGS=true npm run start:api
```

Supported truthy values: `"true"`, `"1"` (string). Anything else disables logs.

---

## 2. Logger API (`@/shared/lib/logger.ts`)

| Helper | Description |
|--------|-------------|
| `log(tag, ...data)` | Standard console.log wrapper. Tag is prefixed with `[PerfDebug:*]` convention. |
| `time(tag, label)` / `timeEnd(tag, label)` | Thin wrappers around `console.time` for duration scopes. |
| `reactProfilerOnRender` | Ready-to-pass callback for React’s `<Profiler>` (`onRender`). |

### Example
```ts
import { log, time, timeEnd } from '@/shared/lib/logger';

time('TaskPoller', 'dbFetch');
const rows = await db.select().from(tasks);
timeEnd('TaskPoller', 'dbFetch');

log('ImageUpload', 'bytes', file.size);
```

---

## 3. React Render Tracing

`useRenderLogger(tag, propsSnapshot?)` (in `@/shared/hooks/useRenderLogger.ts`)

```tsx
function GenerationsPane(props) {
  useRenderLogger('GenerationsPane', { items: props.items.length });
  // ...
}
```

Outputs incrementing render counts so you can instantly see if something is re-rendering hundreds of times per second.

---

## 4. Global Instrumentation

The following hot paths are pre-instrumented:

1. **React Profiler** – wraps the root app, emitting commit times.
2. **Generations / Shots / Tasks panes** – render counters.
3. **Supabase WS invalidation batching** – flush size per 100 ms batch.
4. **Task Pollers** – duration + overlap warnings (`taskProcessingService`).

Feel free to sprinkle extra `useRenderLogger` or `log()` calls during feature work; they’ll be silent unless the flag is on.

---

## 5. Filtering Output

Open DevTools → Console → type `PerfDebug` in the filter box. All structured messages follow:

```
[PerfDebug:Render:GenerationsPane] {count: 3, props: {…}}
[PerfDebug:TaskPoller] pollForCompletedTasks  – 123 ms
[PerfDebug:WebSocketFlush] Flushing 8 invalidations
```

Collapse / group as needed.

---

## 6. Disabling Logs in Production

The build pipeline does **not** inject `VITE_DEBUG_LOGS`; production deployments inherit the empty default and stay silent. Therefore, no extra action is required. 