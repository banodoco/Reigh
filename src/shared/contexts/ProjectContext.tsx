import React, { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Project } from '@/types/project'; // Added import
import { ProjectUpdate } from '../../../db/schema/schema';
import { UserPreferences } from '@/shared/settings/userPreferences';
import { fetchWithAuth } from '@/lib/api';

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

  // Set up auth state tracking
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Fetch user preferences directly without circular dependency
  const fetchUserPreferences = useCallback(async () => {
    if (!userId) return;
    
    // Skip user preferences in web environment (no backend server)
    const currentEnv = import.meta.env.VITE_APP_ENV?.toLowerCase() || 'web';
    if (currentEnv === 'web') {
      console.log('[ProjectContext] Skipping user preferences fetch in web environment');
      setIsLoadingPreferences(false);
      return;
    }
    
    setIsLoadingPreferences(true);
    try {
      const baseUrl = import.meta.env.VITE_API_TARGET_URL || window.location.origin;
      const params = new URLSearchParams({ toolId: 'user-preferences' });
      
      const response = await fetchWithAuth(`${baseUrl}/api/tool-settings/resolve?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const preferences = await response.json();
        setUserPreferences(preferences);
        userPreferencesRef.current = preferences;
      }
    } catch (error) {
      console.error('Failed to fetch user preferences:', error);
    } finally {
      setIsLoadingPreferences(false);
    }
  }, [userId]);

  // Update user preferences directly
  const updateUserPreferences = useCallback(async (scope: 'user', patch: Partial<UserPreferences>) => {
    if (!userId) return;
    
    // Skip user preferences in web environment (no backend server)
    const currentEnv = import.meta.env.VITE_APP_ENV?.toLowerCase() || 'web';
    if (currentEnv === 'web') {
      console.log('[ProjectContext] Skipping user preferences update in web environment');
      return;
    }
    
    try {
      const baseUrl = import.meta.env.VITE_API_TARGET_URL || window.location.origin;
      
      const response = await fetchWithAuth(`${baseUrl}/api/tool-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          id: userId,
          toolId: 'user-preferences',
          patch,
        }),
      });
      
      if (response.ok) {
        // Update local state
        const newPreferences = { ...userPreferences, ...patch };
        setUserPreferences(newPreferences);
        userPreferencesRef.current = newPreferences;
      }
    } catch (error) {
      console.error('Failed to update user preferences:', error);
    }
  }, [userId, userPreferences]);

  // Fetch preferences when userId changes
  useEffect(() => {
    if (userId) {
      fetchUserPreferences();
    } else {
      setUserPreferences(undefined);
      userPreferencesRef.current = undefined;
    }
  }, [userId, fetchUserPreferences]);

  const fetchProjects = useCallback(async () => {
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
        // Create user record if it doesn't exist
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            name: user.user_metadata?.full_name || user.email || 'Discord User',
            email: user.email
          });
        
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
        .order('name', { ascending: true });

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
        const mappedProject = mapDbProjectToProject(newProject);
        setProjects([mappedProject]);
        setSelectedProjectIdState(mappedProject.id);
        // Save the default project as last opened
        updateUserPreferences('user', { lastOpenedProjectId: mappedProject.id });
      } else {
        const mappedProjects = projectsData.map(mapDbProjectToProject);
        setProjects(mappedProjects);
        
        // Use the last opened project from user settings instead of localStorage
        const lastOpenedProjectId = userPreferences?.lastOpenedProjectId;
        const projectIdToSelect = determineProjectIdToSelect(mappedProjects, null, lastOpenedProjectId);
        setSelectedProjectIdState(projectIdToSelect);
        
        // Save the selected project if it's different from what was stored
        if (projectIdToSelect && projectIdToSelect !== lastOpenedProjectId) {
          updateUserPreferences('user', { lastOpenedProjectId: projectIdToSelect });
        }
      }
    } catch (error: any) {
      console.error('[ProjectContext] Error fetching projects via API:', error);
      toast.error(`Failed to load projects: ${error.message}`);
      setProjects([]);
      setSelectedProjectIdState(null);
    }
    setIsLoadingProjects(false);
  }, [userPreferences?.lastOpenedProjectId, updateUserPreferences]);

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
        // Create user record if it doesn't exist
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            name: user.user_metadata?.full_name || user.email || 'Discord User',
            email: user.email
          });
        
        if (userError) {
          console.error('Failed to create user:', userError);
          // Continue anyway, the user might exist due to race condition
        }
      }

      const { data: newProject, error } = await supabase
        .from('projects')
        .insert({
          name: projectData.name,
          user_id: user.id,
          aspect_ratio: projectData.aspectRatio,
        })
        .select()
        .single();

      if (error) throw error;

      const mappedProject = mapDbProjectToProject(newProject);
      setProjects(prevProjects => [...prevProjects, mappedProject].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedProjectIdState(mappedProject.id);
      
      // Save the new project as last opened in user settings
      updateUserPreferences('user', { lastOpenedProjectId: mappedProject.id });
      
      toast.success(`Project "${mappedProject.name}" created and selected.`);
      return mappedProject;
    } catch (err: any) {
      console.error("[ProjectContext] Exception during project creation via API:", err);
      toast.error(`Failed to create project: ${err.message}`);
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  }, [updateUserPreferences]);

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
      toast.success(`Project "${mappedProject.name}" updated successfully.`);
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

      toast.success('Project deleted successfully.');
      return true;
    } catch (err: any) {
      console.error('[ProjectContext] Exception during project deletion via API:', err);
      toast.error(`Failed to delete project: ${err.message}`);
      return false;
    } finally {
      setIsDeletingProject(false);
    }
  }, [updateUserPreferences]);

  useEffect(() => {
    // Wait for auth and user preferences to be ready before fetching projects
    if (userId && !isLoadingPreferences) {
      const timer = setTimeout(() => {
        fetchProjects();
      }, 100); // Small delay to ensure everything is ready
     
      return () => clearTimeout(timer);
    }
  }, [userId, isLoadingPreferences, fetchProjects]); // Refetch when user changes or preferences finish loading

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