import { useMemo } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Project } from '@/types/project';

/**
 * Hook to get the currently selected project
 * @returns The currently selected project or null if none is selected
 */
export function useCurrentProject(): Project | null {
  const { projects, selectedProjectId } = useProject();

  const currentProject = useMemo(() => {
    if (!selectedProjectId || !projects.length) {
      return null;
    }
    
    return projects.find(project => project.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  return currentProject;
}
