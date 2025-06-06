import React, { useState } from 'react';
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
  const [aspectRatio, setAspectRatio] = useState<string>(ASPECT_RATIOS[0].value);
  const { addNewProject, isCreatingProject } = useProject();

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error("Project name cannot be empty.");
      return;
    }
    if (!aspectRatio) {
      toast.error("Please select an aspect ratio.");
      return;
    }
    const newProject = await addNewProject(projectName.trim(), aspectRatio);
    if (newProject) {
      toast.success(`Project "${newProject.name}" created successfully!`);
      setProjectName('');
      setAspectRatio(ASPECT_RATIOS[0].value);
      onOpenChange(false);
    }
    // Errors are handled within addNewProject with toasts
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
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
            disabled={isCreatingProject || !projectName.trim() || !aspectRatio}
          >
            {isCreatingProject ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 