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
import { useProject } from '@/shared/contexts/ProjectContext';
import { toast } from 'sonner';
import { Project } from '@/types/project';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useMediumModal } from '@/shared/hooks/useModal';
import { AspectRatioSelector } from '@/shared/components/AspectRatioSelector';


interface ProjectSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project: Project | null | undefined;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onOpenChange, project }) => {
  const isMobile = useIsMobile();
  const modal = useMediumModal();
  const [projectName, setProjectName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string>('');
  // Persistent project-level upload settings
  const { settings: uploadSettings, update: updateUploadSettings, isLoading: isLoadingUploadSettings } = useToolSettings<{ cropToProjectSize?: boolean }>('upload', { projectId: project?.id });

  const [cropToProjectSize, setCropToProjectSize] = useState<boolean>(true);
  const { updateProject, isUpdatingProject, deleteProject, isDeletingProject } = useProject();
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);

  useEffect(() => {
    if (project && isOpen) { // Also check isOpen to re-init when modal re-opens with same project
      setProjectName(project.name);
      setAspectRatio(project.aspectRatio || '16:9'); // Fallback if aspectRatio is undefined
      if (!isLoadingUploadSettings) {
        setCropToProjectSize(uploadSettings?.cropToProjectSize ?? true);
      }
    } else if (!isOpen) {
      // Optionally reset when modal is closed, or let useEffect handle it if project becomes null
      // setProjectName('');
      // setAspectRatio('16:9');
    }
  }, [project, isOpen, uploadSettings, isLoadingUploadSettings]);

  const handleCropToProjectSizeChange = (checked: boolean) => {
    setCropToProjectSize(checked);
    if (project?.id) {
      updateUploadSettings('project', { cropToProjectSize: checked });
    }
  };

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
      onOpenChange(false);
    } 
    // Errors are handled within updateProject with toasts
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    const success = await deleteProject(project.id);
    if (success) {
      onOpenChange(false);
    }
  };

  if (!project) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={modal.className}
        style={modal.style}
        {...{...modal.props}}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-4 pt-2 pb-2' : 'px-6 pt-2 pb-2'} flex-shrink-0`}>
            <DialogTitle>Project Settings</DialogTitle>
          </DialogHeader>
        </div>
        <div className={`${modal.isMobile ? 'px-4' : 'px-6'} flex-1 overflow-y-auto min-h-0`}>
          <div className="grid gap-4 py-3">
            <div className="grid grid-cols-3 items-center gap-6">
              <Label htmlFor="project-name-settings" className="text-left">
                Name
              </Label>
              <Input
                id="project-name-settings"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="col-span-2"
                disabled={isUpdatingProject}
                maxLength={30}
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <Label htmlFor="aspect-ratio-settings" className="text-left">
                Aspect Ratio
              </Label>
              <div className="col-span-2">
                <AspectRatioSelector
                  value={aspectRatio}
                  onValueChange={setAspectRatio}
                  disabled={isUpdatingProject}
                  id="aspect-ratio-settings"
                  showVisualizer={true}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <Label className="text-left">
                Image Upload
              </Label>
              <div className="col-span-2 flex items-center gap-3">
                <div className="w-2/3 flex items-center space-x-2">
                  <Checkbox 
                    id="crop-to-project-size-settings"
                    checked={cropToProjectSize}
                    onCheckedChange={(checked) => handleCropToProjectSizeChange(checked === true)}
                    disabled={isUpdatingProject}
                  />
                  <Label htmlFor="crop-to-project-size-settings" className="text-sm">
                    Crop uploaded images to project size
                  </Label>
                </div>
                <div className="flex-1">
                  {/* Empty space to maintain layout consistency */}
                </div>
              </div>
            </div>
            {/* Danger Zone */}
            <Collapsible open={isDangerZoneOpen} onOpenChange={setIsDangerZoneOpen}>
              <div className="mt-6 border-t pt-4">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-0 h-auto text-left hover:bg-transparent"
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-red-600 font-light">Delete Project</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-red-500 transition-transform ${isDangerZoneOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-4">
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="delete-confirm-input" className="text-sm font-light text-red-900">
                          Type "confirm" to make it clear you wish to delete the project and all associated data.
                        </Label>
                        <Input
                          id="delete-confirm-input"
                          placeholder='Type "confirm" to enable'
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          disabled={isDeletingProject}
                          className="mt-1 border-red-300 focus:border-red-500 focus:ring-red-500"
                        />
                      </div>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteProject}
                        disabled={deleteConfirmText !== 'confirm' || isDeletingProject}
                        className="w-full"
                      >
                        {isDeletingProject ? 'Deleting...' : 'Delete Project Forever'}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </div>
        </div>
        <DialogFooter className={`${modal.isMobile ? 'px-4 pt-4 pb-0 flex-row justify-between' : 'px-6 pt-5 pb-0'} border-t`}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdatingProject} className={modal.isMobile ? '' : 'mr-auto'}>
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