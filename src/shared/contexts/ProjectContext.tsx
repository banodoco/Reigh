import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
// import { supabase } from '@/integrations/supabase/client'; // No longer using direct supabase client for this
// import { db } from '@/lib/db'; // Import Drizzle instance
// import { projects as projectsTable, users as usersTable } from '../../../db/schema/schema'; // Corrected path
// import { eq, and, asc, desc } from 'drizzle-orm'; // Import Drizzle operators
import { toast } from 'sonner';
import { Project } from '@/types/project'; // Added import

// Define the project type - ensure this matches API response structure for projects
// interface Project {  // Removed local definition
//   id: string;
//   name: string;
//   user_id: string; 
//   aspectRatio?: string; 
// }

interface ProjectContextType {
  projects: Project[];
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  isLoadingProjects: boolean;
  fetchProjects: (selectProjectIdAfterFetch?: string | null) => Promise<void>;
  addNewProject: (projectName: string, aspectRatio: string) => Promise<Project | null>;
  isCreatingProject: boolean;
  updateProject: (projectId: string, updates: { name?: string; aspectRatio?: string }) => Promise<boolean>;
  isUpdatingProject: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// Dummy User ID - replace with actual user management later
const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'; // A valid UUID

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);

  const fetchProjects = async (selectProjectIdAfterFetch?: string | null) => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch('/api/projects'); // API call
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const fetchedDataFromApi: any[] = await response.json();

      // Map API response (userId) to client Project type (user_id)
      const mappedProjects: Project[] = fetchedDataFromApi.map(p => ({
        id: p.id,
        name: p.name,
        user_id: p.userId, // Assuming API returns userId
        aspectRatio: p.aspectRatio, // Map aspectRatio from API response
      }));

      // API handles default project creation, so client expects projects array (possibly with default)
      setProjects(mappedProjects);

      if (mappedProjects.length > 0) {
        if (selectProjectIdAfterFetch && mappedProjects.find(p => p.id === selectProjectIdAfterFetch)) {
          setSelectedProjectIdState(selectProjectIdAfterFetch);
          localStorage.setItem('selectedProjectId', selectProjectIdAfterFetch);
        } else {
          const storedProjectId = localStorage.getItem('selectedProjectId');
          if (storedProjectId && mappedProjects.find(p => p.id === storedProjectId)) {
            setSelectedProjectIdState(storedProjectId);
          } else {
            // If no specific project to select, and there are projects, select the first one.
            setSelectedProjectIdState(mappedProjects[0].id);
            localStorage.setItem('selectedProjectId', mappedProjects[0].id);
          }
        }
      } else {
        // This case should ideally not be hit if API guarantees a default project.
        // If it is, means API returned empty array, which is unexpected if default project logic is robust on server.
        console.warn("API returned no projects, and no default project was provided by the API.");
        setSelectedProjectIdState(null);
        // Potentially show a specific message or handle this state if it's possible.
      }

    } catch (error: any) {
      console.error('[ProjectContext] Error fetching projects via API:', error);
      toast.error(`Failed to load projects: ${error.message}`);
      setProjects([]); // Clear projects on error
      setSelectedProjectIdState(null);
    }
    setIsLoadingProjects(false);
  };

  const addNewProject = async (projectName: string, aspectRatio: string): Promise<Project | null> => {
    if (!projectName.trim()) {
      toast.error("Project name cannot be empty.");
      return null;
    }
    if (!aspectRatio) {
        toast.error("Aspect ratio cannot be empty.");
        return null;
    }
    setIsCreatingProject(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim(), aspectRatio: aspectRatio }),
      });

      if (!response.ok) {
        // Try to parse error json, otherwise use statusText
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      const newProjectFromApi: any = await response.json(); // API returns the created project

      // Map API response (user_id from RFC for POST response) to client Project type
      const newProject: Project = {
        id: newProjectFromApi.id,
        name: newProjectFromApi.name,
        user_id: newProjectFromApi.user_id, // POST API returns user_id as per RFC
        aspectRatio: newProjectFromApi.aspectRatio, // Add aspectRatio from API response
      };

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

  const updateProject = async (projectId: string, updates: { name?: string; aspectRatio?: string }): Promise<boolean> => {
    if (!updates.name?.trim() && !updates.aspectRatio) {
      toast.error("No changes to save.");
      return false;
    }
    setIsUpdatingProject(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      const updatedProjectFromApi: Project = await response.json();

      setProjects(prevProjects => 
        prevProjects.map(p => p.id === projectId ? { ...p, ...updatedProjectFromApi } : p)
                     .sort((a, b) => a.name.localeCompare(b.name))
      );
      // If the updated project is the currently selected one, ensure its details are fresh (though ID won't change)
      // This is mostly handled by the projects array update triggering re-renders.
      toast.success(`Project "${updatedProjectFromApi.name}" updated successfully.`);
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
    fetchProjects();
   
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