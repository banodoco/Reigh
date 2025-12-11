# Debugging

> **Status:** ✅ Active
>
> **Purpose:** Tools and patterns for investigating task failures, performance issues, and system state.

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
        └── tasks.py      # Multi-task analysis
```

---

## 2. Frontend Debug Logging

Logging is **opt-in** – nothing prints unless you set an env flag.

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

### Logger API (`@/shared/lib/logger.ts`)

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