# Task & Worker Lifecycle

## Overview

Reigh uses an async task queue pattern for all AI generation workloads. This decouples the UI from long-running operations and enables distributed processing.

## Flow Diagram

### High-Level Overview
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

### Detailed Processing Flow  
For a complete step-by-step breakdown with error handling, see: [**Task Processing Deep Dive**](task_processing_deep_dive.md)

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
  - Finds oldest `Queued` task using `func_claim_available_task`
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
- **`individual_travel_segment`** - Standalone segment regeneration (visible in TasksPane, creates variant on parent generation)
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
  - Updates task status using `func_mark_task_complete` or `func_mark_task_failed`
  - Deducts credits from user's balance
  - **Variant vs Generation Logic**: If task has `based_on` parameter, creates a `generation_variant` on the source generation. If `create_as_generation=true` flag is set, overrides this and creates a new `generation` with `based_on` for lineage tracking instead.
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
  - `claim_next_task/index.ts` - Worker task assignment (uses `func_claim_available_task`)
  - `process-completed-task/index.ts` - Task completion handling (uses `func_mark_task_complete`)
  - `calculate-task-cost/index.ts` - Credit cost calculation
  - For complete Edge Functions reference including AI processing and payments, see [`edge_functions.md`](edge_functions.md)

- **Database Functions** (cleaned up 2025-07-23)
  - **Task Management**:
    - `func_claim_available_task` - Primary function for claiming tasks
    - `func_mark_task_complete` - Mark task as complete with results
    - `func_mark_task_failed` - Mark task as failed with error
    - `func_get_tasks_by_status` - Query tasks by status
    - `func_update_worker_heartbeat` - Worker health monitoring
    - `func_reset_orphaned_tasks` - Reset abandoned tasks
  - **Generation Management**:
    - `add_generation_to_shot` - Link generation to shot
    - `create_generation_on_task_complete` - Trigger for auto-creating generations
    - `normalize_image_path` / `normalize_image_paths_in_jsonb` - Clean image URLs


- **Database Triggers** (`/supabase/migrations/`)
  - `create_generation_on_task_complete` - Creates generations instantly when tasks complete
  - Direct Supabase Realtime broadcasts

- **Real-time Updates**
  - Direct Supabase Realtime connections from client

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