import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useProject } from '@/shared/contexts/ProjectContext';
import { CreateProjectModal } from '@/shared/components/CreateProjectModal';
import { PlusCircle, Settings } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProjectSettingsModal } from '@/shared/components/ProjectSettingsModal';

interface GlobalHeaderProps {
  contentOffsetRight?: number;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({ contentOffsetRight = 0 }) => {
  const { projects, selectedProjectId, setSelectedProjectId, isLoadingProjects } = useProject();
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div 
          className="container flex h-14 max-w-screen-2xl items-center transition-all duration-300 ease-in-out"
          style={{
            paddingRight: `${contentOffsetRight}px`,
          }}
        >
          <div className="mr-4 flex items-center">
            <Link to="/" className="mr-6 flex items-center space-x-2">
              <span className="font-bold sm:inline-block">Reigh</span>
            </Link>
            {isLoadingProjects && projects.length === 0 ? (
              <div className="w-[180px] text-sm text-muted-foreground">Loading projects...</div>
            ) : projects.length === 0 && !isLoadingProjects ? (
              <div className="w-[180px] text-sm text-muted-foreground">No projects found.</div>
            ) : (
              <Select 
                value={selectedProjectId || ''} 
                onValueChange={handleProjectChange}
                disabled={isLoadingProjects || projects.length === 0}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedProjectId && projects.length > 0 && ( 
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsProjectSettingsModalOpen(true)}
                className="ml-2"
                title="Project settings"
                disabled={!selectedProject} 
              >
                <Settings className="h-5 w-5" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsCreateProjectModalOpen(true)} 
              className="ml-2"
              title="Create new project"
            >
              <PlusCircle className="h-5 w-5 text-blue-500" />
            </Button>
          </div>
          <div className="flex flex-1 items-center justify-end space-x-2">
            <Button variant="ghost" onClick={() => alert('Generations clicked (dummy)')}>
              Generations
            </Button>
            <Button asChild variant="ghost">
              <Link to="/shots">Shots</Link>
            </Button>
          </div>
        </div>
      </header>
      <CreateProjectModal 
        isOpen={isCreateProjectModalOpen} 
        onOpenChange={setIsCreateProjectModalOpen} 
      />
      {selectedProject && (
        <ProjectSettingsModal
          isOpen={isProjectSettingsModalOpen}
          onOpenChange={setIsProjectSettingsModalOpen}
          project={selectedProject}
        />
      )}
    </>
  );
}; 