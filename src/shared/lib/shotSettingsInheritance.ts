import { supabase } from '@/integrations/supabase/client';

/**
 * Standardized settings inheritance for new shots
 * This ensures ALL shot creation paths use the same inheritance logic
 */
export interface InheritSettingsParams {
  newShotId: string;
  projectId: string;
  shots?: Array<{
    id: string;
    name: string;
    created_at?: string;
    settings?: Record<string, any>;
  }>;
}

export interface InheritedSettings {
  mainSettings: any;
  loraSettings: any;
  uiSettings: any;
}

/**
 * Gets inherited settings for a new shot
 * Priority: localStorage (last active) → Database (last created) → Project defaults
 */
export async function getInheritedSettings(
  params: InheritSettingsParams
): Promise<InheritedSettings> {
  const { projectId, shots } = params;
  
  let mainSettings: any = null;
  let loraSettings: any = null;
  let uiSettings: any = null;

  console.warn('[ShotSettingsInherit] 🔍 Starting standardized inheritance check');

  // 1. Try to get from localStorage (most recent active shot) - captures unsaved edits
  try {
    const mainStorageKey = `last-active-shot-settings-${projectId}`;
    const stored = localStorage.getItem(mainStorageKey);
    if (stored) {
      mainSettings = JSON.parse(stored);
      console.warn('[ShotSettingsInherit] ✅ Inheriting main settings from localStorage', {
        prompt: mainSettings.batchVideoPrompt?.substring(0, 20),
        motionMode: mainSettings.motionMode,
        amountOfMotion: mainSettings.amountOfMotion
      });
    } else {
      console.warn('[ShotSettingsInherit] ⚠️ No main settings in localStorage');
    }
    
    const loraStorageKey = `last-active-lora-settings-${projectId}`;
    const storedLoras = localStorage.getItem(loraStorageKey);
    if (storedLoras) {
      loraSettings = JSON.parse(storedLoras);
      console.warn('[ShotSettingsInherit] ✅ Inheriting LoRAs from localStorage', {
        loraCount: loraSettings.loras?.length || 0
      });
    } else {
      console.warn('[ShotSettingsInherit] ⚠️ No LoRAs in localStorage');
    }
    
    const uiStorageKey = `last-active-ui-settings-${projectId}`;
    const storedUI = localStorage.getItem(uiStorageKey);
    if (storedUI) {
      uiSettings = JSON.parse(storedUI);
      console.warn('[ShotSettingsInherit] ✅ Inheriting UI settings from localStorage');
    }
  } catch (e) {
    console.error('[ShotSettingsInherit] ❌ Failed to read localStorage', e);
  }

  // 2. If not found, fall back to latest created shot from DB
  if ((!mainSettings || !loraSettings) && shots && shots.length > 0) {
    console.warn('[ShotSettingsInherit] 🔍 Checking DB fallback', {
      needsMainSettings: !mainSettings,
      needsLoras: !loraSettings,
      shotsCount: shots.length
    });
    
    const sortedShots = [...shots].sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
    
    const latestShot = sortedShots[0];
    
    if (latestShot) {
      console.warn('[ShotSettingsInherit] 🔍 Latest shot from DB:', {
        name: latestShot.name,
        hasMainSettings: !!latestShot.settings?.['travel-between-images'],
        hasLoras: !!latestShot.settings?.['travel-loras']
      });
      
      if (!mainSettings && latestShot.settings?.['travel-between-images']) {
        mainSettings = latestShot.settings['travel-between-images'];
        console.warn('[ShotSettingsInherit] ✅ Inheriting main settings from DB shot:', latestShot.name);
      }
      
      if (!loraSettings && latestShot.settings?.['travel-loras']) {
        loraSettings = latestShot.settings['travel-loras'];
        console.warn('[ShotSettingsInherit] ✅ Inheriting LoRAs from DB shot:', {
          loraCount: loraSettings.loras?.length || 0
        });
      }
    }
  }

  // 3. Fetch project-level defaults if still missing
  if (!mainSettings || !uiSettings) {
    console.warn('[ShotSettingsInherit] 🔍 Fetching project defaults from DB');
    try {
      const { data: projectData } = await supabase
        .from('projects')
        .select('settings')
        .eq('id', projectId)
        .single();
      
      if (!mainSettings && projectData?.settings?.['travel-between-images']) {
        mainSettings = projectData.settings['travel-between-images'];
        console.warn('[ShotSettingsInherit] ✅ Using project default settings');
      }
      
      if (!uiSettings && projectData?.settings?.['travel-ui-state']) {
        uiSettings = projectData.settings['travel-ui-state'];
        console.warn('[ShotSettingsInherit] ✅ Using project default UI settings');
      }
    } catch (error) {
      console.error('[ShotSettingsInherit] ❌ Failed to fetch project settings', error);
    }
  }

  console.warn('[ShotSettingsInherit] 📋 Final inherited settings:', {
    hasMainSettings: !!mainSettings,
    hasLoraSettings: !!loraSettings,
    hasUISettings: !!uiSettings
  });

  return {
    mainSettings,
    loraSettings,
    uiSettings
  };
}

/**
 * Applies inherited settings to a new shot
 * Saves main settings to sessionStorage and LoRAs directly to database
 */
export async function applyInheritedSettings(
  params: InheritSettingsParams,
  inherited: InheritedSettings
): Promise<void> {
  const { newShotId } = params;
  const { mainSettings, loraSettings, uiSettings } = inherited;

  // Save main settings to sessionStorage for useShotSettings to pick up
  if (mainSettings || uiSettings) {
    const defaultsToApply = {
      ...(mainSettings || {}),
      _uiSettings: uiSettings || {}
    };
    const storageKey = `apply-project-defaults-${newShotId}`;
    sessionStorage.setItem(storageKey, JSON.stringify(defaultsToApply));
    
    console.warn('[ShotSettingsInherit] 💾 SAVED TO SESSION STORAGE:', storageKey, {
      length: JSON.stringify(defaultsToApply).length,
      motionMode: defaultsToApply.motionMode,
      amountOfMotion: defaultsToApply.amountOfMotion
    });
  } else {
    console.warn('[ShotSettingsInherit] ⚠️ No settings to save to sessionStorage');
  }

  // Save LoRAs directly to database
  if (loraSettings?.loras) {
    console.warn('[ShotSettingsInherit] 💾 Saving LoRAs to database...', {
      shotId: newShotId.substring(0, 8),
      loraCount: loraSettings.loras.length
    });
    
    try {
      const { data: currentShot } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', newShotId)
        .single();
      
      const currentSettings = (currentShot?.settings as any) || {};
      await supabase
        .from('shots')
        .update({
          settings: {
            ...currentSettings,
            'travel-loras': loraSettings
          }
        })
        .eq('id', newShotId);
      
      console.warn('[ShotSettingsInherit] ✅ LoRAs saved to database');
    } catch (error) {
      console.error('[ShotSettingsInherit] ❌ Failed to save LoRAs:', error);
    }
  } else {
    console.warn('[ShotSettingsInherit] ⚠️ No LoRAs to save');
  }
}

/**
 * Complete standardized inheritance flow
 * Call this after creating any new shot
 */
export async function inheritSettingsForNewShot(
  params: InheritSettingsParams
): Promise<void> {
  console.warn('[ShotSettingsInherit] 🎬 Starting standardized inheritance for shot:', params.newShotId.substring(0, 8));
  
  const inherited = await getInheritedSettings(params);
  await applyInheritedSettings(params, inherited);
  
  console.warn('[ShotSettingsInherit] ✅ Standardized inheritance complete');
}

