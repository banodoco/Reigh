import React, { useState, useEffect } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useMediumModal } from '@/shared/hooks/useModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Checkbox } from '@/shared/components/ui/checkbox';
import FileInput from '@/shared/components/FileInput';
import { parseRatio } from '@/shared/lib/aspectRatios';
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { toast } from 'sonner';
import { AspectRatioSelector } from '@/shared/components/AspectRatioSelector';
import { useProject } from '@/shared/contexts/ProjectContext';

interface CreateShotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (shotName: string, files: File[], aspectRatio: string | null) => Promise<void>;
  isLoading?: boolean;
  defaultShotName?: string;
  projectAspectRatio?: string;
  initialAspectRatio?: string | null;
  projectId?: string;
}

const CreateShotModal: React.FC<CreateShotModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isLoading, 
  defaultShotName,
  projectAspectRatio,
  initialAspectRatio,
  projectId
}) => {
  const [shotName, setShotName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const [updateProjectAspectRatio, setUpdateProjectAspectRatio] = useState(false);
  const isMobile = useIsMobile();
  const { updateProject } = useProject();
  
  // Modal styling
  const modal = useMediumModal();
  
  // Initialize aspect ratio from props when modal opens
  useEffect(() => {
    if (isOpen) {
      // Use initialAspectRatio if provided, otherwise fall back to projectAspectRatio, otherwise default to '3:2'
      setAspectRatio(initialAspectRatio || projectAspectRatio || '3:2');
      setUpdateProjectAspectRatio(false);
    }
  }, [isOpen, initialAspectRatio, projectAspectRatio]);

  // Reset checkbox when aspect ratio changes back to project aspect ratio
  useEffect(() => {
    if (aspectRatio === projectAspectRatio) {
      setUpdateProjectAspectRatio(false);
    }
  }, [aspectRatio, projectAspectRatio]);

  const handleSubmit = async () => {
    let finalShotName = shotName.trim();
    if (!finalShotName) {
      finalShotName = defaultShotName || 'Untitled Shot';
    }
    
    try {
      // Process files with cropping based on aspect ratio
      let processedFiles = files;
      
      if (files.length > 0 && aspectRatio) {
        const targetAspectRatio = parseRatio(aspectRatio);
        
        if (!isNaN(targetAspectRatio)) {
          const cropPromises = files.map(async (file) => {
            try {
              const result = await cropImageToProjectAspectRatio(file, targetAspectRatio);
              if (result) {
                return result.croppedFile;
              }
              return file; // Return original if cropping fails
            } catch (error) {
              console.error(`Failed to crop image ${file.name}:`, error);
              toast.error(`Failed to crop ${file.name}`);
              return file; // Return original on error
            }
          });
          
          processedFiles = await Promise.all(cropPromises);
        }
      }
      
      // Update project aspect ratio if checkbox is checked
      if (updateProjectAspectRatio && projectId && aspectRatio && aspectRatio !== projectAspectRatio) {
        await updateProject(projectId, { aspectRatio });
      }
      
      await onSubmit(finalShotName, processedFiles, aspectRatio || null);
      // Only clear the form and close if submission was successful
      setShotName('');
      setFiles([]);
      setAspectRatio(projectAspectRatio || '3:2');
      setUpdateProjectAspectRatio(false);
      onClose();
    } catch (error) {
      // Let the parent component handle the error display
      console.error('Shot creation failed:', error);
    }
  };

  const handleClose = () => {
    setShotName('');
    setFiles([]);
    setAspectRatio(projectAspectRatio || '3:2');
    setUpdateProjectAspectRatio(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={modal.className}
        style={modal.style}
        {...{...modal.props}}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-4 pt-2 pb-1' : 'px-6 pt-2 pb-1'} flex-shrink-0`}>
            <DialogTitle>New Shot</DialogTitle>
          </DialogHeader>
        </div>
        
        <div className={`flex-shrink-0 ${modal.isMobile ? 'px-4' : 'px-6'}`}>
          <div className="grid gap-3 py-3">
            <div className={`${modal.isMobile ? 'space-y-2' : 'grid grid-cols-4 items-center gap-4'}`}>
              <Label htmlFor="shot-name" className={modal.isMobile ? 'text-left' : 'text-right'}>
                Name
              </Label>
              <Input 
                id="shot-name" 
                value={shotName} 
                onChange={(e) => setShotName(e.target.value)} 
                className={modal.isMobile ? 'w-full' : 'col-span-3'} 
                placeholder={defaultShotName || "e.g., My Awesome Shot"}
                maxLength={30}
              />
            </div>
            <FileInput 
              onFileChange={setFiles}
              multiple
              acceptTypes={['image']}
              label="Starting Images (Optional)"
            />
            
            {/* Aspect Ratio Selection */}
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="shot-aspect-ratio" className="text-sm font-medium">What size would you like to use?</Label>
              <AspectRatioSelector
                value={aspectRatio}
                onValueChange={setAspectRatio}
                disabled={isLoading}
                id="shot-aspect-ratio"
                showVisualizer={true}
              />
              
              {/* Show checkbox when selected aspect ratio differs from project aspect ratio */}
              {aspectRatio && projectAspectRatio && aspectRatio !== projectAspectRatio && (
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="update-project-aspect-ratio"
                    checked={updateProjectAspectRatio}
                    onCheckedChange={(checked) => setUpdateProjectAspectRatio(checked === true)}
                    disabled={isLoading}
                  />
                  <Label
                    htmlFor="update-project-aspect-ratio"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Update project aspect ratio to {aspectRatio}
                  </Label>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className={modal.footerClass}>
          <DialogFooter className={`${modal.isMobile ? 'px-4 pt-4 pb-0 flex-row justify-between' : 'px-6 pt-5 pb-0'} border-t`}>
            <Button variant="outline" onClick={handleClose} disabled={isLoading} className={modal.isMobile ? '' : 'mr-auto'}>
              Cancel
            </Button>
            <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Creating...' : 'New Shot'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateShotModal; 