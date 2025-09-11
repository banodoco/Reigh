import React, { useState, useEffect } from 'react';
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger, // Will be used in GlobalHeader, not directly here for standalone modal
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useProject } from '@/shared/contexts/ProjectContext';
import { toast } from 'sonner';
import { getRandomDummyName } from '../lib/dummyNames';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useMediumModal, createMobileModalProps } from '@/shared/hooks/useMobileModalStyling';
import { AspectRatioSelector } from '@/shared/components/AspectRatioSelector';

interface CreateProjectModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}


export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onOpenChange }) => {
  const [projectName, setProjectName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const { addNewProject, isCreatingProject, projects, selectedProjectId } = useProject();
  const isMobile = useIsMobile();
  
  // Mobile modal styling
  const mobileModalStyling = useMediumModal();

  // Get current project to use its aspect ratio as default
  const currentProject = projects.find(p => p.id === selectedProjectId);
  
  // Update default aspect ratio when modal opens or current project changes
  useEffect(() => {
    if (isOpen && currentProject?.aspectRatio) {
      setAspectRatio(currentProject.aspectRatio);
    }
  }, [isOpen, currentProject?.aspectRatio]);

  const handleCreateProject = async () => {
    let finalProjectName = projectName.trim();
    // If user didn't enter a name, pick a random dummy name that's not already used
    if (!finalProjectName) {
      const existingNamesLower = projects.map(p => p.name.toLowerCase());

      // Try up to dummy names list length times to find a unique one
      const maxTries = 10;
      let tries = 0;
      let candidateName = '';
      while (tries < maxTries) {
        candidateName = getRandomDummyName();
        if (!existingNamesLower.includes(candidateName.toLowerCase())) {
          break;
        }
        tries++;
      }

      // As a fallback, append a random number to guarantee uniqueness
      if (existingNamesLower.includes(candidateName.toLowerCase())) {
        candidateName = `${candidateName} ${Math.floor(Math.random() * 1000)}`;
      }

      finalProjectName = candidateName;
    }

    if (!aspectRatio) {
      toast.error("Please select an aspect ratio.");
      return;
    }
    try {
      const newProject = await addNewProject({ name: finalProjectName, aspectRatio: aspectRatio });
      if (newProject) {
  
        setProjectName('');
        setAspectRatio(currentProject?.aspectRatio || '16:9');
        onOpenChange(false);
      }
    } catch (error) {
      toast.error("An error occurred while creating the project.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${mobileModalStyling.fullClassName} data-[state=open]:!slide-in-from-top data-[state=open]:!slide-in-from-left-0 data-[state=closed]:!slide-out-to-top data-[state=closed]:!slide-out-to-left-0`}
        style={mobileModalStyling.dialogContentStyle}
        {...createMobileModalProps(mobileModalStyling.isMobile)}
      >
        <div className={mobileModalStyling.headerContainerClassName}>
          <DialogHeader className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'} flex-shrink-0`}>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
        </div>
        
        <div className={`flex-shrink-0 ${mobileModalStyling.isMobile ? 'px-4' : 'px-6'}`}>
          <div className="grid gap-4 py-3">
            <div className={`${mobileModalStyling.isMobile ? 'space-y-2' : 'grid grid-cols-3 items-center gap-6'}`}>
              <Label htmlFor="project-name" className={mobileModalStyling.isMobile ? 'text-left' : 'text-right'}>
                Name
              </Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={mobileModalStyling.isMobile ? 'w-full' : 'col-span-2'}
                disabled={isCreatingProject}
                maxLength={30}
                placeholder="Enter project name..."
              />
            </div>
            <div className={`${mobileModalStyling.isMobile ? 'space-y-2' : 'grid grid-cols-3 items-center gap-6'}`}>
              <Label htmlFor="aspect-ratio" className={mobileModalStyling.isMobile ? 'text-left' : 'text-right'}>
                Aspect Ratio
              </Label>
              <div className={mobileModalStyling.isMobile ? 'w-full' : 'col-span-2'}>
                <AspectRatioSelector
                  value={aspectRatio}
                  onValueChange={setAspectRatio}
                  disabled={isCreatingProject}
                  id="aspect-ratio"
                  showVisualizer={!mobileModalStyling.isMobile}
                  className={mobileModalStyling.isMobile ? 'w-full' : ''}
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className={mobileModalStyling.footerContainerClassName}>
          <DialogFooter className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-1 flex-row justify-between' : 'px-6 pt-5 pb-2'} border-t`}>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreatingProject} className={mobileModalStyling.isMobile ? '' : 'mr-auto'}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              onClick={handleCreateProject} 
              disabled={isCreatingProject || !aspectRatio}
            >
              {isCreatingProject ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 