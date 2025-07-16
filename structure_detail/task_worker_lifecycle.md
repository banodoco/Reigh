# Task & Worker Lifecycle

## Overview

Reigh uses an async task queue pattern for all AI generation workloads. This decouples the UI from long-running operations and enables distributed processing.

## Flow Diagram

```
┌─────────┐     ┌──────────────┐     ┌─────────┐     ┌────────────┐
│ Client  │────▶│ create_task  │────▶│   DB    │◀────│   Worker   │
│   UI    │     │ Edge Function│     │ (tasks) │     │  (Express) │
└─────────┘     └──────────────┘     └─────────┘     └────────────┘
     ▲                                      │                 │
     │                                      │                 │
     │          ┌──────────────┐           │                 │
     └──────────│   Realtime   │◀──────────┴─────────────────┘
                │  Broadcast   │         (status updates)
                └──────────────┘
```

## Detailed Steps

### 1. Task Creation
- Client calls `/supabase/functions/create_task` with:
  - `tool_id` (e.g., 'image-generation')
  - `input` (tool-specific parameters)
  - `cost` (pre-calculated credits)
- Edge Function validates user has sufficient credits
- Inserts row into `tasks` table with `status = 'Queued'`
- Returns task ID to client

### 2. Worker Polling
- Express worker (`src/server/services/taskProcessingService.ts`) polls every 3 seconds
- Calls `claim_next_task` Edge Function which:
  - Finds oldest `Queued` task
  - Updates to `In Progress` with `worker_id`
  - Returns task details
- Worker processes based on `tool_id`:
  - Image generation → FAL API
  - Video processing → FFmpeg
  - Prompt enhancement → OpenAI

### 3. Task Completion
- Worker calls `complete_task` Edge Function with:
  - Task ID
  - Output data (URLs, metadata)
  - Error info (if failed)
- Edge Function:
  - Updates task status to `Complete` or `Failed`
  - Creates `generations` records if successful
  - Deducts credits from user's balance

### 4. Real-time Updates
- All task table changes broadcast via Supabase Realtime
- Client subscribes using `useWebSocket` hook
- UI updates automatically as task progresses

## Key Files

- **Edge Functions** (`/supabase/functions/`)
  - `create_task/index.ts` - Task creation & validation
  - `claim_next_task/index.ts` - Worker task assignment
  - `complete_task/index.ts` - Task completion handling
  - `calculate-task-cost/index.ts` - Credit cost calculation

- **Worker** (`/src/server/`)
  - `services/taskProcessingService.ts` - Main polling loop
  - `services/webSocketService.ts` - Realtime broadcast setup

- **Client Hooks** (`/src/shared/hooks/`)
  - `useTasks.ts` - Task creation & monitoring
  - `useWebSocket.ts` - Realtime subscription

## Running a Local Worker

```bash
# Ensure Supabase is running
supabase status

# Start the worker (included in npm run dev)
npm run dev:server

# Or run standalone
node --loader ts-node/esm src/server/index.ts
```

## Debugging Tips

1. **Monitor task queue**:
   ```sql
   -- In Supabase SQL editor
   SELECT id, tool_id, status, created_at 
   FROM tasks 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

2. **Check worker logs**:
   - Look for `[Task Poller]` prefixed messages
   - Failed claims show as "No tasks to claim"

3. **Test Edge Functions locally**:
   ```bash
   supabase functions serve create_task
   # In another terminal
   curl -X POST http://localhost:54321/functions/v1/create_task \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -d '{"tool_id": "image-generation", "input": {...}}'
   ```

4. **Force task processing**:
   - Set a task to `Queued` manually in Supabase dashboard
   - Worker should pick it up within 3 seconds 