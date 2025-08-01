# Component Modularization

## Philosophy
When a React component grows beyond 500-1000 lines, it often becomes difficult to maintain, debug, and reason about. The solution is to break it down into smaller, focused modules that each handle a specific concern.

## Directory Structure
```
ComponentName/
  ├── index.tsx                 # Main orchestrator component
  ├── state/
  │   ├── types.ts             # All TypeScript interfaces and types
  │   └── useComponentState.ts # Centralized state management
  ├── hooks/
  │   ├── useFeatureA.ts       # Feature-specific hooks
  │   └── useFeatureB.ts
  ├── ui/
  │   ├── Header.tsx           # Pure presentational components
  │   ├── Sidebar.tsx
  │   └── Modal.tsx
  └── utils/
      ├── validation.ts        # Pure utility functions
      └── formatting.ts
```

## Implementation Layers

### 1. State Layer (`state/`)
- **`types.ts`**: All TypeScript interfaces and types
- **`useComponentState.ts`**: Centralized state management using `useReducer`
- Benefits: Single source of truth, predictable state updates, easier debugging

### 2. Hooks Layer (`hooks/`)
- **Feature-specific hooks**: Encapsulate side effects and business logic
- **Custom hooks**: Reusable logic that can be shared across components
- Benefits: Separation of concerns, easier testing, reusability

### 3. UI Layer (`ui/`)
- **Pure presentational components**: Only receive props and render UI
- **No side effects**: No useState, useEffect, or API calls
- Benefits: Easier to test, reusable, predictable

### 4. Utils Layer (`utils/`)
- **Pure functions**: No side effects, predictable output
- **Domain-specific utilities**: Business logic that doesn't belong in components
- Benefits: Testable, reusable, cacheable

### 5. Main Component (`index.tsx`)
- **Orchestrator**: Wires together all the hooks and UI components
- **Minimal logic**: Only coordination between modules
- **Clear data flow**: Props flow down, events flow up

## Performance Optimization

### Re-render Prevention
To prevent infinite re-render loops and unnecessary updates:

#### 1. Reducer Guard Clauses
```typescript
const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_VALUE':
      // Prevent unnecessary re-renders by checking equality
      if (action.payload === state.value) {
        return state; // Return same reference to prevent re-render
      }
      return { ...state, value: action.payload };
  }
};
```

#### 2. useEffect Dependency Optimization
```typescript
// AVOID: Including function references in dependencies
useEffect(() => {
  // ...
}, [orderedItems, state.loading, actions.setItems]); // ❌ actions.setItems changes on every render

// PREFER: Only include primitive values and stable references
useEffect(() => {
  // ...
}, [orderedItems, state.loading]); // ✅ Only primitives
```

#### 3. Reference Equality Checks
```typescript
useEffect(() => {
  const newData = propsData || [];
  
  // First check: avoid updating if references are the same
  if (state.localData === newData) {
    return; // ✅ Early return prevents unnecessary state update
  }
  
  // Second check: compare by content if needed
  const newDataKey = JSON.stringify(newData.map(item => item.id));
  if (newDataKey !== lastSyncedRef.current) {
    actions.setLocalData(newData);
    lastSyncedRef.current = newDataKey;
  }
}, [propsData, state.loading]);
```

#### 4. Memoization for Expensive Computations
```typescript
// Use useMemo for expensive filtering/sorting operations
const filteredItems = useMemo(() => {
  return items.filter(item => item.visible).sort((a, b) => a.position - b.position);
}, [items]); // Only recalculate when items array changes
```

#### 5. Debug Throttling
```typescript
// Throttle debug logs to reduce performance impact
useEffect(() => {
  const timeoutId = setTimeout(() => {
    console.log('[Debug] State changed:', state);
  }, 100); // Throttle to every 100ms
  
  return () => clearTimeout(timeoutId);
}, [state]);
```

## Benefits
1. **Maintainability**: Easier to understand and modify individual pieces
2. **Testability**: Each module can be tested in isolation
3. **Reusability**: Hooks and utilities can be shared across components
4. **Performance**: Optimized re-rendering and better memoization opportunities
5. **Developer Experience**: Faster builds, better IDE support, clearer git diffs
6. **Debugging**: Easier to trace issues to specific modules

## Migration Strategy
1. **Identify concerns**: Group related functionality together
2. **Extract types**: Move all interfaces to `types.ts`
3. **Create state management**: Implement `useReducer` pattern in `useComponentState.ts`
4. **Extract hooks**: Move side effects and business logic to custom hooks
5. **Create UI components**: Extract pure presentational components
6. **Move utilities**: Extract pure functions to utils
7. **Refactor main component**: Keep only orchestration logic

## Best Practices
1. **Single Responsibility**: Each module should have one clear purpose
2. **Clear Dependencies**: Minimize dependencies between modules
3. **Type Safety**: Use TypeScript interfaces for all data structures
4. **Performance**: Implement guard clauses and memoization where appropriate
5. **Documentation**: Add JSDoc comments for complex logic
6. **Testing**: Write unit tests for each module independently

## Real-World Example: ShotEditor
The `ShotEditor` component was successfully modularized from ~2100 LOC to:
- `state/types.ts` (45 lines): All TypeScript interfaces
- `state/useShotEditorState.ts` (148 lines): Centralized state with `useReducer`
- `hooks/useGenerationActions.ts` (350+ lines): Image upload/delete/reorder logic
- `hooks/useLoraSync.ts` (200+ lines): LoRA model synchronization
- `ui/Header.tsx` (80 lines): Shot name editing and navigation
- `ui/Skeleton.tsx` (25 lines): Loading skeleton
- `utils/dimension-utils.ts` (20 lines): Image dimension utilities
- `utils/generation-utils.ts` (35 lines): Generation filtering/sorting
- `index.tsx` (677 lines): Main orchestrator component

This modularization improved:
- **Performance**: Eliminated infinite re-render loops through proper state management
- **Maintainability**: Each concern is isolated and easier to understand
- **Testability**: Individual modules can be tested independently
- **Developer Experience**: Faster iteration and debugging 