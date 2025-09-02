import React, { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Project } from '@/types/project'; // Added import
import { UserPreferences } from '@/shared/settings/userPreferences';
import { usePrefetchToolSettings } from '@/shared/hooks/usePrefetchToolSettings';
import { log, time, timeEnd } from '@/shared/lib/logger';

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
const createDefaultShot = async (projectId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shots')
      .insert({
        name: 'Default Shot',
        project_id: projectId,
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
});

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
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
  const projectLoadCheckCountRef = useRef<number>(0);

  // Prefetch all tool settings for the currently selected project so that
  // tool pages hydrate instantly without an extra round-trip.
  usePrefetchToolSettings(selectedProjectId);

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

    const { data: listener } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    return () => {
      listener.subscription.unsubscribe();
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
    time('ProjectContext:Perf', 'preferences:fetch');
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
      time('ProjectContext:Perf', 'preferences:db');
      // Read the settings JSON for the current user
      const { data, error } = await supabase
        .from('users')
        .select('settings')
        .eq('id', userId)
        .single();
      timeEnd('ProjectContext:Perf', 'preferences:db');

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
      timeEnd('ProjectContext:Perf', 'preferences:fetch');
    }
  }, [userId]);

  // Update user preferences directly
  const updateUserPreferences = useCallback(async (_scope: 'user', patch: Partial<UserPreferences>) => {
    if (!userId) return;

    try {
      // Fetch current settings so we don't overwrite unrelated keys
      const { data: currentUser, error: fetchErr } = await supabase
        .from('users')
        .select('settings')
        .eq('id', userId)
        .single();

      if (fetchErr) throw fetchErr;

      const currentSettings = (currentUser?.settings as any) ?? {};
      const existingPrefs = currentSettings['user-preferences'] ?? {};

      const updatedPrefs = { ...existingPrefs, ...patch };
      const newSettings = { ...currentSettings, ['user-preferences']: updatedPrefs };

      const { error: updateErr } = await supabase
        .from('users')
        .update({ settings: newSettings })
        .eq('id', userId);

      if (updateErr) throw updateErr;

      // Update local state if DB update succeeds
      const merged = { ...existingPrefs, ...patch };
      setUserPreferences(merged);
      userPreferencesRef.current = merged;
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
    }
  }, [userId, fetchUserPreferences]);

  const fetchProjects = useCallback(async () => {
    console.log(`[ProjectContext:MobileDebug] Starting projects fetch`);
    time('ProjectContext:Perf', 'projects:fetch');
    try {
      // Get current user
      time('ProjectContext:Perf', 'auth:getUser');
      const { data: { user } } = await supabase.auth.getUser();
      timeEnd('ProjectContext:Perf', 'auth:getUser');
      if (!user) throw new Error('Not authenticated');

      // Ensure user exists in our users table first
      time('ProjectContext:Perf', 'users:exists');
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      timeEnd('ProjectContext:Perf', 'users:exists');

      if (!existingUser) {
        // Create user record using the secure function
        time('ProjectContext:Perf', 'users:create_if_needed');
        const { error: userError } = await supabase
          .rpc('create_user_record_if_not_exists');
        timeEnd('ProjectContext:Perf', 'users:create_if_needed');
        
        if (userError) {
          console.error('Failed to create user:', userError);
          // Continue anyway, the user might exist due to race condition
        }
      }

      // Fetch projects for the user
      time('ProjectContext:Perf', 'projects:db');
      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      timeEnd('ProjectContext:Perf', 'projects:db');

      if (error) throw error;

      // Create default project if none exist
      if (!projectsData || projectsData.length === 0) {
        time('ProjectContext:Perf', 'projects:default_create');
        const { data: newProject, error: createError } = await supabase
          .from('projects')
          .insert({
            name: 'Default Project',
            user_id: user.id,
            aspect_ratio: '16:9',
          })
          .select()
          .single();
        timeEnd('ProjectContext:Perf', 'projects:default_create');

        if (createError) throw createError;
        
        // Create default shot for the new project
        time('ProjectContext:Perf', 'shots:default_create');
        await createDefaultShot(newProject.id);
        timeEnd('ProjectContext:Perf', 'shots:default_create');
        
        const mappedProject = mapDbProjectToProject(newProject);
        setProjects([mappedProject]);
        setSelectedProjectIdState(mappedProject.id);
        // Save the default project as last opened
        time('ProjectContext:Perf', 'preferences:update:lastOpenedProjectId');
        updateUserPreferences('user', { lastOpenedProjectId: mappedProject.id });
        timeEnd('ProjectContext:Perf', 'preferences:update:lastOpenedProjectId');
      } else {
        const mappedProjects = projectsData.map(mapDbProjectToProject);
        setProjects(mappedProjects);
        
        // Use the last opened project from user settings instead of localStorage
        const lastOpenedProjectId = userPreferencesRef.current?.lastOpenedProjectId;
        const projectIdToSelect = determineProjectIdToSelect(mappedProjects, null, lastOpenedProjectId);
        setSelectedProjectIdState(projectIdToSelect);
        
        // Save the selected project if it's different from what was stored
        if (projectIdToSelect && projectIdToSelect !== lastOpenedProjectId) {
          time('ProjectContext:Perf', 'preferences:update:lastOpenedProjectId');
          updateUserPreferences('user', { lastOpenedProjectId: projectIdToSelect });
          timeEnd('ProjectContext:Perf', 'preferences:update:lastOpenedProjectId');
        }
      }
      console.log(`[ProjectContext:MobileDebug] Projects loaded successfully`);
    } catch (error: any) {
      console.error('[ProjectContext] Error fetching projects via API:', error);
      toast.error(`Failed to load projects: ${error.message}`);
      setProjects([]);
      setSelectedProjectIdState(null);
    } finally {
      // Clear timeout when fetch completes (success or error)
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
        projectsTimeoutRef.current = undefined;
      }
      setIsLoadingProjects(false);
      timeEnd('ProjectContext:Perf', 'projects:fetch');
    }
  }, [updateUserPreferences]);

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
      let settingsToInherit = {};
      if (selectedProjectId) {
        try {
          const { data: currentProjectData } = await supabase
            .from('projects')
            .select('settings')
            .eq('id', selectedProjectId)
            .single();
          
          if (currentProjectData?.settings) {
            // Filter out prompt-related settings while keeping everything else
            settingsToInherit = {};
            
            Object.entries(currentProjectData.settings).forEach(([toolId, toolSettings]) => {
              if (typeof toolSettings === 'object' && toolSettings !== null) {
                // Create a copy of tool settings excluding prompts
                const filteredToolSettings = { ...toolSettings } as any;
                
                // Remove prompt-related keys
                delete filteredToolSettings.promptsByShot;
                delete filteredToolSettings.batchVideoPrompt;
                delete filteredToolSettings.prompts;
                delete filteredToolSettings.beforeEachPromptText;
                delete filteredToolSettings.afterEachPromptText;
                delete filteredToolSettings.pairConfigs; // These often contain prompts
                
                // Only include the tool settings if there's still something left after filtering
                if (Object.keys(filteredToolSettings).length > 0) {
                  settingsToInherit[toolId] = filteredToolSettings;
                }
              }
            });
            
            console.log('[ProjectContext] Copying settings from current project to new project (excluding prompts):', {
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

      // Create default shot for the new project
      await createDefaultShot(newProject.id);

      const mappedProject = mapDbProjectToProject(newProject);
      setProjects(prevProjects => [...prevProjects, mappedProject].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedProjectIdState(mappedProject.id);
      
      // Save the new project as last opened in user settings
      updateUserPreferences('user', { lastOpenedProjectId: mappedProject.id });

      if (Object.keys(settingsToInherit).length > 0) {
        toast.success(`Project "${projectData.name}" created with inherited settings!`);
      }
            
      return mappedProject;
    } catch (err: any) {
      console.error("[ProjectContext] Exception during project creation via API:", err);
      toast.error(`Failed to create project: ${err.message}`);
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  }, [updateUserPreferences, selectedProjectId]);

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
        prevProjects.map(p => p.id === projectId ? mappedProject : p)
                     .sort((a, b) => a.name.localeCompare(b.name))
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
  useEffect(() => {
    projectLoadCheckCountRef.current += 1;
    log('PerfDebug:ProjectLoadCheck', {
      count: projectLoadCheckCountRef.current,
      userIdPresent: !!userId,
      isLoadingPreferences,
      isLoadingProjects
    });
    console.log(`[ProjectContext:MobileDebug] Project loading check - userId: ${!!userId}, isLoadingPreferences: ${isLoadingPreferences}`);
    
    // Wait for auth and user preferences to be ready before fetching projects
    if (userId && !isLoadingPreferences && isLoadingProjects) {
      console.log(`[ProjectContext:MobileDebug] Starting project fetch with 100ms delay`);
      
      // Clear any existing timers to prevent overlap
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
        projectsTimeoutRef.current = undefined;
      }
      
      const timer = setTimeout(() => {
        fetchProjects();
      }, 100); // Small delay to ensure everything is ready

      // [MobileStallFix] Set a fallback timeout for projects loading
      projectsTimeoutRef.current = setTimeout(() => {
        console.warn(`[ProjectContext:MobileDebug] Projects fetch timeout, forcing recovery attempt`);
        if (isLoadingProjects) {
          // Force retry the fetch without waiting for preferences
          console.log(`[ProjectContext:MobileDebug] Forcing projects fetch retry`);
          log('PerfDebug:ProjectRecovery', 'Retrying fetchProjects due to timeout');
          fetchProjects();
        }
      }, isMobileRef.current ? 15000 : 10000); // Longer timeout for mobile
     
      return () => {
        clearTimeout(timer);
        if (projectsTimeoutRef.current) {
          clearTimeout(projectsTimeoutRef.current);
          projectsTimeoutRef.current = undefined;
        }
      };
    } else if (userId && isLoadingPreferences) {
      // [MobileStallFix] Add emergency fallback if preferences get stuck
      const emergencyTimer = setTimeout(() => {
        console.warn(`[ProjectContext:MobileDebug] Emergency fallback: preferences stuck, forcing projects load`);
        log('PerfDebug:ProjectRecovery', 'Emergency fallback triggered: preferences stuck');
        if (isLoadingPreferences) {
          setIsLoadingPreferences(false);
          setUserPreferences({});
          userPreferencesRef.current = {};
        }
      }, isMobileRef.current ? 20000 : 15000); // Emergency fallback

      return () => clearTimeout(emergencyTimer);
    }
  }, [userId, isLoadingPreferences]); // Remove isLoadingProjects from deps to prevent loops

  const handleSetSelectedProjectId = useCallback((projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    
    // Save to user settings instead of localStorage
    if (projectId) {
      updateUserPreferences('user', { lastOpenedProjectId: projectId });
    } else {
      updateUserPreferences('user', { lastOpenedProjectId: undefined });
    }
  }, [updateUserPreferences]);

  const contextValue = useMemo(
    () => ({ 
      projects, 
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
    }),
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

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}; 