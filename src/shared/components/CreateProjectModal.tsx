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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useProject } from '@/shared/contexts/ProjectContext';
import { toast } from 'sonner';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { getRandomDummyName } from '../lib/dummyNames';

interface CreateProjectModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const ASPECT_RATIOS = Object.keys(ASPECT_RATIO_TO_RESOLUTION)
    .filter(key => key !== 'Square')
    .map(key => ({
        value: key,
        label: `${key} (${ASPECT_RATIO_TO_RESOLUTION[key]})`
    }));

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onOpenChange }) => {
  const [projectName, setProjectName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const { addNewProject, isCreatingProject, projects, selectedProjectId } = useProject();

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
        className="sm:max-w-[425px]"
        onOpenAutoFocus={(event) => {
          // Prevent auto-focus on mobile devices to avoid triggering the keyboard
          if ('ontouchstart' in window) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Enter a name and select an aspect ratio for your new project. Click create when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="project-name" className="text-right">
              Name
            </Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="col-span-3"
              disabled={isCreatingProject}
              maxLength={30}
              placeholder="Enter project name..."
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="aspect-ratio" className="text-right">
              Aspect Ratio
            </Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={isCreatingProject}>
              <SelectTrigger className="col-span-3" id="aspect-ratio">
                <SelectValue placeholder="Select aspect ratio" />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((ratio) => (
                  <SelectItem key={ratio.value} value={ratio.value}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreatingProject}>
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
      </DialogContent>
    </Dialog>
  );
}; 