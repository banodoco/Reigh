# InvalidationRouter System

## Overview

The InvalidationRouter is a centralized cache invalidation system that replaces scattered manual `queryClient.invalidateQueries()` calls with a domain event-driven approach. This system ensures consistent, canonical invalidations and reduces the risk of ordering issues, race conditions, and duplication.

## Architecture

```text
Components → Domain Events → InvalidationRouter → Canonical Invalidations → React Query Cache
```

### Core Components

1. **InvalidationRouter** (`src/shared/lib/InvalidationRouter.ts`)
   - Central event router that maps domain events to canonical cache invalidations
   - Implements backpressure with 500ms batching to reduce thrash
   - Provides extensive logging for debugging

2. **Domain Events**
   - Semantic event types that describe business operations
   - Consistent payload structure with `projectId`, `shotId`, `generationId`, etc.
   - Decouples components from cache invalidation logic

3. **Event Emitter**
   - Global singleton that manages event routing
   - Queues events until QueryClient is available
   - Provides convenience methods for common operations

## Domain Events

### Task Events
- `TASK_CREATED` - New task created
- `TASK_STATUS_CHANGE` - Task status updated
- `TASK_COMPLETED` - Task finished successfully
- `TASK_FAILED` - Task failed
- `TASK_CANCELLED` - Task cancelled
- `TASK_DELETED` - Task removed
- `TASKS_BATCH_UPDATE` - Multiple tasks updated

### Generation Events
- `GENERATION_INSERT` - New generation created
- `GENERATION_UPDATE` - Generation data updated
- `GENERATION_DELETE` - Generation removed
- `GENERATION_STAR_TOGGLE` - Generation starred/unstarred
- `GENERATION_LOCATION_UPDATE` - Generation location changed

### Shot Events
- `SHOT_CREATED` - New shot created
- `SHOT_UPDATED` - Shot data updated
- `SHOT_DELETED` - Shot removed
- `SHOT_GENERATION_CHANGE` - Shot-generation association changed
- `SHOT_REORDER` - Shot order changed

### Credit Events
- `CREDITS_UPDATED` - Credit balance changed
- `TOPUP_COMPLETED` - Auto-topup completed

### Settings Events
- `TOOL_SETTINGS_CHANGED` - Tool settings modified
- `API_TOKEN_CHANGED` - API token updated

### Resource Events
- `RESOURCE_UPLOADED` - New resource uploaded
- `RESOURCE_DELETED` - Resource removed

## Usage

### Basic Usage

```typescript
import { invalidationRouter } from '@/shared/lib/InvalidationRouter';

// Using convenience methods
invalidationRouter.taskCreated({ 
  projectId: 'project-123',
  taskId: 'task-456' 
});

invalidationRouter.generationInserted({
  projectId: 'project-123',
  shotId: 'shot-789',
  generationId: 'gen-101'
});

// Using generic emit
invalidationRouter.emit({
  type: 'SHOT_DELETED',
  payload: { projectId: 'project-123', shotId: 'shot-789' }
});
```

### In React Hooks

```typescript
import { invalidationRouter } from '@/shared/lib/InvalidationRouter';

export const useCreateTask = () => {
  return useMutation({
    mutationFn: createTaskAPI,
    onSuccess: (data, variables) => {
      // Replace manual invalidations with domain event
      invalidationRouter.taskCreated({
        projectId: variables.projectId,
        taskId: data.id
      });
    }
  });
};
```

### Replacing Manual Invalidations

**Before:**
```typescript
// Scattered manual invalidations
queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', projectId] });
queryClient.invalidateQueries({ queryKey: ['task-status-counts', projectId] });
queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
```

**After:**
```typescript
// Single domain event
invalidationRouter.taskCreated({ projectId, taskId });
```

## Canonical Invalidation Mapping

The InvalidationRouter ensures each domain event triggers the minimal, canonical set of cache invalidations:

### Task Events → Cache Keys
- `TASK_CREATED`, `TASK_STATUS_CHANGE`, `TASK_COMPLETED`, etc.
  - `['task-status-counts', projectId]`
  - `['tasks', 'paginated', projectId]`
  - `['unified-generations', 'project', projectId]` (tasks may have generations)
  - `['tasks', 'single', taskId]` (if taskId provided)

### Generation Events → Cache Keys
- `GENERATION_INSERT`, `GENERATION_UPDATE`
  - `['unified-generations', 'project', projectId]`
  - `['unified-generations', 'shot', shotId]` (if shotId provided)
  - `['shots', projectId]` (shots may have generation counts)

### Shot Events → Cache Keys
- `SHOT_CREATED`, `SHOT_UPDATED`, `SHOT_DELETED`
  - `['shots', projectId]`
  - `['unified-generations', 'project', projectId]`
  - `['unified-generations', 'shot', shotId]` (if shotId provided)

## Benefits

### 1. Consistency
- All invalidations follow canonical patterns
- No risk of missing invalidations or invalidating wrong keys
- Centralized logic ensures consistency across the app

### 2. Maintainability
- Single source of truth for invalidation logic
- Easy to add new event types or modify invalidation patterns
- Clear separation between business logic and cache management

### 3. Performance
- Built-in backpressure prevents invalidation thrash
- Batches invalidations within 500ms windows
- Reduces redundant invalidations

### 4. Debugging
- Comprehensive logging with `[InvalidationRouter]` tags
- Event-driven approach makes it easy to trace invalidations
- Clear mapping from events to cache keys

### 5. Reliability
- Eliminates race conditions from manual invalidations
- Prevents ordering issues
- Queues events until QueryClient is ready

## Migration Guide

### Step 1: Import InvalidationRouter
```typescript
import { invalidationRouter } from '@/shared/lib/InvalidationRouter';
```

### Step 2: Replace Manual Invalidations
Find patterns like:
```typescript
queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
queryClient.invalidateQueries({ queryKey: ['task-status-counts', projectId] });
```

Replace with:
```typescript
invalidationRouter.taskStatusChanged({ projectId, taskId });
```

### Step 3: Use Appropriate Event Types
Choose the most specific event type that matches the business operation:
- Use `TASK_CREATED` for new tasks, not generic `TASK_STATUS_CHANGE`
- Use `GENERATION_INSERT` for new generations, not `GENERATION_UPDATE`
- Use `SHOT_GENERATION_CHANGE` for association changes, not `SHOT_UPDATED`

### Step 4: Remove Redundant Invalidations
The InvalidationRouter handles all necessary invalidations for each event type. Remove any manual invalidations that are now redundant.

## Configuration

The InvalidationRouter respects the `VITE_RECONNECTION_LOGS_ENABLED` environment variable for debug logging:

```bash
VITE_RECONNECTION_LOGS_ENABLED=true  # Enable detailed logging
```

## Initialization

The InvalidationRouter is automatically initialized in `src/app/App.tsx`:

```typescript
import { invalidationRouter } from '@/shared/lib/InvalidationRouter';

const queryClient = new QueryClient(/* ... */);
invalidationRouter.setQueryClient(queryClient);
```

## Integration Points

### RealtimeProvider
The RealtimeProvider uses the InvalidationRouter to handle realtime events:

```typescript
// Realtime event → Domain event → Canonical invalidations
onPostgresChange('tasks', (payload) => {
  invalidationRouter.taskStatusChanged({
    projectId: payload.new.project_id,
    taskId: payload.new.id
  });
});
```

### TaskInvalidationSubscriber
Legacy custom events are bridged to the new system:

```typescript
window.addEventListener('task-created', (e) => {
  invalidationRouter.taskCreated({
    projectId: e.detail.projectId,
    taskId: e.detail.taskId
  });
});
```

## Error Handling

The InvalidationRouter includes robust error handling:
- Events are queued if QueryClient is not ready
- Errors in event processing don't crash the app
- Comprehensive logging helps debug issues
- Graceful fallbacks for malformed events

## Performance Considerations

### Batching
The InvalidationRouter batches invalidations within 500ms windows to prevent thrash during rapid updates.

### Selective Invalidation
Only the minimal set of cache keys are invalidated for each event type, reducing unnecessary refetches.

### Memory Management
Event queues are automatically cleared after processing to prevent memory leaks.

## Testing

The InvalidationRouter can be tested by:

1. **Unit Testing Events**
   ```typescript
   invalidationRouter.setQueryClient(mockQueryClient);
   invalidationRouter.taskCreated({ projectId: 'test' });
   expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
     queryKey: ['task-status-counts', 'test']
   });
   ```

2. **Integration Testing**
   - Verify that mutations emit correct domain events
   - Check that UI updates after invalidations
   - Test error scenarios and fallbacks

3. **E2E Testing**
   - Verify complete flows from user action to UI update
   - Test realtime event processing
   - Validate cross-component invalidations

## Troubleshooting

### Common Issues

1. **Events Not Processing**
   - Check that QueryClient is set: `invalidationRouter.setQueryClient(queryClient)`
   - Verify event payload structure matches expected format
   - Check console for `[InvalidationRouter]` error logs

2. **UI Not Updating**
   - Ensure components use canonical query keys
   - Verify the correct domain event is being emitted
   - Check that invalidations are targeting the right cache keys

3. **Performance Issues**
   - Monitor invalidation frequency with debug logs
   - Check for redundant events being emitted
   - Verify batching is working (500ms intervals)

### Debug Logging

Enable debug logging to trace event processing:

```bash
VITE_RECONNECTION_LOGS_ENABLED=true
```

Look for logs like:
```
[InvalidationRouter] Processing domain event { type: "TASK_CREATED", payload: {...} }
[InvalidationRouter] Scheduled flush { pendingCount: 3 }
```

## Future Enhancements

1. **Metrics Collection**
   - Track invalidation frequency and patterns
   - Monitor performance impact
   - Identify optimization opportunities

2. **Event Replay**
   - Store events for debugging
   - Replay events after errors
   - Support for event sourcing patterns

3. **Advanced Batching**
   - Smart batching based on event types
   - Priority-based processing
   - Adaptive batching intervals

4. **Type Safety**
   - Strict typing for event payloads
   - Compile-time validation of event structures
   - Auto-generated event types from schema

## Related Documentation

- [Realtime System](./realtime_system.md) - How InvalidationRouter integrates with realtime events
- [Data Persistence](./data_persistence.md) - Query key conventions and caching patterns
- [Debug Logging](./debug_logging.md) - Debugging tools and techniques
