import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UISettings {
  paneLocks: {
    shots: boolean;
    tasks: boolean;
    gens: boolean;
  };
  settingsModal: {
    activeTab: string;
  };
}

export function useUserUIState<K extends keyof UISettings>(
  key: K,
  fallback: UISettings[K]
) {
  const [value, setValue] = useState<UISettings[K]>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const userIdRef = useRef<string>();
  const debounceRef = useRef<NodeJS.Timeout>();

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

        const { data, error } = await supabase
          .from('users')
          .select('settings')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('[useUserUIState] Error loading settings:', error);
          setIsLoading(false);
          return;
        }

        const uiSettings = data?.settings?.ui;
        const keyValue = uiSettings?.[key];
        
        if (keyValue !== undefined) {
          setValue(keyValue);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('[useUserUIState] Error in loadUserSettings:', error);
        setIsLoading(false);
      }
    };

    loadUserSettings();
  }, [key]);

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
        }
      } catch (error) {
        console.error('[useUserUIState] Error in update:', error);
      }
    }, 400);
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