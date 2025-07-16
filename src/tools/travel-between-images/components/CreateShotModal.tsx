import React, { useState } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
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

  const handleSubmit = async () => {
    let finalShotName = shotName.trim();
    if (!finalShotName) {
      finalShotName = defaultShotName || 'Untitled Shot';
    }
    await onSubmit(finalShotName, files);
    setShotName('');
    setFiles([]);
  };

  const handleClose = () => {
    setShotName('');
    setFiles([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-[425px]"
        onOpenAutoFocus={(event) => {
          if (isMobile) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create New Shot</DialogTitle>
          <DialogDescription>
            Enter a name for your new shot. You can also add starting images.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="shot-name" className="text-right">
              Name
            </Label>
            <Input 
              id="shot-name" 
              value={shotName} 
              onChange={(e) => setShotName(e.target.value)} 
              className="col-span-3" 
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
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Save Shot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateShotModal; 