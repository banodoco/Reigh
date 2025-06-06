import React, { useState, useEffect } from 'react';
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Project } from '@/types/project';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';

// Create the aspect ratio options from the centralized object
const ASPECT_RATIOS = Object.keys(ASPECT_RATIO_TO_RESOLUTION)
    .filter(key => key !== 'Square') // Exclude 'Square' if '1:1' is preferred
    .map(key => ({ value: key, label: key }));

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project: Project | null | undefined;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onOpenChange, project }) => {
  const [projectName, setProjectName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const { updateProject, isUpdatingProject } = useProject(); // Use context hook

  useEffect(() => {
    if (project && isOpen) { // Also check isOpen to re-init when modal re-opens with same project
      setProjectName(project.name);
      setAspectRatio(project.aspectRatio || ASPECT_RATIOS[0].value); // Fallback if aspectRatio is undefined
    } else if (!isOpen) {
      // Optionally reset when modal is closed, or let useEffect handle it if project becomes null
      // setProjectName('');
      // setAspectRatio(ASPECT_RATIOS[0].value);
    }
  }, [project, isOpen]);

  const handleSaveChanges = async () => {
    if (!project) {
      toast.error("No project selected to update.");
      return;
    }

    const updates: { name?: string; aspectRatio?: string } = {};
    let hasChanges = false;

    if (projectName.trim() && projectName.trim() !== project.name) {
      updates.name = projectName.trim();
      hasChanges = true;
    }
    if (aspectRatio && aspectRatio !== project.aspectRatio) {
      updates.aspectRatio = aspectRatio;
      hasChanges = true;
    }

    if (!hasChanges) {
      toast.info("No changes detected.");
      onOpenChange(false);
      return;
    }

    if (!updates.name && !updates.aspectRatio) { // Should be caught by hasChanges, but as a safeguard
        toast.error("Project name cannot be empty if it's the only change.");
        return;
    }
    
    const success = await updateProject(project.id, updates);
    if (success) {
      // Name in toast will be the new name if it was changed, or old name if only aspect ratio changed
      toast.success(`Project "${updates.name || project.name}" updated successfully!`);
      onOpenChange(false);
    } 
    // Errors are handled within updateProject with toasts
  };

  if (!project) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Project Settings: {project.name}</DialogTitle>
          <DialogDescription>
            Update the name and aspect ratio for your project. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="project-name-settings" className="text-right">
              Name
            </Label>
            <Input
              id="project-name-settings"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="col-span-3"
              disabled={isUpdatingProject}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="aspect-ratio-settings" className="text-right">
              Aspect Ratio
            </Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={isUpdatingProject}>
              <SelectTrigger className="col-span-3" id="aspect-ratio-settings">
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdatingProject}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            onClick={handleSaveChanges} 
            disabled={isUpdatingProject || !projectName.trim() || !aspectRatio}
          >
            {isUpdatingProject ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 