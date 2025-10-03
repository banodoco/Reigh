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
import FileInput from '@/shared/components/FileInput';
import { ASPECT_RATIO_TO_RESOLUTION, parseRatio, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { toast } from 'sonner';

export interface DimensionSettings {
  dimensionSource: 'project' | 'firstImage' | 'custom';
  customWidth?: number;
  customHeight?: number;
}

interface CreateShotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (shotName: string, files: File[], dimensionSettings: DimensionSettings) => Promise<void>;
  isLoading?: boolean;
  defaultShotName?: string;
  projectAspectRatio?: string;
}

const CreateShotModal: React.FC<CreateShotModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isLoading, 
  defaultShotName,
  projectAspectRatio 
}) => {
  const [shotName, setShotName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dimensionSource, setDimensionSource] = useState<'project' | 'firstImage' | 'custom'>('project');
  const [customWidth, setCustomWidth] = useState<number | undefined>(undefined);
  const [customHeight, setCustomHeight] = useState<number | undefined>(undefined);
  const isMobile = useIsMobile();
  
  // Modal styling
  const modal = useMediumModal();

  // Get project dimensions for display
  const projectDimensions = projectAspectRatio ? ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio] : undefined;

  const handleSubmit = async () => {
    let finalShotName = shotName.trim();
    if (!finalShotName) {
      finalShotName = defaultShotName || 'Untitled Shot';
    }
    
    try {
      // Process files with cropping if needed
      let processedFiles = files;
      
      if (files.length > 0 && dimensionSource !== 'firstImage') {
        const cropPromises = files.map(async (file, index) => {
          try {
            let targetAspectRatio: number | undefined;
            
            if (dimensionSource === 'project' && projectAspectRatio) {
              // Use project aspect ratio
              targetAspectRatio = parseRatio(projectAspectRatio);
            } else if (dimensionSource === 'custom' && customWidth && customHeight) {
              // Use custom dimensions
              targetAspectRatio = customWidth / customHeight;
            }
            
            if (targetAspectRatio && !isNaN(targetAspectRatio)) {
              const result = await cropImageToProjectAspectRatio(file, targetAspectRatio);
              if (result) {
                return result.croppedFile;
              }
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
      
      // Prepare dimension settings
      const dimensionSettings: DimensionSettings = {
        dimensionSource,
        customWidth: dimensionSource === 'custom' ? customWidth : undefined,
        customHeight: dimensionSource === 'custom' ? customHeight : undefined,
      };
      
      await onSubmit(finalShotName, processedFiles, dimensionSettings);
      // Only clear the form and close if submission was successful
      setShotName('');
      setFiles([]);
      setDimensionSource('project');
      setCustomWidth(undefined);
      setCustomHeight(undefined);
      onClose();
    } catch (error) {
      // Let the parent component handle the error display
      console.error('Shot creation failed:', error);
    }
  };

  const handleClose = () => {
    setShotName('');
    setFiles([]);
    setDimensionSource('project');
    setCustomWidth(undefined);
    setCustomHeight(undefined);
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
            
            {/* Dimension Selection */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-medium">What size would you like to use?</Label>
              
              <div className="space-y-2">
                {/* Project dimensions option */}
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="dimension-project"
                    name="dimension-source"
                    value="project"
                    checked={dimensionSource === 'project'}
                    onChange={(e) => setDimensionSource('project')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <label htmlFor="dimension-project" className="text-sm cursor-pointer">
                    Based on project dimension {projectDimensions ? `(${projectDimensions.replace('x', ' × ')})` : ''}
                  </label>
                </div>
                
                {/* First image option */}
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="dimension-first-image"
                    name="dimension-source"
                    value="firstImage"
                    checked={dimensionSource === 'firstImage'}
                    onChange={(e) => setDimensionSource('firstImage')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <label htmlFor="dimension-first-image" className="text-sm cursor-pointer">
                    Based on first image
                  </label>
                </div>
                
                {/* Custom option */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="dimension-custom"
                      name="dimension-source"
                      value="custom"
                      checked={dimensionSource === 'custom'}
                      onChange={(e) => setDimensionSource('custom')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <label htmlFor="dimension-custom" className="text-sm cursor-pointer">
                      Custom
                    </label>
                  </div>
                  
                  {dimensionSource === 'custom' && (
                    <div className={`ml-6 flex items-center gap-2 ${modal.isMobile ? 'flex-col items-start' : ''}`}>
                      <Input
                        type="number"
                        placeholder="Width"
                        value={customWidth || ''}
                        onChange={(e) => setCustomWidth(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-24"
                        min="1"
                      />
                      <span className="text-sm text-muted-foreground">×</span>
                      <Input
                        type="number"
                        placeholder="Height"
                        value={customHeight || ''}
                        onChange={(e) => setCustomHeight(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-24"
                        min="1"
                      />
                    </div>
                  )}
                </div>
              </div>
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