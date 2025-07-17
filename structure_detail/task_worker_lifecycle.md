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
- Express worker (`src/server/services/taskProcessingService.ts`) polls every **10 seconds** (see `setTimeout(..., 10000)` in `startTaskPoller`)
- Calls `claim_next_task` Edge Function which:
  - Finds oldest `Queued` task
  - Updates to `In Progress` with `worker_id`
  - Returns task details
- Worker processes based on `tool_id`:
  - Image generation → FAL API
  - Video processing → FFmpeg
  - Prompt enhancement → OpenAI

## Worker Types

### Local Express Worker
- Basic task processor (`/src/server/services/taskProcessingService.ts`)
- Handles simple tasks like prompt enhancement and basic image generation
- Runs alongside the main application in development

### Headless-Wan2GP Worker (Cloud/Local GPU)
- Advanced video generation worker: [Headless-Wan2GP](https://github.com/peteromallet/Headless-Wan2GP)
- Specialized for travel-between-images video generation tasks
- Can run locally with GPU or deployed to cloud instances
- Handles computationally intensive video generation workflows

#### Task Types Handled
- **`travel_orchestrator`** - Manages multi-segment travel workflows
- **`travel_segment`** - Creates guide videos and runs WGP generation using VACE
- **`travel_stitch`** - Stitches segment videos with crossfades and timing
- **`image-generation`** - Fallback for basic image generation tasks

#### Deployment Options

**Local Deployment (GPU Required)**
```bash
# Clone the worker repository
git clone https://github.com/peteromallet/Headless-Wan2GP.git
cd Headless-Wan2GP

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials and API keys

# Run the worker
python main.py
```

**Cloud Deployment**
- Deploy to GPU-enabled cloud instances (AWS, Google Cloud, etc.)
- Requires CUDA-compatible GPU for video generation
- Configure with production Supabase credentials
- Multiple workers can run simultaneously for parallel processing

#### Worker Configuration
The worker polls the same task queue but specializes in video generation:
- Connects to Supabase using environment credentials
- Claims tasks with `tool_id` matching its capabilities
- Updates task status and uploads results to designated storage buckets
- Uses PostgreSQL (Supabase) for both local development and production

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

## Running Workers Locally

### Basic Express Worker (Development)
```bash
# Ensure Supabase is running
supabase status

# Start the worker
npm run start:api
```

### Headless-Wan2GP Worker (GPU Required)
For video generation tasks, you'll need the specialized worker:

```bash
# Clone and setup the GPU worker
git clone https://github.com/peteromallet/Headless-Wan2GP.git
cd Headless-Wan2GP

# Install Python dependencies
pip install -r requirements.txt

# Configure environment (copy from main Reigh project)
cp .env.example .env
# Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.

# Run the video generation worker
python main.py
```

**When to use which worker:**
- **Express Worker**: Prompt enhancement, basic image generation, development
- **Headless-Wan2GP**: Video travel generation, production workloads, GPU-intensive tasks

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
   - **Express Worker**: Look for `[Task Poller]` prefixed messages
   - **Headless-Wan2GP**: Check Python output for task processing status
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
   - Worker should pick it up within **≈10 seconds** 