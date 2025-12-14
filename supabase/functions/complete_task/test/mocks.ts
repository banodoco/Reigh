/**
 * Mock infrastructure for testing complete_task edge function
 * Captures all Supabase operations for comparison between implementations
 */

export interface CapturedOperation {
  type: 'db_select' | 'db_insert' | 'db_update' | 'db_delete' | 'db_rpc' | 'storage_upload' | 'storage_get_url' | 'storage_remove' | 'fetch';
  table?: string;
  bucket?: string;
  path?: string;
  data?: any;
  filters?: any;
  url?: string;
  method?: string;
  body?: any;
  result?: any;
}

export interface MockConfig {
  // Pre-configured responses for different queries
  tasks: Record<string, any>;           // task_id -> task data
  taskTypes: Record<string, any>;       // task_type name -> task_type data
  generations: Record<string, any>;     // generation_id -> generation data
  shots: Record<string, any>;           // shot_id -> shot data
  existingFiles: string[];              // storage paths that "exist"
}

export class OperationCapture {
  operations: CapturedOperation[] = [];
  
  capture(op: CapturedOperation) {
    this.operations.push(op);
  }
  
  clear() {
    this.operations = [];
  }
  
  // Get operations of a specific type
  getByType(type: CapturedOperation['type']) {
    return this.operations.filter(op => op.type === type);
  }
  
  // Get a normalized snapshot for comparison
  toSnapshot(): string {
    // Sort operations by type then by table/path for deterministic comparison
    const sorted = [...this.operations].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      const aKey = a.table || a.path || a.url || '';
      const bKey = b.table || b.path || b.url || '';
      return aKey.localeCompare(bKey);
    });
    
    return JSON.stringify(sorted, null, 2);
  }
}

/**
 * Create a mock Supabase client that captures all operations
 */
export function createMockSupabase(config: MockConfig, capture: OperationCapture) {
  // Maintain mutable in-memory state so multi-step flows behave realistically.
  // NOTE: We intentionally mutate the provided config object to keep things simple.

  // Helper to create chainable query builder
  const createQueryBuilder = (table: string, operation: 'select' | 'insert' | 'update' | 'delete') => {
    const state: any = {
      table,
      operation,
      selectFields: '*',
      filters: [],
      data: null,
      returning: false,
    };
    
    const builder: any = {
      select: (fields: string = '*') => {
        state.selectFields = fields;
        state.returning = true;
        return builder;
      },
      insert: (data: any) => {
        state.data = data;
        state.operation = 'insert';
        return builder;
      },
      update: (data: any) => {
        state.data = data;
        state.operation = 'update';
        return builder;
      },
      delete: () => {
        state.operation = 'delete';
        return builder;
      },
      eq: (field: string, value: any) => {
        state.filters.push({ type: 'eq', field, value });
        return builder;
      },
      neq: (field: string, value: any) => {
        state.filters.push({ type: 'neq', field, value });
        return builder;
      },
      in: (field: string, values: any[]) => {
        state.filters.push({ type: 'in', field, values });
        return builder;
      },
      contains: (field: string, value: any) => {
        state.filters.push({ type: 'contains', field, value });
        return builder;
      },
      not: (field: string, operator: string, value: any) => {
        state.filters.push({ type: 'not', field, operator, value });
        return builder;
      },
      or: (conditions: string) => {
        state.filters.push({ type: 'or', conditions });
        return builder;
      },
      order: (field: string, options?: any) => {
        state.order = { field, ...options };
        return builder;
      },
      limit: (n: number) => {
        state.limit = n;
        return builder;
      },
      single: () => {
        state.single = true;
        return executeQuery();
      },
      maybeSingle: () => {
        state.maybeSingle = true;
        return executeQuery();
      },
      then: (resolve: any) => executeQuery().then(resolve),
    };
    
    const executeQuery = async () => {
      const opType = `db_${state.operation}` as CapturedOperation['type'];
      
      capture.capture({
        type: opType,
        table,
        data: state.data,
        filters: state.filters,
      });
      
      // Return mock data based on config
      let result: any = null;
      let error: any = null;

      const eqFilters = state.filters.filter((f: any) => f.type === 'eq');
      const getEq = (field: string) => eqFilters.find((f: any) => f.field === field)?.value;
      const allEqMatch = (row: any) => eqFilters.every((f: any) => row?.[f.field] === f.value);
      
      if (table === 'tasks') {
        const id = getEq('id');
        if (id && config.tasks[id]) {
          result = config.tasks[id];
        } else if (state.operation === 'select') {
          // Support list queries (e.g., orchestrator sibling checks)
          const rows = Object.values(config.tasks).filter((t: any) => allEqMatch(t));
          result = state.single || state.maybeSingle ? (rows[0] ?? null) : rows;
        }
      } else if (table === 'task_types') {
        const name = getEq('name');
        if (name && config.taskTypes[name]) result = config.taskTypes[name];
      } else if (table === 'generations') {
        const idFilter = state.filters.find((f: any) => f.type === 'eq' && f.field === 'id');
        if (idFilter && config.generations[idFilter.value]) {
          result = config.generations[idFilter.value];
        }
        // Handle contains query for tasks array
        const containsFilter = state.filters.find((f: any) => f.type === 'contains' && f.field === 'tasks');
        if (containsFilter) {
          const taskIds = JSON.parse(containsFilter.value);
          for (const [genId, gen] of Object.entries(config.generations)) {
            if ((gen as any).tasks?.some((t: string) => taskIds.includes(t))) {
              result = gen;
              break;
            }
          }
        }
      } else if (table === 'shots') {
        const id = getEq('id');
        if (id && config.shots[id]) result = config.shots[id];
      }
      
      // For inserts/updates, return the data that was sent
      if (state.operation === 'insert' && state.returning) {
        result = { ...state.data, id: state.data.id || crypto.randomUUID() };
      }
      if (state.operation === 'update' && state.returning) {
        result = state.data;
      }

      // Apply state mutations for inserts/updates so later selects see changes
      if (state.operation === 'insert') {
        if (table === 'tasks') {
          const row = Array.isArray(state.data) ? state.data[0] : state.data;
          if (row?.id) config.tasks[row.id] = { ...(config.tasks[row.id] || {}), ...row };
        } else if (table === 'generations') {
          const row = Array.isArray(state.data) ? state.data[0] : state.data;
          const id = row?.id || crypto.randomUUID();
          config.generations[id] = { ...(config.generations[id] || {}), ...row, id };
        } else if (table === 'shots') {
          const row = Array.isArray(state.data) ? state.data[0] : state.data;
          if (row?.id) config.shots[row.id] = { ...(config.shots[row.id] || {}), ...row };
        }
      }

      if (state.operation === 'update') {
        if (table === 'tasks') {
          const id = getEq('id');
          if (id && config.tasks[id] && allEqMatch(config.tasks[id])) {
            config.tasks[id] = { ...config.tasks[id], ...state.data };
            result = config.tasks[id];
          } else if (state.single) {
            result = null;
          }
        } else if (table === 'generations') {
          const id = getEq('id');
          if (id && config.generations[id] && allEqMatch(config.generations[id])) {
            config.generations[id] = { ...config.generations[id], ...state.data };
            result = config.generations[id];
          } else if (state.single) {
            result = null;
          }
        }
      }

      // Simulate joined fields for tasks when requested
      if (table === 'tasks' && state.operation === 'select' && result) {
        const includeTaskTypes = typeof state.selectFields === 'string' && state.selectFields.includes('task_types');
        if (includeTaskTypes) {
          if (Array.isArray(result)) {
            result = result.map((t: any) => ({ ...t, task_types: config.taskTypes[t.task_type] ?? null }));
          } else {
            result = { ...result, task_types: config.taskTypes[result.task_type] ?? null };
          }
        }
      }
      
      if (state.single && !result) {
        error = { code: 'PGRST116', message: 'No rows found' };
      }
      
      return { data: result, error };
    };
    
    return builder;
  };
  
  // Mock storage
  const createStorageMock = (bucket: string) => ({
    upload: async (path: string, data: any, options?: any) => {
      capture.capture({
        type: 'storage_upload',
        bucket,
        path,
        data: { size: data?.length || 0, contentType: options?.contentType },
      });
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => {
      capture.capture({
        type: 'storage_get_url',
        bucket,
        path,
      });
      return { 
        data: { 
          publicUrl: `https://mock-storage.supabase.co/storage/v1/object/public/${bucket}/${path}` 
        } 
      };
    },
    remove: async (paths: string[]) => {
      capture.capture({
        type: 'storage_remove',
        bucket,
        path: paths.join(','),
      });
      return { data: null, error: null };
    },
  });
  
  return {
    from: (table: string) => createQueryBuilder(table, 'select'),
    storage: {
      from: (bucket: string) => createStorageMock(bucket),
    },
    rpc: async (fn: string, params: any) => {
      capture.capture({
        type: 'db_rpc',
        table: fn,
        data: params,
      });
      return { data: null, error: null };
    },
  };
}

/**
 * Create mock fetch that captures external calls
 */
export function createMockFetch(capture: OperationCapture) {
  return async (url: string, options?: RequestInit) => {
    capture.capture({
      type: 'fetch',
      url,
      method: options?.method || 'GET',
      body: options?.body ? JSON.parse(options.body as string) : undefined,
    });
    
    // Return mock responses for known endpoints
    if (url.includes('calculate-task-cost')) {
      return new Response(JSON.stringify({ cost: 0.01, duration_seconds: 10 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('{}', { status: 200 });
  };
}

/**
 * Create a mock Request object
 */
export function createMockRequest(body: any, headers: Record<string, string> = {}): Request {
  return new Request('https://mock.supabase.co/functions/v1/complete-task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-service-key',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

