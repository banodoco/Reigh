import { supabase } from '@/integrations/supabase/client';
import { STORAGE_KEYS } from '@/tools/travel-between-images/storageKeys';

/**
 * Standardized settings inheritance for new shots
 * This ensures ALL shot creation paths use the same inheritance logic
 * 
 * NOTE: LoRAs are now part of mainSettings (selectedLoras field) and are
 * inherited along with all other shot settings. No separate LoRA handling needed.
 * 
 * Join Segments settings are also inherited separately (joinSegmentsSettings)
 * to preserve the user's last Join mode configuration.
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
  uiSettings: any;
  joinSegmentsSettings: any; // Join Segments mode settings
}

/**
 * Gets inherited settings for a new shot
 * Priority: localStorage (last active) → Database (last created) → Project defaults
 * 
 * LoRAs are included in mainSettings.selectedLoras (unified with other settings)
 * Join Segments settings are inherited separately in joinSegmentsSettings
 */
export async function getInheritedSettings(
  params: InheritSettingsParams
): Promise<InheritedSettings> {
  const { projectId, shots } = params;
  
  let mainSettings: any = null;
  let uiSettings: any = null;
  let joinSegmentsSettings: any = null;

  console.warn('[ShotSettingsInherit] 🔍 Starting standardized inheritance check');

  // 1. Try to get from localStorage (most recent active shot) - captures unsaved edits
  try {
    const mainStorageKey = STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS(projectId);
    const stored = localStorage.getItem(mainStorageKey);
    if (stored) {
      mainSettings = JSON.parse(stored);
      console.warn('[ShotSettingsInherit] ✅ Inheriting main settings from project localStorage', {
        prompt: mainSettings.prompt?.substring(0, 20),
        motionMode: mainSettings.motionMode,
        amountOfMotion: mainSettings.amountOfMotion,
        generationMode: mainSettings.generationMode,
        loraCount: mainSettings.loras?.length || 0
      });
    } else {
      console.warn('[ShotSettingsInherit] ⚠️ No main settings in project localStorage');
    }
    
    const uiStorageKey = STORAGE_KEYS.LAST_ACTIVE_UI_SETTINGS(projectId);
    const storedUI = localStorage.getItem(uiStorageKey);
    if (storedUI) {
      uiSettings = JSON.parse(storedUI);
      console.warn('[ShotSettingsInherit] ✅ Inheriting UI settings from project localStorage');
    }
    
    // Join Segments settings
    const joinStorageKey = STORAGE_KEYS.LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS(projectId);
    const storedJoin = localStorage.getItem(joinStorageKey);
    if (storedJoin) {
      joinSegmentsSettings = JSON.parse(storedJoin);
      console.warn('[ShotSettingsInherit] ✅ Inheriting Join Segments settings from project localStorage', {
        generateMode: joinSegmentsSettings.generateMode,
        loraCount: joinSegmentsSettings.selectedLoras?.length || 0
      });
    }
  } catch (e) {
    console.error('[ShotSettingsInherit] ❌ Failed to read project localStorage', e);
  }
  
  // 1b. If no project-specific settings AND this is a new project (no shots), try global fallback
  // This enables cross-project inheritance for the first shot in a new project
  const isNewProject = !shots || shots.length === 0;
  if (!mainSettings && isNewProject) {
    console.warn('[ShotSettingsInherit] 🌍 New project detected, checking global localStorage fallback');
    try {
      const globalStored = localStorage.getItem(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_SHOT_SETTINGS);
      if (globalStored) {
        mainSettings = JSON.parse(globalStored);
        console.warn('[ShotSettingsInherit] ✅ Inheriting main settings from GLOBAL localStorage (cross-project)', {
          prompt: mainSettings.prompt?.substring(0, 20),
          motionMode: mainSettings.motionMode,
          amountOfMotion: mainSettings.amountOfMotion,
          generationMode: mainSettings.generationMode,
          loraCount: mainSettings.loras?.length || 0
        });
      } else {
        console.warn('[ShotSettingsInherit] ⚠️ No global settings in localStorage');
      }
      
      // Also try global Join Segments settings
      if (!joinSegmentsSettings) {
        const globalJoinStored = localStorage.getItem(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS);
        if (globalJoinStored) {
          joinSegmentsSettings = JSON.parse(globalJoinStored);
          console.warn('[ShotSettingsInherit] ✅ Inheriting Join Segments settings from GLOBAL localStorage (cross-project)', {
            generateMode: joinSegmentsSettings.generateMode,
            loraCount: joinSegmentsSettings.selectedLoras?.length || 0
          });
        }
      }
    } catch (e) {
      console.error('[ShotSettingsInherit] ❌ Failed to read global localStorage', e);
    }
  }

  // 2. If not found, fall back to latest created shot from DB
  if ((!mainSettings || !joinSegmentsSettings) && shots && shots.length > 0) {
    console.warn('[ShotSettingsInherit] 🔍 Checking DB fallback', {
      needsMainSettings: !mainSettings,
      needsJoinSettings: !joinSegmentsSettings,
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
        hasJoinSettings: !!latestShot.settings?.['join-segments']
      });
      
      if (!mainSettings && latestShot.settings?.['travel-between-images']) {
        mainSettings = latestShot.settings['travel-between-images'];
        console.warn('[ShotSettingsInherit] ✅ Inheriting main settings from DB shot:', latestShot.name, {
          loraCount: mainSettings.loras?.length || 0
        });
      }
      
      if (!joinSegmentsSettings && latestShot.settings?.['join-segments']) {
        joinSegmentsSettings = latestShot.settings['join-segments'];
        console.warn('[ShotSettingsInherit] ✅ Inheriting Join Segments settings from DB shot:', latestShot.name, {
          generateMode: joinSegmentsSettings.generateMode,
          loraCount: joinSegmentsSettings.selectedLoras?.length || 0
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
    hasUISettings: !!uiSettings,
    hasJoinSettings: !!joinSegmentsSettings,
    generationMode: mainSettings?.generationMode,
    loraCount: mainSettings?.loras?.length || 0,
    joinGenerateMode: joinSegmentsSettings?.generateMode,
    joinLoraCount: joinSegmentsSettings?.selectedLoras?.length || 0
  });

  return {
    mainSettings,
    uiSettings,
    joinSegmentsSettings
  };
}

/**
 * Applies inherited settings to a new shot
 * Saves main settings (including LoRAs) to sessionStorage for useShotSettings to pick up
 * Also saves Join Segments settings to sessionStorage for useJoinSegmentsSettings to pick up
 */
export async function applyInheritedSettings(
  params: InheritSettingsParams,
  inherited: InheritedSettings
): Promise<void> {
  const { newShotId } = params;
  const { mainSettings, uiSettings, joinSegmentsSettings } = inherited;

  // Save main settings to sessionStorage for useShotSettings to pick up
  // LoRAs are included in mainSettings.loras
  if (mainSettings || uiSettings) {
    const defaultsToApply = {
      ...(mainSettings || {}),
      _uiSettings: uiSettings || {},
      // Always start with empty prompt fields for new shots (don't inherit)
      prompt: '',  // Main prompt for video generation
      textBeforePrompts: '',
      textAfterPrompts: '',
      pairConfigs: [],
    };
    const storageKey = STORAGE_KEYS.APPLY_PROJECT_DEFAULTS(newShotId);
    sessionStorage.setItem(storageKey, JSON.stringify(defaultsToApply));

    console.warn('[ShotSettingsInherit] 💾 SAVED TO SESSION STORAGE:', storageKey, {
      length: JSON.stringify(defaultsToApply).length,
      motionMode: defaultsToApply.motionMode,
      amountOfMotion: defaultsToApply.amountOfMotion,
      generationMode: defaultsToApply.generationMode,
      loraCount: defaultsToApply.loras?.length || 0
    });
  } else {
    console.warn('[ShotSettingsInherit] ⚠️ No main settings to save to sessionStorage');
  }
  
  // Save Join Segments settings to sessionStorage for useJoinSegmentsSettings to pick up
  if (joinSegmentsSettings) {
    const joinDefaultsToApply = {
      ...joinSegmentsSettings,
      // Clear prompt for new shots (shot-specific, shouldn't inherit)
      prompt: '',
      negativePrompt: '',
    };
    const joinStorageKey = STORAGE_KEYS.APPLY_JOIN_SEGMENTS_DEFAULTS(newShotId);
    sessionStorage.setItem(joinStorageKey, JSON.stringify(joinDefaultsToApply));
    
    console.warn('[ShotSettingsInherit] 💾 SAVED JOIN SEGMENTS TO SESSION STORAGE:', joinStorageKey, {
      generateMode: joinDefaultsToApply.generateMode,
      loraCount: joinDefaultsToApply.selectedLoras?.length || 0
    });
  }
  
  // NOTE: LoRAs no longer need separate DB save - they're part of mainSettings
  // and will be saved by useShotSettings when it picks up from sessionStorage
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
