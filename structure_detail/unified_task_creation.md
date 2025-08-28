# Unified Task Creation System

## Overview

The unified task creation system provides a standardized approach for creating tasks across all tools in the application. This system replaces individual edge functions with a single `create-task` edge function and moves parameter processing to the client side.

## Architecture

### Before: Individual Edge Functions
```
Frontend → steerable-motion edge function → Database
Frontend → magic-edit edge function → Database  
Frontend → single-image-generate edge function → Database
```

### After: Unified System
```
Frontend → Client-side processing → create-task edge function → Database
```

## Key Components

### 1. Shared Task Creation Utilities (`src/shared/lib/taskCreation.ts`)

Provides common functionality for all task types:

```typescript
// Core utilities
export async function resolveProjectResolution(projectId: string, customResolution?: string)
export function generateTaskId(taskTypePrefix: string): string
export function generateRunId(): string
export async function createTask(taskParams: BaseTaskParams): Promise<any>
export function expandArrayToCount<T>(arr: T[], targetCount: number): T[]
export function validateRequiredFields(params: Record<string, any>, requiredFields: string[])
```

### 2. Task-Specific Helpers (`src/shared/lib/tasks/`)

Each task type has its own helper module:

```
src/shared/lib/tasks/
├── travelBetweenImages.ts    ✅ (migrated)
├── magicEdit.ts              ⏳ (future)
├── singleImage.ts            ⏳ (future)
└── replicateUpscale.ts       ⏳ (future)
```

### 3. Unified Edge Function (`supabase/functions/create-task/`)

Single edge function that handles all task creation with dual authentication:
- **JWT Authentication**: For frontend Supabase auth users
- **PAT Authentication**: For API integrations (unchanged)

## Migration Example: Travel Between Images

### Step 1: Create Task-Specific Helper

**File**: `src/shared/lib/tasks/travelBetweenImages.ts`

```typescript
export interface TravelBetweenImagesTaskParams {
  project_id: string;
  shot_id?: string;
  image_urls: string[];
  base_prompts: string[];
  // ... all other parameters from original edge function
}

export async function createTravelBetweenImagesTask(params: TravelBetweenImagesTaskParams): Promise<any> {
  // 1. Validate parameters
  validateTravelBetweenImagesParams(params);

  // 2. Resolve project resolution client-side
  const { resolution: finalResolution } = await resolveProjectResolution(
    params.project_id, 
    params.resolution
  );

  // 3. Generate orchestrator IDs (stored in params, not as DB ID)
  const orchestratorTaskId = generateTaskId("sm_travel_orchestrator");
  const runId = generateRunId();

  // 4. Build orchestrator payload (preserve all original logic)
  const orchestratorPayload = buildTravelBetweenImagesPayload(
    params, 
    finalResolution, 
    orchestratorTaskId, 
    runId
  );

  // 5. Use unified create-task function
  return await createTask({
    project_id: params.project_id,
    task_type: "travel_orchestrator",
    params: {
      orchestrator_details: orchestratorPayload,
      task_id: orchestratorTaskId,
    }
  });
}
```

### Step 2: Update Frontend Integration

**Before** (using enqueueTasks):
```typescript
await generationActions.enqueueTasks([{
  functionName: 'steerable-motion',
  payload: requestBody,
}]);
```

**After** (using task-specific helper):
```typescript
import { createTravelBetweenImagesTask } from '@/shared/lib/tasks/travelBetweenImages';

await createTravelBetweenImagesTask(requestBody as TravelBetweenImagesTaskParams);
```

### Step 3: Remove Old Edge Function

Delete the `supabase/functions/steerable-motion/` directory entirely.

## Authentication Flow

The `create-task` edge function supports dual authentication:

```typescript
// 1. Service Role (unchanged)
if (token === serviceKey) {
  isServiceRole = true;
}

// 2. JWT Authentication (NEW)
if (isJwtToken && payload.sub) {
  callerId = payload.sub; // Extract user ID from JWT
}

// 3. PAT Authentication (unchanged)
if (!isServiceRole && !isJwtToken) {
  // Query user_api_tokens table exactly as before
}
```

## Benefits

### 🚀 Performance
- **Eliminated network round-trips** for parameter resolution
- **Client-side validation** before network calls
- **Faster task creation** with fewer edge function invocations

### 🔧 Maintainability  
- **Single task creation pattern** across all tools
- **Shared validation and utilities** reduce code duplication
- **Consistent error handling** and logging

### 📊 Reliability
- **Client-side parameter processing** reduces edge function complexity
- **Proper authentication** with JWT and PAT support
- **Database UUID compliance** with auto-generated IDs

### 🛡️ Security
- **Dual authentication support** maintains API compatibility
- **Project ownership validation** preserved
- **Token validation** for both JWT and PAT methods

## Migration Checklist

For migrating other edge functions, follow this pattern:

### ✅ Analysis Phase
- [ ] Document all parameters and logic from original edge function
- [ ] Identify any database queries or external API calls
- [ ] Map parameter validation and transformation logic

### ✅ Implementation Phase  
- [ ] Create task-specific helper in `src/shared/lib/tasks/[taskType].ts`
- [ ] Define typed interface for task parameters
- [ ] Implement validation function using shared utilities
- [ ] Build payload processing function (preserve original logic)
- [ ] Create main task creation function using `createTask()`

### ✅ Integration Phase
- [ ] Update frontend to import and use new helper
- [ ] Replace edge function calls with helper calls
- [ ] Update loading states and error handling if needed
- [ ] Remove edge function dependency from useCallback arrays

### ✅ Testing Phase
- [ ] Test TypeScript compilation (`npm run build`)
- [ ] Verify all parameters are preserved correctly
- [ ] Test authentication and authorization
- [ ] Confirm task creation and execution

### ✅ Cleanup Phase
- [ ] Remove old edge function directory
- [ ] Update any documentation references
- [ ] Remove unused imports and dependencies

## Error Handling

The unified system provides consistent error handling:

```typescript
try {
  await createTravelBetweenImagesTask(params);
  // Success state handling
} catch (error) {
  console.error('Error creating task:', error);
  toast.error(`Failed to create task: ${error.message}`);
}
```

Common error types:
- **Validation errors**: Invalid or missing parameters
- **Authentication errors**: Missing or invalid tokens  
- **Authorization errors**: User doesn't own project
- **Database errors**: SQL constraints or connection issues

## Future Enhancements

### Planned Migrations
1. **Magic Edit** (`magic-edit` → `magicEdit.ts`)
2. **Single Image Generation** (`single-image-generate` → `singleImage.ts`)
3. **Replicate Upscale** (`replicate-upscale` → `replicateUpscale.ts`)

### Potential Improvements
- **Batch task creation** for multiple tasks
- **Task dependency management** for complex workflows
- **Enhanced validation** with Zod or similar schemas
- **Task templates** for common parameter sets
- **Client-side task progress tracking**

## Example Usage Patterns

### Simple Task Creation
```typescript
import { createMagicEditTask } from '@/shared/lib/tasks/magicEdit';

const result = await createMagicEditTask({
  project_id: projectId,
  prompt: "Transform this image",
  image_url: sourceImage,
  // ... other parameters
});
```

### Batch Operations
```typescript
const tasks = await Promise.all([
  createSingleImageTask(params1),
  createSingleImageTask(params2),
  createSingleImageTask(params3),
]);
```

### With Error Handling
```typescript
try {
  const result = await createTravelBetweenImagesTask(params);
  setTaskId(result.task_id);
  showSuccessState();
} catch (error) {
  if (error.message.includes('Authentication')) {
    redirectToLogin();
  } else {
    showErrorMessage(error.message);
  }
}
```

## Summary

The unified task creation system provides a robust, maintainable, and performant approach to task management. The travel between images migration demonstrates the pattern for future migrations, with significant benefits in code organization, performance, and developer experience.

Key principles:
- **Client-side parameter processing** for performance
- **Shared utilities** for consistency  
- **Dual authentication** for compatibility
- **Preserve all functionality** during migration
- **Clean up old systems** after successful migration
