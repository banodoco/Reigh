# Task Processing Deep Dive

## Overview
This document explains **exactly** what happens when a task moves through the system, with all edge cases and error handling.

## Complete Flow with Error Handling

### 1. Task Creation (`create_task` Edge Function)
```typescript
// Input validation
if (!tool_id || !input) throw new Error('Missing required fields');

// Credit check
const userBalance = await getUserCredits(userId);
if (userBalance < calculatedCost) throw new Error('Insufficient credits');

// Insert task
const task = await supabase.from('tasks').insert({
  project_id: projectId,
  tool_id,
  task_type: mapToolToTaskType(tool_id), // e.g., 'single_image'
  params: input,
  cost: calculatedCost,
  status: 'Queued',
  generation_created: false, // Important: prevents duplicate generations
});
```

**Possible Errors:**
- Insufficient credits → User sees error toast
- Invalid input → Validation error returned to client
- Database error → Retry with exponential backoff

### 2. Worker Processing

#### Worker Types & Task Assignment
```sql
-- claim_next_task logic (simplified)
UPDATE tasks 
SET status = 'In Progress', 
    worker_id = worker_identifier,
    claimed_at = NOW()
WHERE id = (
  SELECT id FROM tasks 
  WHERE status = 'Queued' 
  AND cost <= available_credits
  ORDER BY created_at ASC 
  LIMIT 1
)
RETURNING *;
```

**Task Type Routing:**
- `single_image` → Can be handled by any worker
- `travel_orchestrator` → Requires Headless-Wan2GP
- `travel_segment` → Requires Headless-Wan2GP
- `travel_stitch` → Requires Headless-Wan2GP

#### Processing Logic
```python
# In Headless-Wan2GP worker
def process_task(task):
    try:
        if task['task_type'] == 'travel_stitch':
            result = process_video_stitch(task['params'])
        elif task['task_type'] == 'single_image':
            result = generate_single_image(task['params'])
        
        # Upload result to storage
        output_url = upload_to_supabase_storage(result.file)
        
        # Mark complete
        process_completed_task(task['id'], {
            'output_location': output_url,
            'metadata': result.metadata
        })
    except Exception as e:
        # Mark failed
        fail_task(task['id'], str(e))
```

### 3. Task Completion (`process-completed-task` Edge Function)

```typescript
// Update task status
await supabase.from('tasks').update({
  status: success ? 'Complete' : 'Failed',
  output_location: outputData?.location,
  error_message: errorData?.message,
  completed_at: new Date().toISOString(),
}).eq('id', taskId);

// Deduct credits (only on success)
if (success) {
  await deductUserCredits(userId, task.cost);
}
```

**Critical**: The database trigger fires **automatically** when status becomes 'Complete'.

### 4. Generation Creation (Database Trigger)

This is where the magic happens - **automatically** when a task completes:

```sql
-- Trigger: create_generation_on_task_complete
-- Fires: ON UPDATE OF status ON tasks

IF NEW.status = 'Complete' 
   AND NEW.generation_created = FALSE -- Prevents duplicates
   AND NEW.task_type IN ('travel_stitch', 'single_image') THEN

  -- Generate unique ID
  new_generation_id := gen_random_uuid();
  
  -- Parse task type
  IF NEW.task_type = 'travel_stitch' THEN
    -- Video generation
    generation_type := 'video';
    shot_id := (params->'full_orchestrator_payload'->>'shot_id')::uuid;
  ELSIF NEW.task_type = 'single_image' THEN  
    -- Image generation
    generation_type := 'image';
    shot_id := (params->>'shot_id')::uuid;
  END IF;

  -- Create generation record
  INSERT INTO generations (
    id, location, type, project_id, 
    metadata, params, tasks, created_at
  ) VALUES (
    new_generation_id,
    NEW.output_location,
    generation_type, 
    NEW.project_id,
    NEW.metadata,
    normalized_params,
    jsonb_build_array(NEW.id), -- Link back to task
    NEW.completed_at
  );

  -- Link to shot if applicable
  IF shot_id IS NOT NULL THEN
    INSERT INTO shot_generations (shot_id, generation_id, position)
    VALUES (shot_id, new_generation_id, NULL); -- NULL = "unpositioned"
  END IF;

  -- Mark task as processed
  NEW.generation_created := TRUE;

END IF;
```

**Error Handling:**
- Invalid shot_id → Generation created without shot link
- Missing output_location → Generation creation skipped
- Constraint violations → Logged but don't fail the task update

### 5. Real-time Updates

The system uses **multiple layers** of real-time updates:

#### Layer 1: Database Triggers → Supabase Realtime
```sql
-- Automatic broadcast when generations table changes
-- Handled by Supabase's built-in realtime system
```

#### Layer 2: Client WebSocket Subscription
```typescript
// useWebSocket.ts
supabase
  .channel('projects-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'generations',
    filter: `project_id=eq.${projectId}`
  }, (payload) => {
    // Invalidate React Query caches
    queryClient.invalidateQueries(['generations', projectId]);
    queryClient.invalidateQueries(['unified-generations', 'shot', shotId]);
  })
  .subscribe();
```

#### Layer 3: React Query Cache Updates
```typescript
// Components automatically re-render when:
const { data: generations } = useUnifiedGenerations({
  projectId,
  mode: 'shot-specific',
  shotId,
  // ... other options
});
// This query is invalidated by the WebSocket subscription above
```

## Error Scenarios & Recovery

### Common Issues

1. **Task Stuck in "In Progress"**
   - **Cause**: Worker crashed or lost connection
   - **Recovery**: Tasks have a timeout mechanism; they return to 'Queued' after 30 minutes
   - **Detection**: Monitor `claimed_at` timestamp

2. **Generation Not Created**
   - **Cause**: Trigger failed, invalid data, or constraint violation
   - **Recovery**: Check `generation_created` flag; can manually process
   - **Detection**: Task is 'Complete' but no generation exists

3. **Realtime Updates Not Working**
   - **Cause**: WebSocket disconnect, subscription error
   - **Recovery**: useWebSocket automatically reconnects
   - **Detection**: UI doesn't update after task completion

### Debug Checklist

When a task isn't working properly:

1. **Check Task Status**
   ```sql
   SELECT id, status, task_type, generation_created, error_message 
   FROM tasks 
   WHERE id = 'task-id';
   ```

2. **Check for Generation**
   ```sql
   SELECT g.* FROM generations g 
   WHERE g.tasks @> '["task-id"]';
   ```

3. **Check Shot Link**
   ```sql
   SELECT * FROM shot_generations sg
   JOIN generations g ON sg.generation_id = g.id
   WHERE g.tasks @> '["task-id"]';
   ```

4. **Check Client Cache**
   ```javascript
   // In browser console
   console.log(queryClient.getQueriesData(['generations', projectId]));
   ```

## Key Files & Functions

### Edge Functions (`/supabase/functions/`)
- `create_task/index.ts` - Task creation & validation
- `claim_next_task/index.ts` - Worker assignment  
- `process-completed-task/index.ts` - Task completion
- `calculate-task-cost/index.ts` - Cost estimation

### Database Triggers (`/supabase/migrations/`)
- `create_generation_on_task_complete()` - Auto-generation creation
- `broadcast_task_status_update()` - Real-time status broadcasts

### Client Hooks (`/src/shared/hooks/`)
- `useTasks.ts` - Task queue management
- `useUnifiedGenerations.ts` - Generation fetching
- `useWebSocket.ts` - Real-time subscriptions
- `generationTaskBridge.ts` - Task↔Generation mapping

### Worker Code (External)
- [Headless-Wan2GP](https://github.com/peteromallet/Headless-Wan2GP) - GPU worker for video tasks

## Performance Considerations

### Database Optimization
- Tasks table has index on `(status, created_at)` for efficient worker polling
- Generations table has index on `project_id` for fast gallery loading
- Real-time subscriptions are filtered by `project_id` to reduce noise

### Caching Strategy
- Generation queries cached for 5 minutes (relatively static)
- Task queries cached for 30 seconds (more dynamic)
- Task-generation mappings cached for 10 minutes (rarely change)

### Rate Limiting
- Workers poll every 2-5 seconds (configurable)
- Background preloading uses 200ms delays between batches
- Real-time updates are debounced to prevent UI thrashing
