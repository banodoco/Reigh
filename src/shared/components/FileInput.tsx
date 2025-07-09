import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { X, UploadCloud, ImagePlus, VideoIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { cropFilename } from "@/shared/lib/utils";

interface FileInputProps {
  onFileChange: (files: File[]) => void;
  onFileRemove?: () => void;
  acceptTypes?: ('image' | 'video')[];
  label?: string;
  currentFilePreviewUrl?: string | null;
  currentFileName?: string | null;
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
}

const FileInput: React.FC<FileInputProps> = ({
  onFileChange,
  onFileRemove,
  acceptTypes = ['image'],
  label = "Input File(s)",
  currentFilePreviewUrl,
  currentFileName,
  className = "",
  disabled = false,
  multiple = false,
}) => {
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const [internalPreviewUrls, setInternalPreviewUrls] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedMimeTypes = acceptTypes
    .map(type => (type === 'image' ? 'image/*' : 'video/*'))
    .join(',');

  useEffect(() => {
    internalPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    setInternalPreviewUrls([]);

    if (internalFiles.length > 0) {
      const newObjectUrls = internalFiles.map(file => URL.createObjectURL(file));
      setInternalPreviewUrls(newObjectUrls);
    }    
    return () => {
      internalPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [internalFiles]);

  const handleFilesSelect = useCallback((fileList: FileList | null) => {
    if (fileList && fileList.length > 0) {
      const filesArray = Array.from(fileList);
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];

      filesArray.forEach(file => {
        const fileType = file.type.split('/')[0];
        if (
          (acceptTypes.includes('image') && fileType === 'image') ||
          (acceptTypes.includes('video') && fileType === 'video')
        ) {
          validFiles.push(file);
        } else {
          invalidFiles.push(file.name);
        }
      });

      if (invalidFiles.length > 0) {
        toast.error(`Invalid file type for: ${invalidFiles.join(', ')}. Accepted: ${acceptTypes.join(' or ')}.`);
      }
      
      if (!multiple && validFiles.length > 1) {
        toast.info("Multiple files selected, but only the first one will be used as 'multiple' is not enabled.");
        setInternalFiles([validFiles[0]]);
        onFileChange([validFiles[0]]);
      } else {
        setInternalFiles(validFiles);
        onFileChange(validFiles);
      }

    } else {
      setInternalFiles([]);
      onFileChange([]);
    }
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }, [acceptTypes, onFileChange, multiple]);

  const handleRemoveAllFiles = useCallback(() => {
    setInternalFiles([]);
    onFileChange([]);
    if (onFileRemove) {
      onFileRemove();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onFileChange, onFileRemove]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelect(event.target.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const displayFiles = internalFiles.length > 0 ? internalFiles : 
                       (currentFileName && currentFilePreviewUrl && !multiple ? [{name: currentFileName, type: currentFilePreviewUrl.startsWith('data:video') ? 'video/mp4' : 'image/png' } as File] : []);
  const displayPreviewUrls = internalFiles.length > 0 ? internalPreviewUrls : 
                             (currentFilePreviewUrl && !multiple ? [currentFilePreviewUrl] : []);

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label htmlFor="file-input-element">{label}</Label>}
      <div
        className={`border-2 border-dashed rounded-md p-6 text-center
                    ${isDraggingOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}
                    ${(disabled || (internalFiles.length > 0 && !multiple)) ? 'cursor-not-allowed bg-muted/50' : 'cursor-pointer hover:border-muted-foreground/50'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !(internalFiles.length > 0 && !multiple) && fileInputRef.current?.click()}
      >
        <Input
          id="file-input-element"
          ref={fileInputRef}
          type="file"
          accept={acceptedMimeTypes}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || (internalFiles.length > 0 && !multiple && !onFileRemove)}
          multiple={multiple}
        />
        {displayFiles.length === 0 && (
          <div className="flex flex-col items-center space-y-2 text-muted-foreground">
            <UploadCloud className="h-10 w-10" />
            <p>Drag & drop or click to upload {multiple ? 'files' : 'a file'}</p>
            <p className="text-xs">
              Accepted: {acceptTypes.join(', ')}
            </p>
          </div>
        )}
        {displayFiles.length > 0 && (
          <div className="relative group space-y-2">
            {displayFiles.length > 1 && (
                <div className="text-sm text-muted-foreground p-2 border rounded-md bg-background">
                    {displayFiles.length} files selected. First file: {cropFilename(displayFiles[0].name)}
                </div>
            )}
            {displayFiles.length === 1 && displayPreviewUrls[0] && (
                displayFiles[0].type.startsWith('image/') ? (
                <img
                    src={displayPreviewUrls[0]}
                    alt={displayFiles[0].name || 'Preview'}
                    className="rounded-md max-h-48 w-auto mx-auto object-contain"
                />
                ) : displayFiles[0].type.startsWith('video/') ? (
                <video
                    src={displayPreviewUrls[0]}
                    controls
                    className="rounded-md max-h-48 w-auto mx-auto"
                >
                    Your browser does not support the video tag.
                </video>
                ) : (
                    <div className="mt-2 border rounded-md p-2 h-32 flex items-center justify-center bg-muted max-w-xs mx-auto">
                        <FileText className="h-8 w-8 text-muted-foreground mr-2" />
                        <p className="text-xs text-muted-foreground truncate" title={displayFiles[0].name}>
                          {cropFilename(displayFiles[0].name)}
                        </p> 
                    </div>
                )
            )}
            
            {!disabled && (
                <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 opacity-70 group-hover:opacity-100 transition-opacity h-7 w-7"
                onClick={(e) => {
                    e.stopPropagation(); 
                    handleRemoveAllFiles();
                }}
                aria-label="Remove all files"
                >
                <X className="h-4 w-4" />
                </Button>
            )}
             {displayFiles.length === 1 && displayFiles[0].name && (
              <p className="text-xs text-muted-foreground mt-1 truncate" title={displayFiles[0].name}>
                {cropFilename(displayFiles[0].name)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileInput; 