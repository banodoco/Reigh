import React, { useState } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useMediumModal, createMobileModalProps } from '@/shared/hooks/useMobileModalStyling';
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

interface CreateShotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (shotName: string, files: File[]) => Promise<void>;
  isLoading?: boolean;
  defaultShotName?: string;
}

const CreateShotModal: React.FC<CreateShotModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isLoading, 
  defaultShotName 
}) => {
  const [shotName, setShotName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const isMobile = useIsMobile();
  
  // Mobile modal styling
  const mobileModalStyling = useMediumModal();

  const handleSubmit = async () => {
    let finalShotName = shotName.trim();
    if (!finalShotName) {
      finalShotName = defaultShotName || 'Untitled Shot';
    }
    try {
      await onSubmit(finalShotName, files);
      // Only clear the form and close if submission was successful
      setShotName('');
      setFiles([]);
      onClose();
    } catch (error) {
      // Let the parent component handle the error display
      console.error('Shot creation failed:', error);
    }
  };

  const handleClose = () => {
    setShotName('');
    setFiles([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={mobileModalStyling.fullClassName}
        style={mobileModalStyling.dialogContentStyle}
        {...createMobileModalProps(mobileModalStyling.isMobile)}
      >
        <div className={mobileModalStyling.headerContainerClassName}>
          <DialogHeader className={`${mobileModalStyling.isMobile ? 'px-4 pt-3 pb-1' : 'px-6 pt-3 pb-1'} flex-shrink-0`}>
            <DialogTitle>New Shot</DialogTitle>
          </DialogHeader>
        </div>
        
        <div className={`flex-shrink-0 ${mobileModalStyling.isMobile ? 'px-4' : 'px-6'}`}>
          <div className="grid gap-3 py-3">
            <div className={`${mobileModalStyling.isMobile ? 'space-y-2' : 'grid grid-cols-4 items-center gap-4'}`}>
              <Label htmlFor="shot-name" className={mobileModalStyling.isMobile ? 'text-left' : 'text-right'}>
                Name
              </Label>
              <Input 
                id="shot-name" 
                value={shotName} 
                onChange={(e) => setShotName(e.target.value)} 
                className={mobileModalStyling.isMobile ? 'w-full' : 'col-span-3'} 
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
          </div>
        </div>
        
        <div className={mobileModalStyling.footerContainerClassName}>
          <DialogFooter className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-1 flex-row justify-between' : 'px-6 pt-5 pb-2'} border-t`}>
            <Button variant="outline" onClick={handleClose} disabled={isLoading} className={mobileModalStyling.isMobile ? '' : 'mr-auto'}>
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