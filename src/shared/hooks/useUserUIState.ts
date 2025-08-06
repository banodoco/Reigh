import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Shared cache to prevent duplicate database calls
const settingsCache = new Map<string, { data: any; timestamp: number; loading: Promise<any> | null }>();
const CACHE_DURATION = 30000; // 30 seconds

interface UISettings {
  paneLocks: {
    shots: boolean;
    tasks: boolean;
    gens: boolean;
  };
  settingsModal: {
    activeTab: string;
  };
  videoTravelWidescreen: {
    enabled: boolean;
  };
  imageDeletion?: {
    skipConfirmation: boolean;
  };
  generationMethods: {
    onComputer: boolean;
    inCloud: boolean;
  };
}

// Cached settings loader to prevent duplicate database calls  
const loadUserSettingsCached = async (userId: string) => {
  const cacheKey = `user_settings_${userId}`;
  const cached = settingsCache.get(cacheKey);
  
  // Return fresh cached data
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log(`[useUserUIState] ⚡ Using cached settings for user ${userId} (saved DB call!)`);
    return cached.data;
  }
  
  // If there's already a loading request, wait for it
  if (cached?.loading) {
    console.log(`[useUserUIState] Waiting for existing request for user ${userId}`);
    return await cached.loading;
  }
  
  // Make new database call and cache the promise
  console.log(`[useUserUIState] Fetching fresh settings for user ${userId}`);
  const loadingPromise = supabase
    .from('users')
    .select('settings')
    .eq('id', userId)
    .single()
    .then(result => {
      // Cache the result
      settingsCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        loading: null
      });
      return result;
    })
    .catch(error => {
      // Remove loading state on error
      settingsCache.delete(cacheKey);
      throw error;
    });
  
  // Cache the loading promise to prevent duplicate requests
  settingsCache.set(cacheKey, {
    data: cached?.data || null,
    timestamp: cached?.timestamp || 0,
    loading: loadingPromise
  });
  
  return await loadingPromise;
};

export function useUserUIState<K extends keyof UISettings>(
  key: K,
  fallback: UISettings[K]
) {
  const [value, setValue] = useState<UISettings[K]>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const userIdRef = useRef<string>();
  const debounceRef = useRef<NodeJS.Timeout>();

  // Helper function to save fallback values to database (preserves all existing settings)
  // This automatically backfills existing users with default values when they first load the app
  // IMPORTANT: Only runs when the key is completely missing from database (undefined)
  // Does NOT override explicit user choices (including both options set to false)
  const saveFallbackToDatabase = async (userId: string, currentSettings: any) => {
    try {
      const currentUI = currentSettings.ui || {};
      
      // Only add the missing key, preserve everything else
      const updatedSettings = {
        ...currentSettings,
        ui: {
          ...currentUI,
          [key]: fallback
        }
      };
      
      // Add timeout to prevent hanging
      const { error } = await Promise.race([
        supabase
          .from('users')
          .update({ settings: updatedSettings })
          .eq('id', userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database save timeout')), 5000)
        )
      ]) as any;
      
      if (error) {
        console.error('[useUserUIState] Error saving fallback to database:', error);
      } else {
        console.log(`[useUserUIState] Successfully saved fallback for key "${key}"`);
        // Invalidate cache so other components see the backfilled values
        const cacheKey = `user_settings_${userId}`;
        settingsCache.delete(cacheKey);
        setValue(fallback); // Update local state after successful save
      }
    } catch (error) {
      console.error('[useUserUIState] Error in saveFallbackToDatabase:', error);
    }
  };

  // Load initial value from database
  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.warn('[useUserUIState] No authenticated user');
          setIsLoading(false);
          return;
        }

        userIdRef.current = user.id;

        const { data, error } = await loadUserSettingsCached(user.id);

        if (error) {
          console.error('[useUserUIState] Error loading settings:', error);
          setIsLoading(false);
          return;
        }

        const uiSettings = data?.settings?.ui;
        const keyValue = uiSettings?.[key];
        
        if (keyValue !== undefined) {
          // Key exists in database - use stored value (even if both options are false)
          setValue(keyValue);
          // Loading successful – debug logs removed
        } else {
          // Key doesn't exist in database - this is an existing user who hasn't set preferences yet
          // Save fallback values to backfill them (only runs when completely empty)
          console.log(`[useUserUIState] No value found for key "${key}", saving fallback to database`);
          setValue(fallback); // Set fallback immediately for responsive UI
          
          // Save to database in background (don't block loading)
          saveFallbackToDatabase(user.id, data?.settings || {}).catch(error => {
            console.error(`[useUserUIState] Failed to save fallback for key "${key}":`, error);
          });
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('[useUserUIState] Error in loadUserSettings:', error);
        setIsLoading(false);
      }
    };

    loadUserSettings();
  }, [key]); // Remove fallback from deps to prevent unnecessary re-runs

  // Debounced update function
  const update = (patch: Partial<UISettings[K]>) => {
    // Immediately update local state for responsive UI
    setValue(prev => ({ ...prev, ...patch }));

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the database write
    debounceRef.current = setTimeout(async () => {
      const userId = userIdRef.current;
      if (!userId) return;

      try {
        // First get current settings to avoid overwriting other UI state
        const { data: currentUser } = await supabase
          .from('users')
          .select('settings')
          .eq('id', userId)
          .single();

        const currentSettings = currentUser?.settings || {};
        const currentUI = currentSettings.ui || {};
        const currentKeyValue = currentUI[key] || fallback;

        // Merge the patch with current value
        const updatedKeyValue = { ...currentKeyValue, ...patch };
        
        // Update the database
        const { error } = await supabase
          .from('users')
          .update({
            settings: {
              ...currentSettings,
              ui: {
                ...currentUI,
                [key]: updatedKeyValue
              }
            }
          })
          .eq('id', userId);

        if (error) {
          console.error('[useUserUIState] Error saving settings:', error);
        } else {
          // Invalidate cache so other components see the update
          const cacheKey = `user_settings_${userId}`;
          settingsCache.delete(cacheKey);
          console.log(`[useUserUIState] Cache invalidated for user ${userId} after update`);
        }
      } catch (error) {
        console.error('[useUserUIState] Error in update:', error);
      }
    }, 200);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return { 
    value, 
    update, 
    isLoading 
  };
} 