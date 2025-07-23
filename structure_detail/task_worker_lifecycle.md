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

### 2. Worker Polling & Task Processing
- **External Workers** (Headless-Wan2GP) poll via `claim_next_task` Edge Function:
  - Finds oldest `Queued` task
  - Updates to `In Progress` with `worker_id`
  - Returns task details
- **Task Processing** now uses **Database Triggers** (instant):
  - When task status → `Complete`: SQL trigger `create_generation_on_task_complete` runs
  - Creates generations and shot_generations automatically in the database
  - Normalizes image paths and handles all edge cases
  - Broadcasts real-time updates via Supabase Realtime
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
  - Deducts credits from user's balance
- **SQL Trigger** (`create_generation_on_task_complete`):
  - Automatically creates `generations` records when status → `Complete`
  - Normalizes image paths (removes local server IPs)
  - Creates `shot_generations` links if applicable
  - All processing happens instantly in the database

### 4. Real-time Updates
- **Database Triggers** automatically broadcast changes via Supabase Realtime
- **Instant processing** when tasks complete (no 10-second delay)
- Client subscribes using `useWebSocket` hook
- UI updates automatically as task progresses

## Key Files

- **Edge Functions** (`/supabase/functions/`)
  - `create_task/index.ts` - Task creation & validation
  - `claim_next_task/index.ts` - Worker task assignment
  - `complete_task/index.ts` - Task completion handling
  - `calculate-task-cost/index.ts` - Credit cost calculation

- **Database Triggers** (`/supabase/migrations/`)
  - `create_generation_on_task_complete` - Creates generations instantly when tasks complete (replaces Edge Function)
  - `trigger_broadcast_task_status` - Real-time status broadcasts

- **Real-time Updates**
  - Direct Supabase Realtime connections from client
  - **Removed**: Express WebSocket server (no longer needed)

- **Client Hooks** (`/src/shared/hooks/`)
  - `useTasks.ts` - Task creation & monitoring
  - `useWebSocket.ts` - Realtime subscription

## Running Workers Locally

### Development Setup
```bash
# Ensure Supabase is running
supabase status

# Start the frontend (connects directly to Supabase)
npm run dev

# No separate server needed - all real-time updates via Supabase
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

**Architecture Components:**
- **Database Triggers**: Instant task processing and generation creation (no Edge Functions needed)
- **Supabase Realtime**: Direct client-database real-time connections
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

2. **Check processing logs**:
   - **Database Triggers**: Check Supabase logs for `[ProcessTask]` messages from `create_generation_on_task_complete`
   - **Headless-Wan2GP**: Check Python output for task processing status
   - **Realtime Updates**: Monitor browser DevTools for Supabase Realtime messages

3. **Test Edge Functions locally**:
   ```bash
   supabase functions serve create_task
   # In another terminal
   curl -X POST http://localhost:54321/functions/v1/create_task \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -d '{"tool_id": "image-generation", "input": {...}}'
   ```

4. **Test trigger processing**:
   - Set a task to `Complete` manually in Supabase dashboard
   - Should be processed **instantly** via database trigger
   - Check Supabase logs for `[ProcessTask]` messages showing generation creation
   - Verify `generations` and `shot_generations` tables are populated 