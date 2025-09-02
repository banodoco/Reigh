export type UnifiedMode = 'project' | 'shot';

export function unifiedGenerationsProjectKey(projectId: string, page?: number, limit?: number, filtersKey?: string | null, includeTaskData?: boolean) {
  return ['unified-generations', 'project', projectId, page, limit, filtersKey ?? null, includeTaskData ?? false];
}

export function unifiedGenerationsShotKey(shotId: string, page?: number, limit?: number, filtersKey?: string | null, includeTaskData?: boolean) {
  return ['unified-generations', 'shot', shotId, page, limit, filtersKey ?? null, includeTaskData ?? false];
}


