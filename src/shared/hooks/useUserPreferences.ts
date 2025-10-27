import { useState, useEffect, useCallback } from 'react';

interface UserPreferences {
  videoSoundEnabled: boolean;
}

const PREFERENCES_KEY = 'reigh_user_preferences';

const DEFAULT_PREFERENCES: UserPreferences = {
  videoSoundEnabled: true, // Default to sound ON
};

/**
 * Hook for managing user preferences stored in localStorage
 * App-level settings that persist across sessions
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_PREFERENCES, ...parsed };
      }
    } catch (error) {
      console.error('[UserPreferences] Failed to load preferences:', error);
    }
    return DEFAULT_PREFERENCES;
  });

  // Save to localStorage whenever preferences change
  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error('[UserPreferences] Failed to save preferences:', error);
    }
  }, [preferences]);

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  }, []);

  const setVideoSoundEnabled = useCallback((enabled: boolean) => {
    updatePreferences({ videoSoundEnabled: enabled });
  }, [updatePreferences]);

  return {
    preferences,
    updatePreferences,
    setVideoSoundEnabled,
  };
}




