export interface UserPreferences {
  lastOpenedProjectId?: string;
}

export const userPreferencesSettings = {
  id: 'user-preferences',
  scope: ['user'] as const,
  defaults: {
    lastOpenedProjectId: undefined,
  } satisfies UserPreferences,
}; 