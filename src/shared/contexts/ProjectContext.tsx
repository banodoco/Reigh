import React, { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Project } from '@/types/project'; // Added import
import { UserPreferences } from '@/shared/settings/userPreferences';
import { usePrefetchToolSettings } from '@/shared/hooks/usePrefetchToolSettings';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { useQueryClient } from '@tanstack/react-query';
import { STORAGE_KEYS } from '@/tools/travel-between-images/storageKeys';

// Type for updating projects
interface ProjectUpdate {
  name?: string;
  aspectRatio?: string;
}

interface ProjectContextType {
  projects: Project[];
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  isLoadingProjects: boolean;
  fetchProjects: () => Promise<void>;
  addNewProject: (projectData: { name: string; aspectRatio: string }) => Promise<Project | null>;
  isCreatingProject: boolean;
  updateProject: (projectId: string, updates: ProjectUpdate) => Promise<boolean>;
  isUpdatingProject: boolean;
  deleteProject: (projectId: string) => Promise<boolean>;
  isDeletingProject: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// Dummy User ID is managed server-side and no longer needed here.

// Helper function to create a default shot for a new project
const createDefaultShot = async (projectId: string, initialSettings?: any): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shots')
      .insert({
        name: 'Default Shot',
        project_id: projectId,
        settings: initialSettings || {},
      });
    
    if (error) {
      console.error('[ProjectContext] Failed to create default shot:', error);
      // Don't throw - we don't want to fail project creation if shot creation fails
    }
  } catch (err) {
    console.error('[ProjectContext] Exception creating default shot:', err);
    // Don't throw - we don't want to fail project creation if shot creation fails
  }
};

const determineProjectIdToSelect = (
  projects: Project[],
  preferredId: string | null | undefined,
  lastOpenedId: string | null | undefined
): string | null => {
  if (!projects.length) return null;

  const projectIds = new Set(projects.map(p => p.id));

  if (preferredId && projectIds.has(preferredId)) {
    return preferredId;
  }
  if (lastOpenedId && projectIds.has(lastOpenedId)) {
    return lastOpenedId;
  }
  return projects[0].id;
};

// Helper to convert DB row (snake_case) to our Project interface (camelCase)
const mapDbProjectToProject = (row: any): Project => ({
  id: row.id,
  name: row.name,
  user_id: row.user_id,
  aspectRatio: row.aspect_ratio ?? undefined,
  createdAt: row.created_at ?? undefined,
});

// Helper to sort projects by creation date (newest first)
const sortProjectsByCreatedAt = (projects: Project[]): Project[] => {
  return [...projects].sort((a, b) => {
    // Handle missing createdAt by treating them as oldest
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    // Sort descending (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  // CRITICAL: Log component mount/unmount to detect tab suspension issues
  React.useEffect(() => {
    console.info('[ProjectContext:FastResume] 🚨 ProjectProvider MOUNTED', {
      timestamp: Date.now(),
      visibilityState: document.visibilityState,
      stack: new Error().stack?.split('\n').slice(1, 3)
    });
    
    return () => {
      console.info('[ProjectContext:FastResume] 🚨 ProjectProvider UNMOUNTING', {
        timestamp: Date.now(),
        visibilityState: document.visibilityState,
        stack: new Error().stack?.split('\n').slice(1, 3)
      });
    };
  }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  // CROSS-DEVICE SYNC: Track if we had a localStorage value at startup
  // If not, we'll update selection from server preferences when they load
  const hadLocalStorageValueRef = useRef<boolean>(false);
  const hasAppliedServerPreferencesRef = useRef<boolean>(false);
  
  // FAST RESUME: Try to restore selectedProjectId from localStorage immediately
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
    console.log('[ProjectContext:FastResume] ATTEMPTING localStorage restoration');
    try {
      const stored = localStorage.getItem('lastSelectedProjectId');
      console.log(`[ProjectContext:FastResume] localStorage result: ${stored}`);
      if (stored) {
        console.log(`[ProjectContext:FastResume] Restored selectedProjectId from localStorage: ${stored}`);
        hadLocalStorageValueRef.current = true;
        return stored;
      } else {
        console.log('[ProjectContext:FastResume] No stored selectedProjectId found in localStorage');
        hadLocalStorageValueRef.current = false;
      }
    } catch (e) {
      console.error('[ProjectContext:FastResume] localStorage access failed:', e);
      hadLocalStorageValueRef.current = false;
    }
    console.log('[ProjectContext:FastResume] Falling back to null selectedProjectId');
    return null;
  });
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | undefined>(undefined);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(false);
  const userPreferencesRef = useRef<UserPreferences | undefined>(undefined);

  // [MobileStallFix] Add mobile detection and recovery state
  const isMobileRef = useRef(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  const preferencesTimeoutRef = useRef<NodeJS.Timeout>();
  const projectsTimeoutRef = useRef<NodeJS.Timeout>();

  // Prefetch all tool settings for the currently selected project so that
  // tool pages hydrate instantly without an extra round-trip.
  usePrefetchToolSettings(selectedProjectId);
  
  // [RefLoadingDebug] Monitor project-image-settings cache state globally
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!selectedProjectId) return;
    
    const projectImageSettingsCacheKey = ['toolSettings', 'project-image-settings', selectedProjectId, undefined];
    
    const logCacheState = () => {
      const cachedData = queryClient.getQueryData(projectImageSettingsCacheKey);
      const queryState = queryClient.getQueryState(projectImageSettingsCacheKey);
      
      console.log('[RefLoadingDebug] 🌍 GLOBAL (ProjectProvider) - project-image-settings cache state:', {
        selectedProjectId,
        currentPage: window.location.pathname,
        hasCachedData: !!cachedData,
        referenceCount: (cachedData as any)?.references?.length ?? 0,
        queryState: {
          status: queryState?.status,
          fetchStatus: queryState?.fetchStatus,
          dataUpdatedAt: queryState?.dataUpdatedAt,
          age: queryState?.dataUpdatedAt ? `${Date.now() - queryState.dataUpdatedAt}ms` : 'no-data'
        },
        timestamp: Date.now()
      });
    };
    
    // Log immediately
    logCacheState();
    
    // Also log when the query data changes (prefetch completes)
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] === 'toolSettings' && 
          event?.query?.queryKey?.[1] === 'project-image-settings' &&
          event?.query?.queryKey?.[2] === selectedProjectId) {
        console.log('[RefLoadingDebug] 🔔 Cache updated for project-image-settings');
        logCacheState();
      }
    });
    
    return () => unsubscribe();
  }, [selectedProjectId, queryClient]);

  // [MobileStallFix] Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      if (preferencesTimeoutRef.current) {
        clearTimeout(preferencesTimeoutRef.current);
      }
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
      }
    };
  }, []);

  // [MobileStallFix] Enhanced auth state tracking with mobile recovery
  // [AuthDebounce] Prevent cascading updates from duplicate auth events
  useEffect(() => {
    let authStateChangeCount = 0;
    let debounceTimeout: NodeJS.Timeout | null = null;
    let lastProcessedState: { event: string; userId: string | undefined } | null = null;
    let pendingAuthState: { event: string; session: any } | null = null;

    const processAuthChange = (event: string, session: any) => {
      const currentUserId = session?.user?.id;
      
      // Check if this is a meaningful state transition
      const isDuplicateEvent = lastProcessedState && 
        lastProcessedState.event === event && 
        lastProcessedState.userId === currentUserId;
      
      if (isDuplicateEvent) {
        console.log(`[ProjectContext:MobileDebug] Skipping duplicate auth event: ${event}, userId: ${!!currentUserId}`);
        return;
      }

      console.log(`[ProjectContext:MobileDebug] Processing auth change: ${event}, userId: ${!!currentUserId}`);
      
      // Update user ID
      setUserId(currentUserId);
      
      // [MobileStallFix] Reset preferences loading state on meaningful auth transitions
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && lastProcessedState?.event !== 'SIGNED_IN')) {
        console.log(`[ProjectContext:MobileDebug] Resetting preferences loading state due to meaningful ${event} transition`);
        setIsLoadingPreferences(false);
        if (preferencesTimeoutRef.current) {
          clearTimeout(preferencesTimeoutRef.current);
          preferencesTimeoutRef.current = undefined;
        }
      }
      
      // Track the processed state
      lastProcessedState = { event, userId: currentUserId };
    };

    const handleAuthStateChange = (event: string, session: any) => {
      authStateChangeCount++;
      console.log(`[ProjectContext:MobileDebug] Auth change #${authStateChangeCount}:`, event, !!session?.user?.id);
      
      // Store the latest auth state
      pendingAuthState = { event, session };
      
      // Clear existing debounce timer
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      
      // [AuthDebounce] Wait 150ms for additional auth events before processing
      debounceTimeout = setTimeout(() => {
        if (pendingAuthState) {
          React.startTransition(() => {
            processAuthChange(pendingAuthState!.event, pendingAuthState!.session);
          });
          pendingAuthState = null;
        }
        debounceTimeout = null;
      }, 150);
    };
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log(`[ProjectContext:MobileDebug] Initial session:`, !!session?.user?.id);
      setUserId(session?.user?.id);
      lastProcessedState = { event: 'INITIAL_SESSION', userId: session?.user?.id };
    });

    // Use centralized auth manager instead of direct listener
    const authManager = (window as any).__AUTH_MANAGER__;
    let unsubscribe: (() => void) | null = null;
    
    if (authManager) {
      unsubscribe = authManager.subscribe('ProjectContext', handleAuthStateChange);
    } else {
      // Fallback to direct listener if auth manager not available
      const { data: listener } = supabase.auth.onAuthStateChange(handleAuthStateChange);
      unsubscribe = () => listener.subscription.unsubscribe();
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        // Process final pending state on cleanup if needed
        if (pendingAuthState) {
          processAuthChange(pendingAuthState.event, pendingAuthState.session);
        }
      }
    };
  }, []);

  // [MobileStallFix] Enhanced preferences fetching with timeout and recovery
  const fetchUserPreferences = useCallback(async () => {
    if (!userId) return;

    console.log(`[ProjectContext:MobileDebug] Starting preferences fetch for user: ${userId}`);
    setIsLoadingPreferences(true);

    // [MobileStallFix] Set a safety timeout for mobile networks
    if (preferencesTimeoutRef.current) {
      clearTimeout(preferencesTimeoutRef.current);
    }
    
    preferencesTimeoutRef.current = setTimeout(() => {
      console.warn(`[ProjectContext:MobileDebug] Preferences fetch timeout, forcing recovery`);
      setIsLoadingPreferences(false);
      setUserPreferences({});
      userPreferencesRef.current = {};
    }, isMobileRef.current ? 10000 : 5000); // Longer timeout for mobile

    try {
      // Read the settings JSON for the current user
      const { data, error } = await supabase
        .from('users')
        .select('settings')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const preferences = (data?.settings as any)?.['user-preferences'] ?? {};
      console.log(`[ProjectContext:MobileDebug] Preferences loaded successfully`);
      setUserPreferences(preferences);
      userPreferencesRef.current = preferences;
    } catch (error) {
      console.error('[ProjectContext] Failed to fetch user preferences:', error);
      // [MobileStallFix] Set empty preferences on error instead of leaving undefined
      setUserPreferences({});
      userPreferencesRef.current = {};
    } finally {
      if (preferencesTimeoutRef.current) {
        clearTimeout(preferencesTimeoutRef.current);
        preferencesTimeoutRef.current = undefined;
      }
      setIsLoadingPreferences(false);
      console.log(`[ProjectContext:MobileDebug] Preferences loading completed`);
    }
  }, [userId]);

  // Update user preferences directly using the global write queue
  const updateUserPreferences = useCallback(async (_scope: 'user', patch: Partial<UserPreferences>) => {
    if (!userId) return;

    try {
      // Use the global queue - it handles read-modify-write internally
      await updateToolSettingsSupabase({
        scope: 'user',
        id: userId,
        toolId: 'user-preferences',
        patch,
      });

      // Update local state optimistically
      setUserPreferences(prev => {
        const merged = { ...prev, ...patch };
        userPreferencesRef.current = merged;
        return merged;
      });
    } catch (error) {
      console.error('[ProjectContext] Failed to update user preferences:', error);
    }
  }, [userId]);

  // [MobileStallFix] Enhanced preferences effect with proper cleanup
  useEffect(() => {
    if (userId) {
      fetchUserPreferences();
    } else {
      console.log(`[ProjectContext:MobileDebug] No userId, clearing preferences state`);
      setUserPreferences(undefined);
      userPreferencesRef.current = undefined;
      // [MobileStallFix] Critical fix: Reset loading state when no user
      setIsLoadingPreferences(false);
      if (preferencesTimeoutRef.current) {
        clearTimeout(preferencesTimeoutRef.current);
        preferencesTimeoutRef.current = undefined;
      }
      // CROSS-DEVICE SYNC: Reset sync flag so we re-sync on next login
      hasAppliedServerPreferencesRef.current = false;
    }
  }, [userId, fetchUserPreferences]);

  // CROSS-DEVICE SYNC: When preferences load on a new device (no localStorage),
  // update the selected project to match the server's lastOpenedProjectId
  useEffect(() => {
    // Skip if we had a localStorage value - it takes priority for fast resume
    if (hadLocalStorageValueRef.current) {
      return;
    }
    
    // Skip if we already applied server preferences this session
    if (hasAppliedServerPreferencesRef.current) {
      return;
    }
    
    // Wait for preferences to finish loading
    if (isLoadingPreferences || !userPreferences) {
      return;
    }
    
    // Wait for projects to be loaded
    if (!projects.length) {
      return;
    }
    
    const serverLastOpenedId = userPreferences.lastOpenedProjectId;
    console.log('[ProjectContext:CrossDeviceSync] Checking server preferences', {
      serverLastOpenedId,
      currentSelectedId: selectedProjectId,
      hadLocalStorageValue: hadLocalStorageValueRef.current,
    });
    
    // If server has a different project selected, switch to it
    if (serverLastOpenedId && serverLastOpenedId !== selectedProjectId) {
      const projectExists = projects.some(p => p.id === serverLastOpenedId);
      if (projectExists) {
        console.log(`[ProjectContext:CrossDeviceSync] Syncing to server preference: ${serverLastOpenedId}`);
        setSelectedProjectIdState(serverLastOpenedId);
        // Also save to localStorage so future loads on this device are fast
        try {
          localStorage.setItem('lastSelectedProjectId', serverLastOpenedId);
        } catch (e) {
          console.error('[ProjectContext:CrossDeviceSync] Failed to save to localStorage:', e);
        }
      } else {
        console.log(`[ProjectContext:CrossDeviceSync] Server project ${serverLastOpenedId} not found in user's projects`);
      }
    }
    
    // Mark that we've applied server preferences (don't do it again this session)
    hasAppliedServerPreferencesRef.current = true;
  }, [isLoadingPreferences, userPreferences, projects, selectedProjectId]);

  const handleSetSelectedProjectId = useCallback((projectId: string | null) => {
    console.info('[TabReactivation] 🔥 SELECTED PROJECT ID CHANGING', {
      from: selectedProjectId,
      to: projectId,
      visibilityState: document.visibilityState,
      timestamp: Date.now(),
      stack: new Error().stack?.split('\n').slice(1, 4)
    });
    
    setSelectedProjectIdState(projectId);
    
    // FAST RESUME: Save to localStorage immediately for fast tab resume
    if (projectId) {
      try {
        localStorage.setItem('lastSelectedProjectId', projectId);
        console.log(`[ProjectContext:FastResume] Saved selectedProjectId to localStorage: ${projectId}`);
        console.log(`[ProjectContext:FastResume] Verification - localStorage now contains: ${localStorage.getItem('lastSelectedProjectId')}`);
      } catch (e) {
        console.error(`[ProjectContext:FastResume] Failed to save to localStorage:`, e);
      }
      // Also save to user preferences (slower but persistent across devices)
      updateUserPreferences('user', { lastOpenedProjectId: projectId });
    } else {
      try {
        console.warn(`[ProjectContext:FastResume] REMOVING selectedProjectId from localStorage (projectId is null)`);
        localStorage.removeItem('lastSelectedProjectId');
        console.log(`[ProjectContext:FastResume] Verification after removal - localStorage now contains: ${localStorage.getItem('lastSelectedProjectId')}`);
      } catch (e) {
        console.error(`[ProjectContext:FastResume] Failed to remove from localStorage:`, e);
      }
      updateUserPreferences('user', { lastOpenedProjectId: undefined });
    }
  }, [updateUserPreferences, selectedProjectId]);

  const fetchProjects = useCallback(async () => {
    console.log(`[ProjectContext:MobileDebug] Starting projects fetch`);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Ensure user exists in our users table first
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingUser) {
        // Create user record using the secure function
        const { error: userError } = await supabase
          .rpc('create_user_record_if_not_exists');
        
        if (userError) {
          console.error('Failed to create user:', userError);
          // Continue anyway, the user might exist due to race condition
        }
      }

      // Fetch projects for the user
      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Create default project if none exist
      if (!projectsData || projectsData.length === 0) {
        const { data: newProject, error: createError } = await supabase
          .from('projects')
          .insert({
            name: 'Default Project',
            user_id: user.id,
            aspect_ratio: '16:9',
          })
          .select()
          .single();

        if (createError) throw createError;
        
        // Create default shot for the new project
        await createDefaultShot(newProject.id);
        
        const mappedProject = mapDbProjectToProject(newProject);
        setProjects([mappedProject]);
        // FIXED: Use handleSetSelectedProjectId to ensure localStorage is saved
        console.log(`[ProjectContext:FastResume] Setting default project: ${mappedProject.id}`);
        handleSetSelectedProjectId(mappedProject.id);
      } else {
        const mappedProjects = projectsData.map(mapDbProjectToProject);
        setProjects(mappedProjects);
        
        // Prefer the currently selected project if it's still present; otherwise fall back to user prefs, else newest
        const lastOpenedProjectId = userPreferencesRef.current?.lastOpenedProjectId;
        const projectIdToSelect = determineProjectIdToSelect(mappedProjects, selectedProjectId, lastOpenedProjectId);
        
        // Only update if it actually changes to avoid clobbering a valid selection and redundant writes
        if (projectIdToSelect !== selectedProjectId) {
          console.log(`[ProjectContext:FastResume] Setting selected project (resolved): ${projectIdToSelect}`);
          handleSetSelectedProjectId(projectIdToSelect);
        } else {
          console.log(`[ProjectContext:FastResume] Preserving current selected project: ${selectedProjectId}`);
        }
      }
      console.log(`[ProjectContext:MobileDebug] Projects loaded successfully`);
    } catch (error: any) {
      console.error('[ProjectContext] Error fetching projects via API:', {
        error,
        errorMessage: error?.message,
        errorStack: error?.stack?.split('\n').slice(0, 3),
        userId,
        isLoadingPreferences,
        visibilityState: document.visibilityState,
        timestamp: Date.now(),
        criticalNote: 'This error was previously clearing selectedProjectId - now preserved!'
      });
      toast.error(`Failed to load projects: ${error.message}`);
      setProjects([]);
      // CRITICAL FIX: DO NOT clear selectedProjectId on fetch error!
      // This was causing localStorage to be wiped and all queries to be disabled
      // The selectedProjectId should persist even if project fetching fails
      // setSelectedProjectIdState(null); // ← REMOVED: This was the root cause!
    } finally {
      // Clear timeout when fetch completes (success or error)
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
        projectsTimeoutRef.current = undefined;
      }
      setIsLoadingProjects(false);
    }
  }, [updateUserPreferences, selectedProjectId, handleSetSelectedProjectId]);

  const addNewProject = useCallback(async (projectData: { name: string; aspectRatio: string }) => {
    if (!projectData.name.trim()) {
      toast.error("Project name cannot be empty.");
      return null;
    }
    if (!projectData.aspectRatio) {
      toast.error("Aspect ratio cannot be empty.");
      return null;
    }
    setIsCreatingProject(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Ensure user exists in our users table first
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingUser) {
        // Create user record using the secure function
        const { error: userError } = await supabase
          .rpc('create_user_record_if_not_exists');
        
        if (userError) {
          console.error('Failed to create user:', userError);
          // Continue anyway, the user might exist due to race condition
        }
      }

      // Get settings from the current project to copy to the new project
      // See src/shared/constants/settingsInheritance.ts for full documentation of what inherits
      let settingsToInherit = {};
      if (selectedProjectId) {
        try {
          const { data: currentProjectData } = await supabase
            .from('projects')
            .select('settings')
            .eq('id', selectedProjectId)
            .single();
          
          if (currentProjectData?.settings) {
            // Filter out content fields (prompts, references) while keeping configuration
            // INHERITANCE POLICY: Content data doesn't inherit, but configuration settings do
            settingsToInherit = {};
            
            Object.entries(currentProjectData.settings).forEach(([toolId, toolSettings]) => {
              if (typeof toolSettings === 'object' && toolSettings !== null) {
                // Create a copy of tool settings excluding prompts, references, and AI generation details
                const filteredToolSettings = { ...toolSettings } as any;
                
                // Remove prompt-related keys
                delete filteredToolSettings.promptsByShot;
                delete filteredToolSettings.batchVideoPrompt;
                delete filteredToolSettings.prompts;
                delete filteredToolSettings.beforeEachPromptText;
                delete filteredToolSettings.afterEachPromptText;
                delete filteredToolSettings.pairConfigs; // These often contain prompts
                
                // Remove reference-related keys (shouldn't carry over between projects)
                delete filteredToolSettings.references;
                delete filteredToolSettings.selectedReferenceId;
                delete filteredToolSettings.selectedReferenceIdByShot;
                delete filteredToolSettings.styleReferenceImage;
                delete filteredToolSettings.styleReferenceImageOriginal;
                delete filteredToolSettings.styleReferenceStrength;
                delete filteredToolSettings.subjectStrength;
                delete filteredToolSettings.subjectDescription;
                delete filteredToolSettings.inThisScene;
                
                // Remove prompt-editor specific AI settings that should not be inherited
                delete filteredToolSettings.generationSettings;
                delete filteredToolSettings.bulkEditSettings;
                delete filteredToolSettings.activeTab;
                
                // Also filter out any keys that contain "prompt" or "reference" in their name (case-insensitive)
                Object.keys(filteredToolSettings).forEach(key => {
                  const lowerKey = key.toLowerCase();
                  if (lowerKey.includes('prompt') || lowerKey.includes('reference')) {
                    delete filteredToolSettings[key];
                  }
                });
                
                // Only include the tool settings if there's still something left after filtering
                if (Object.keys(filteredToolSettings).length > 0) {
                  settingsToInherit[toolId] = filteredToolSettings;
                }
              }
            });
            
            console.log('[ProjectContext] Copying settings from current project to new project (excluding prompts and references):', {
              sourceProjectId: selectedProjectId,
              originalToolCount: Object.keys(currentProjectData.settings).length,
              filteredToolCount: Object.keys(settingsToInherit).length,
              settingsKeys: Object.keys(settingsToInherit)
            });
          }
        } catch (settingsError) {
          console.warn('[ProjectContext] Failed to copy settings from current project:', settingsError);
          // Continue with project creation even if settings copy fails
        }
      }

      const { data: newProject, error } = await supabase
        .from('projects')
        .insert({
          name: projectData.name,
          user_id: user.id,
          aspect_ratio: projectData.aspectRatio,
          settings: settingsToInherit, // Copy settings from current project
        })
        .select()
        .single();

      if (error) throw error;

      // Prepare shot settings to inherit (priority: localStorage -> DB -> project settings)
      // NOTE: LoRAs are now part of travel-between-images settings (selectedLoras field)
      let shotSettingsToInherit = {};
      
      // 1. Try to get most recent active shot settings from localStorage (most up-to-date)
      if (selectedProjectId) {
        try {
           const storageKey = STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS(selectedProjectId);
           const storedMain = localStorage.getItem(storageKey);
           
           if (storedMain) {
             const mainSettings = JSON.parse(storedMain);

             shotSettingsToInherit = {
               'travel-between-images': {
                 ...mainSettings,
                 // Scrub content fields for new project (keep selectedLoras)
                 batchVideoPrompt: '',
                 shotImageIds: [],
                 pairConfigs: [],
                 textBeforePrompts: '',
                 textAfterPrompts: ''
               }
             };
             
             console.log('[ProjectContext] 🧬 Inheriting shot settings from localStorage (scrubbed content):', {
               hasSettings: !!mainSettings,
               loraCount: mainSettings.selectedLoras?.length || 0
             });
           }
        } catch (e) {
          console.error('[ProjectContext] Failed to read localStorage for shot inheritance:', e);
        }
      }

      // 2. Fallback: If no localStorage settings, fetch the LATEST SHOT from the DB
      // This ensures cross-device consistency (getting the last saved settings)
      if (selectedProjectId && Object.keys(shotSettingsToInherit).length === 0) {
        try {
          const { data: latestShot } = await supabase
            .from('shots')
            .select('settings')
            .eq('project_id', selectedProjectId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (latestShot?.settings) {
            const shotSettings = latestShot.settings as any;
            if (shotSettings['travel-between-images']) {
              const mainSettings = shotSettings['travel-between-images'] || {};
              
              shotSettingsToInherit = {
                'travel-between-images': {
                  ...mainSettings,
                  // Scrub content fields for new project (keep selectedLoras)
                  batchVideoPrompt: '',
                  shotImageIds: [],
                  pairConfigs: [],
                  textBeforePrompts: '',
                  textAfterPrompts: ''
                }
              };
              console.log('[ProjectContext] 🧬 Inheriting shot settings from LATEST DB SHOT (scrubbed content)', {
                loraCount: mainSettings.selectedLoras?.length || 0
              });
            }
          }
        } catch (err) {
          console.warn('[ProjectContext] Failed to fetch latest shot for inheritance:', err);
        }
      }

      // 3. Fallback: If still no settings, try to use the project-level settings
      if (Object.keys(shotSettingsToInherit).length === 0 && (settingsToInherit as any)['travel-between-images']) {
         shotSettingsToInherit = {
           'travel-between-images': (settingsToInherit as any)['travel-between-images']
         };
         console.log('[ProjectContext] 🧬 Inheriting shot settings from project defaults');
      }

      // Create default shot for the new project with inherited settings
      await createDefaultShot(newProject.id, shotSettingsToInherit);

      const mappedProject = mapDbProjectToProject(newProject);
      setProjects(prevProjects => sortProjectsByCreatedAt([...prevProjects, mappedProject]));
      // Use centralized setter to persist to localStorage and preferences
      handleSetSelectedProjectId(mappedProject.id);
      
      // Save the new project as last opened in user settings (kept for redundancy)
      updateUserPreferences('user', { lastOpenedProjectId: mappedProject.id });

            
      return mappedProject;
    } catch (err: any) {
      console.error("[ProjectContext] Exception during project creation via API:", err);
      toast.error(`Failed to create project: ${err.message}`);
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  }, [updateUserPreferences, selectedProjectId, handleSetSelectedProjectId]);

  const updateProject = useCallback(async (projectId: string, updates: ProjectUpdate): Promise<boolean> => {
    if (!updates.name?.trim() && !updates.aspectRatio) {
      toast.error("No changes to save.");
      return false;
    }
    setIsUpdatingProject(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Convert camelCase updates to snake_case for DB
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.aspectRatio !== undefined) dbUpdates.aspect_ratio = updates.aspectRatio;

      const { data: updatedProject, error } = await supabase
        .from('projects')
        .update(dbUpdates)
        .eq('id', projectId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      const mappedProject = mapDbProjectToProject(updatedProject);

      setProjects(prevProjects => 
        sortProjectsByCreatedAt(
          prevProjects.map(p => p.id === projectId ? mappedProject : p)
        )
      );      
      return true;
    } catch (err: any) {
      console.error("[ProjectContext] Exception during project update via API:", err);
      toast.error(`Failed to update project: ${err.message}`);
      return false;
    } finally {
      setIsUpdatingProject(false);
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    setIsDeletingProject(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user.id);

      if (error) throw error;

      setProjects(prevProjects => {
        const updated = prevProjects.filter(p => p.id !== projectId);
        // Choose next project to select (first alphabetically)
        const nextProjectId = determineProjectIdToSelect(updated, null, null);
        setSelectedProjectIdState(nextProjectId);
        
        // Update user preferences with the new selected project
        if (nextProjectId) {
          updateUserPreferences('user', { lastOpenedProjectId: nextProjectId });
        } else {
          updateUserPreferences('user', { lastOpenedProjectId: undefined });
        }
        
        return updated;
      });

      
      return true;
    } catch (err: any) {
      console.error('[ProjectContext] Exception during project deletion via API:', err);
      toast.error(`Failed to delete project: ${err.message}`);
      return false;
    } finally {
      setIsDeletingProject(false);
    }
  }, [updateUserPreferences]);

  // [MobileStallFix] Enhanced project loading with fallback recovery
  // [PROFILING] Track fetch invocations to detect triple-fetch issue
  const fetchInvocationCountRef = useRef(0);
  const lastFetchReasonRef = useRef<string>('');
  
  useEffect(() => {
    console.log(`[ProjectContext:MobileDebug] Project loading check - userId: ${!!userId}, isLoadingPreferences: ${isLoadingPreferences}`);
    
    // FAST RESUME: Start loading projects as soon as we have userId (don't wait for preferences)
    if (userId) {
      fetchInvocationCountRef.current += 1;
      const reason = `userId=${!!userId}, isLoadingPreferences=${isLoadingPreferences}`;
      
      console.log(`[ProjectContext:Profiling] 📊 fetchProjects invocation #${fetchInvocationCountRef.current}`, {
        reason,
        previousReason: lastFetchReasonRef.current,
        timeSinceMount: Date.now(),
        stack: new Error().stack?.split('\n').slice(2, 5).join('\n')
      });
      
      lastFetchReasonRef.current = reason;
      
      console.log(`[ProjectContext:MobileDebug] Starting project fetch immediately (removed 100ms delay)`);
      // REMOVED: 100ms delay that was causing slow tab resume
      fetchProjects();

      // [MobileStallFix] Set a fallback timeout for projects loading
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
      }

      projectsTimeoutRef.current = setTimeout(() => {
        console.warn(`[ProjectContext:MobileDebug] Projects fetch timeout, forcing recovery attempt`);
        if (isLoadingProjects) {
          // Force retry the fetch without waiting for preferences
          console.log(`[ProjectContext:MobileDebug] Forcing projects fetch retry`);
          fetchProjects();
        }
      }, isMobileRef.current ? 15000 : 10000); // Longer timeout for mobile
     
      return () => {
        // REMOVED: timer cleanup since we removed the setTimeout
        if (projectsTimeoutRef.current) {
          clearTimeout(projectsTimeoutRef.current);
          projectsTimeoutRef.current = undefined;
        }
      };
    } else if (userId && isLoadingPreferences) {
      // [MobileStallFix] Add emergency fallback if preferences get stuck
      const emergencyTimer = setTimeout(() => {
        console.warn(`[ProjectContext:MobileDebug] Emergency fallback: preferences stuck, forcing projects load`);
        if (isLoadingPreferences) {
          setIsLoadingPreferences(false);
          setUserPreferences({});
          userPreferencesRef.current = {};
        }
      }, isMobileRef.current ? 20000 : 15000); // Emergency fallback

      return () => clearTimeout(emergencyTimer);
    }
  }, [userId, isLoadingPreferences, fetchProjects, isLoadingProjects]); // Refetch when user changes or preferences finish loading

  const contextValue = useMemo(
    () => {
      // Ensure all required values are defined
      const value = { 
        projects: projects || [], 
        selectedProjectId, 
        setSelectedProjectId: handleSetSelectedProjectId, 
        isLoadingProjects,
        fetchProjects,
        addNewProject, 
        isCreatingProject,
        updateProject,
        isUpdatingProject,
        deleteProject,
        isDeletingProject
      };
      
      // Defensive check - ensure context value is always valid
      if (!value.setSelectedProjectId || !value.fetchProjects) {
        console.error('[ProjectContext] Context value is missing required functions', {
          hasSetSelectedProjectId: !!value.setSelectedProjectId,
          hasFetchProjects: !!value.fetchProjects,
          stack: new Error().stack
        });
      }
      
      return value;
    },
    [
      projects,
      selectedProjectId,
      handleSetSelectedProjectId,
      isLoadingProjects,
      fetchProjects,
      addNewProject,
      isCreatingProject,
      updateProject,
      isUpdatingProject,
      deleteProject,
      isDeletingProject
    ]
  );

  // Expose context globally for debugging
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__PROJECT_CONTEXT__ = { selectedProjectId, projects };
    }
  }, [selectedProjectId, projects]);

  // Ensure contextValue is always defined before rendering Provider
  if (!contextValue || !contextValue.setSelectedProjectId || !contextValue.fetchProjects) {
    console.error('[ProjectContext] Provider cannot render - contextValue is invalid', {
      contextValue,
      hasSetSelectedProjectId: !!contextValue?.setSelectedProjectId,
      hasFetchProjects: !!contextValue?.fetchProjects
    });
    // Return a minimal provider to prevent the error, but this should never happen
    return (
      <ProjectContext.Provider value={contextValue || {
        projects: [],
        selectedProjectId: null,
        setSelectedProjectId: () => {},
        isLoadingProjects: true,
        fetchProjects: async () => {},
        addNewProject: async () => null,
        isCreatingProject: false,
        updateProject: async () => false,
        isUpdatingProject: false,
        deleteProject: async () => false,
        isDeletingProject: false
      }}>
        {children}
      </ProjectContext.Provider>
    );
  }

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    // Provide more context in the error message for debugging
    const errorMessage = 'useProject must be used within a ProjectProvider. ' +
      'Make sure the component is rendered inside the ProjectProvider tree. ' +
      'Check that the component is not being rendered outside of App.tsx or in an error boundary that is outside the provider.';
    console.error('[ProjectContext]', errorMessage, {
      stack: new Error().stack,
      windowLocation: typeof window !== 'undefined' ? window.location.href : 'N/A'
    });
    throw new Error(errorMessage);
  }
  return context;
}; 