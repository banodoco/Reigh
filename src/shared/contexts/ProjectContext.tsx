import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Project } from '@/types/project'; // Added import
import { ProjectUpdate } from '../../../db/schema/schema';

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
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// Dummy User ID is managed server-side and no longer needed here.

const determineProjectIdToSelect = (
  projects: Project[],
  preferredId: string | null | undefined,
  storedId: string | null
): string | null => {
  if (!projects.length) return null;

  const projectIds = new Set(projects.map(p => p.id));

  if (preferredId && projectIds.has(preferredId)) {
    return preferredId;
  }
  if (storedId && projectIds.has(storedId)) {
    return storedId;
  }
  return projects[0].id;
};

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);

  const fetchProjects = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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
            aspect_ratio: '16:9'
          })
          .select()
          .single();

        if (createError) throw createError;
        setProjects([newProject]);
      } else {
        setProjects(projectsData);
      }

      if (projectsData.length > 0) {
        const storedProjectId = localStorage.getItem('selectedProjectId');
        const projectIdToSelect = determineProjectIdToSelect(projectsData, null, storedProjectId);
        setSelectedProjectIdState(projectIdToSelect);
        if (projectIdToSelect) {
            localStorage.setItem('selectedProjectId', projectIdToSelect);
        }
      } else {
        console.warn("API returned no projects, and no default project was provided by the API.");
        setSelectedProjectIdState(null);
      }
    } catch (error: any) {
      console.error('[ProjectContext] Error fetching projects via API:', error);
      toast.error(`Failed to load projects: ${error.message}`);
      setProjects([]);
      setSelectedProjectIdState(null);
    }
    setIsLoadingProjects(false);
  };

  const addNewProject = async (projectData: { name: string; aspectRatio: string }) => {
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

      const { data: newProject, error } = await supabase
        .from('projects')
        .insert({
          name: projectData.name,
          user_id: user.id,
          aspect_ratio: projectData.aspectRatio
        })
        .select()
        .single();

      if (error) throw error;

      setProjects(prevProjects => [...prevProjects, newProject].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedProjectIdState(newProject.id);
      localStorage.setItem('selectedProjectId', newProject.id);
      toast.success(`Project "${newProject.name}" created and selected.`);
      return newProject;
    } catch (err: any) {
      console.error("[ProjectContext] Exception during project creation via API:", err);
      toast.error(`Failed to create project: ${err.message}`);
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  };

  const updateProject = async (projectId: string, updates: ProjectUpdate): Promise<boolean> => {
    if (!updates.name?.trim() && !updates.aspectRatio) {
      toast.error("No changes to save.");
      return false;
    }
    setIsUpdatingProject(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: updatedProject, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      setProjects(prevProjects => 
        prevProjects.map(p => p.id === projectId ? updatedProject : p)
                     .sort((a, b) => a.name.localeCompare(b.name))
      );
      // If the updated project is the currently selected one, ensure its details are fresh (though ID won't change)
      // This is mostly handled by the projects array update triggering re-renders.
      toast.success(`Project "${updatedProject.name}" updated successfully.`);
      return true;
    } catch (err: any) {
      console.error("[ProjectContext] Exception during project update via API:", err);
      toast.error(`Failed to update project: ${err.message}`);
      return false;
    } finally {
      setIsUpdatingProject(false);
    }
  };

  useEffect(() => {
    // Wait a bit for auth to be ready before fetching projects
    const timer = setTimeout(() => {
      fetchProjects();
    }, 500); // Give auth time to complete
   
    return () => clearTimeout(timer);
  }, []); 

  const handleSetSelectedProjectId = (projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    if (projectId) {
      localStorage.setItem('selectedProjectId', projectId);
    } else {
      localStorage.removeItem('selectedProjectId');
    }
  };

  return (
    <ProjectContext.Provider value={{ 
      projects, 
      selectedProjectId, 
      setSelectedProjectId: handleSetSelectedProjectId, 
      isLoadingProjects,
      fetchProjects,
      addNewProject, 
      isCreatingProject,
      updateProject,
      isUpdatingProject
    }}>
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