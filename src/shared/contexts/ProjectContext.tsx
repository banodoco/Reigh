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
  deleteProject: (projectId: string) => Promise<boolean>;
  isDeletingProject: boolean;
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
            aspect_ratio: '16:9',
          })
          .select()
          .single();

        if (createError) throw createError;
        setProjects([mapDbProjectToProject(newProject)]);
      } else {
        const mappedProjects = projectsData.map(mapDbProjectToProject);
        const storedProjectId = localStorage.getItem('selectedProjectId');
        const projectIdToSelect = determineProjectIdToSelect(mappedProjects, null, storedProjectId);
        setSelectedProjectIdState(projectIdToSelect);
        if (projectIdToSelect) {
            localStorage.setItem('selectedProjectId', projectIdToSelect);
        }
      }

      // Ensure state is set to mapped projects if not already set
      if (projectsData && projectsData.length > 0) {
        setProjects(projectsData.map(mapDbProjectToProject));
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
          aspect_ratio: projectData.aspectRatio,
        })
        .select()
        .single();

      if (error) throw error;

      const mappedProject = mapDbProjectToProject(newProject);
      setProjects(prevProjects => [...prevProjects, mappedProject].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedProjectIdState(mappedProject.id);
      localStorage.setItem('selectedProjectId', mappedProject.id);
      toast.success(`Project "${mappedProject.name}" created and selected.`);
      return mappedProject;
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
  };

  const deleteProject = async (projectId: string): Promise<boolean> => {
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
        if (nextProjectId) {
          localStorage.setItem('selectedProjectId', nextProjectId);
        } else {
          localStorage.removeItem('selectedProjectId');
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
      isUpdatingProject,
      deleteProject,
      isDeletingProject
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