# Debugging

> **Purpose**: Tools and patterns for investigating task failures, performance issues, and system state.
> **Source of Truth**: `scripts/debug.py` (CLI), `system_logs` table (server logs), `src/shared/lib/logger.ts` (frontend)

---

## When to Use What

| Problem | Tool | Why |
|---------|------|-----|
| Task failed / stuck | `debug.py task <id>` | Shows full timeline from `system_logs` + related data (generation, worker, credits) |
| Recent errors across system | SQL: `SELECT * FROM v_recent_errors` | Aggregated view of last 24h errors |
| Worker issues | SQL: `SELECT * FROM v_worker_log_activity` | Worker status + log counts |
| Frontend performance | `VITE_DEBUG_LOGS=true npm run dev` | Console logging with `[PerfDebug:*]` tags |
| Persist frontend logs | `VITE_PERSIST_LOGS=true npm run dev` | Captures ALL console.log/warn/error to `system_logs` |
| View browser session logs | `debug.py logs --latest` | Shows logs from most recent browser session |
| List browser sessions | `debug.py logs --sessions` | Shows all recent browser sessions with log counts |
| Specific UI issue | Use `log('YourTag', ...)` from `@/shared/lib/logger` | Filter in DevTools or query `system_logs` |

**Note**: `system_logs` has **48h retention** (auto-cleaned). For older issues, check `tasks.error_message` directly.

### What writes to `system_logs`

| Source | `source_type` | What's logged |
|--------|---------------|---------------|
| Edge Functions | `edge_function` | `create-task`, `claim-next-task`, `update-task-status`, `complete_task`, `calculate-task-cost` |
| Workers (GPU) | `worker` | Task processing steps, errors, via heartbeat |
| Orchestrators | `orchestrator_gpu/api` | Cycle tracking, segment coordination |
| Browser (with flag) | `browser` | **ALL** console.log/warn/error when `VITE_PERSIST_LOGS=true`. Query with `debug.py logs --latest` |

Edge Functions use `SystemLogger` class (`supabase/functions/_shared/systemLogger.ts`) — always call `await logger.flush()` before returning.

---

## 1. Task Debugging CLI (`scripts/debug.py`)

A Python CLI for investigating tasks and system state. Queries the database and `system_logs` table.

### Setup

Requires Python 3 and a `.env` file with:
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Commands

#### Investigate a specific task

```bash
cd scripts && python3 debug.py task <task_id>
```

**Output includes:**
- **Overview**: Status, type, project, worker details (including GPU type/memory if available)
- **Timing**: Queue time, processing time, total duration
- **Error**: Prominently displayed for failed tasks with full error message
- **Relationships**: Parent orchestrator (for segments), child tasks (for orchestrators), run siblings, dependencies
- **Generation**: Output generation with variants, shot associations, parent/child info
- **Credits**: Credit ledger entries for this task
- **Event Timeline**: Logs from `system_logs` table with timestamps
- **Parameters**: Important params first (prompt, shot_id, segment_index, etc.)

**Example:**
```bash
python3 debug.py task 6364c9fb-1bb0-4302-82a6-79ae463d4b76

================================================================================
📋 TASK: 6364c9fb-1bb0-4302-82a6-79ae463d4b76
================================================================================

🏷️  Overview
   Status: Complete
   Type: travel_segment
   Project: 68afeef9-6347-499a-a279-e52db84b5f54
   Worker: gpu-20251211_165953-6d669ac5
   Worker Status: active

⏱️  Timing
   Created: 2025-12-11T18:13:43.933+00:00
   Started: 2025-12-11T18:18:50.686205+00:00 (queue: 306.8s)
   Processed: 2025-12-11T18:24:30.294+00:00 (processing: 339.6s)
   Total: 646.4s

🔗 Relationships
   Parent Orchestrator: b4126702-cfb3-461d-a...
      Status: Complete | Type: travel_orchestrator

🖼️  Generation
   ID: 90bdf88b-d023-44b9-b5d1-7cb10a820756
   Type: video
   Parent: 5c137663-5fd4-4876-9cfc-63f7d4005565 (child_order: 6)
   Is Child: Yes
   Variants: 1
      ★ original: a496992c-c94...

📜 Event Timeline (from system_logs)
   Found 17 log entries
   [18:13:43] 🔍 [DEBUG] [create-task] Authenticated via service-role key
   [18:18:50] ℹ️ [INFO] [claim-next-task] Task claimed successfully
   ...
```

#### List recent tasks

```bash
python3 debug.py tasks [options]
```

| Option | Description |
|--------|-------------|
| `--limit N` | Number of tasks (default: 50) |
| `--status STATUS` | Filter by status: `Failed`, `Complete`, `Queued`, `In Progress` |
| `--type TYPE` | Filter by task type (e.g., `travel_segment`) |
| `--hours N` | Filter by time window |
| `--json` | Output as JSON |

**Example:**
```bash
python3 debug.py tasks --limit 10

================================================================================
📊 RECENT TASKS ANALYSIS
================================================================================

📈 Overview
   Total tasks: 10
   Time range: 2025-12-11T18:06:04 to 2025-12-11T18:13:43

📊 Status Distribution
   Complete: 10 (100.0%)

🔧 Task Types
   travel_segment: 7 (70.0%)
   individual_travel_segment: 2 (20.0%)
   join_clips_segment: 1 (10.0%)

🖥️  Workers (4 active)
   gpu-20251211_165953-6d669ac5...: 3 tasks
   gpu-20251211_172903-3c6bf074...: 3 tasks

⏱️  Timing Analysis
   Avg Queue Time: 156.1s
   Avg Processing Time: 220.1s
   Tasks with timing: 10

❌ Recent Errors (if any failed tasks)
   abc123... (travel_segment)
      → CUDA out of memory...
```

#### View system logs

```bash
python3 debug.py logs [options]
```

| Option | Description |
|--------|-------------|
| `--latest` | Logs from most recent browser session |
| `--sessions` | List recent browser sessions |
| `--tag TAG` | Filter by tag (e.g., `ShotNav`, `TaskPoller`, `console`) |
| `--source TYPE` | Filter by source: `browser`, `worker`, `edge_function`, `orchestrator_gpu` |
| `--session ID` | Logs from a specific session ID |
| `--level LEVEL` | Filter by level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `--hours N` | Filter by time window |
| `--limit N` | Max logs (default: 5000, use `--limit 0` for unlimited) |
| `--json` | Output as JSON |

**Example:**
```bash
# View most recent browser session
python3 debug.py logs --latest

# Filter by tag
python3 debug.py logs --latest --tag ShotNav
python3 debug.py logs --latest --tag TaskPoller --level ERROR

# List all browser sessions
python3 debug.py logs --sessions

# Browser errors from last 2 hours
python3 debug.py logs --source browser --level ERROR --hours 2
```

### Architecture

```
scripts/
├── debug.py              # CLI entry point
└── debug/
    ├── client.py         # Supabase client wrapper
    ├── formatters.py     # Output formatting
    ├── models.py         # Data models
    └── commands/
        ├── task.py       # Single task investigation
        ├── tasks.py      # Multi-task analysis
        └── logs.py       # System log viewing
```

---

## 2. Frontend Debug Logging

Logging is **opt-in** – nothing prints unless you set an env flag.

```bash
# Console logging only
VITE_DEBUG_LOGS=true npm run dev

# Console + persist to system_logs table
VITE_PERSIST_LOGS=true VITE_DEBUG_LOGS=true npm run dev

# Persist across all dev runs
echo "VITE_DEBUG_LOGS=true" >> .env.local
echo "VITE_PERSIST_LOGS=true" >> .env.local
```

When `VITE_PERSIST_LOGS=true`, logs are buffered and sent to `system_logs` every 10s (or when buffer hits 50 entries). Query with:
```sql
SELECT * FROM system_logs WHERE source_type = 'browser' ORDER BY timestamp DESC;
```

Supported truthy values: `"true"`, `"1"` (string). Anything else disables logs.

### Logger API (`@/shared/lib/logger.ts`)

| Helper | Description |
|--------|-------------|
| `log(tag, ...data)` | Console.log + optional persistence. Use tags like `[TaskPoller]`. |
| `logWarn(tag, ...data)` | Console.warn + persistence with level `WARNING`. |
| `logError(tag, ...data)` | Console.error + persistence. **Always logs, even without flag.** |
| `time(tag, label)` / `timeEnd(tag, label)` | Thin wrappers around `console.time` for duration scopes. |
| `forceFlush()` | Immediately flush buffered logs to `system_logs`. |
| `reactProfilerOnRender` | Ready-to-pass callback for React’s `<Profiler>` (`onRender`). |

### Example
```ts
import { log, logError, time, timeEnd, forceFlush } from '@/shared/lib/logger';

time('TaskPoller', 'dbFetch');
const rows = await db.select().from(tasks);
timeEnd('TaskPoller', 'dbFetch');

log('ImageUpload', 'bytes', file.size);
logError('ImageUpload', 'Failed', error.message); // Always logs + persists
await forceFlush(); // Ensure logs sent before navigating
```

### React Render Tracing

`useRenderLogger(tag, propsSnapshot?)` (in `@/shared/hooks/useRenderLogger.ts`)

```tsx
function GenerationsPane(props) {
  useRenderLogger('GenerationsPane', { items: props.items.length });
  // ...
}
```

Outputs incrementing render counts so you can instantly see if something is re-rendering hundreds of times per second.

### Global Instrumentation

The following hot paths are pre-instrumented:

1. **React Profiler** – wraps the root app, emitting commit times.
2. **Generations / Shots / Tasks panes** – render counters.
3. **Supabase WS invalidation batching** – flush size per 100 ms batch.
4. **Task Pollers** – duration + overlap warnings (`taskProcessingService`).

Feel free to sprinkle extra `useRenderLogger` or `log()` calls during feature work; they’ll be silent unless the flag is on.

### Filtering Output

Open DevTools → Console → type `PerfDebug` in the filter box. All structured messages follow:

```
[PerfDebug:Render:GenerationsPane] {count: 3, props: {…}}
[PerfDebug:TaskPoller] pollForCompletedTasks  – 123 ms
[PerfDebug:WebSocketFlush] Flushing 8 invalidations
```

Collapse / group as needed.

### Disabling Logs in Production

The build pipeline does **not** inject `VITE_DEBUG_LOGS`; production deployments inherit the empty default and stay silent. Therefore, no extra action is required.

---

## 3. Console Debug Tags

When debugging specific issues, use **unique tags** so you (and the user) can filter the console:

```typescript
// Tell the user the tag immediately so they can filter
console.log('[VideoLoadSpeedIssue] Starting investigation...');
console.log('[VideoLoadSpeedIssue] loadTime:', loadTime, 'ms');
```

**Best practices:**
- Use `[TagName]` prefix format
- Log values directly, not nested: `console.log('id:', id)` not `console.log({ id })`
- Values are visible without expanding in DevTools

---

## 4. Database Debugging

### Query system_logs

The `system_logs` table stores structured logs from edge functions and workers:

```sql
-- Recent logs for a task
SELECT created_at, level, source, message 
FROM system_logs 
WHERE task_id = 'your-task-id'
ORDER BY created_at;

-- Recent errors
SELECT * FROM system_logs 
WHERE level = 'ERROR' 
ORDER BY created_at DESC 
LIMIT 20;
```

### Check task state

```sql
-- Full task details
SELECT * FROM tasks WHERE id = 'task-id';

-- Task with generation
SELECT t.*, g.location, g.type
FROM tasks t
LEFT JOIN generations g ON g.tasks ? t.id::text
WHERE t.id = 'task-id';
```

---

<div align="center">

**🔗 Related**

[Task Worker Lifecycle](./task_worker_lifecycle.md) • [Edge Functions](./edge_functions.md)

</div>