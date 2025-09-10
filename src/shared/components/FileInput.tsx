import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { X, UploadCloud, ImagePlus, VideoIcon, FileText, Loader2 } from "lucide-react";
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
  /** Hide the "X files selected" summary header */
  suppressSelectionSummary?: boolean;
  /** Hide the "Remove All Files" action */
  suppressRemoveAll?: boolean;
  /** Show a loader immediately on single-file selection to avoid mid-state flicker */
  showLoaderDuringSingleSelection?: boolean;
  /** Customize loader duration (ms) for single selection */
  loaderDurationMs?: number;
  /** Force loader regardless of internal selection-loading state */
  forceLoading?: boolean;
  /** Hide the "Accepted: image, video" text */
  suppressAcceptedTypes?: boolean;
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
  suppressSelectionSummary = false,
  suppressRemoveAll = false,
  showLoaderDuringSingleSelection = false,
  loaderDurationMs = 600,
  forceLoading = false,
  suppressAcceptedTypes = false,
}) => {
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const [internalPreviewUrls, setInternalPreviewUrls] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSelectionLoading, setIsSelectionLoading] = useState(false);
  const selectionLoadingTimerRef = useRef<number | null>(null);

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
        // Start loading state BEFORE updating files to avoid mid-state flash (opt-in)
        if (showLoaderDuringSingleSelection) {
          setIsSelectionLoading(true);
        }
        setInternalFiles([validFiles[0]]);
        onFileChange([validFiles[0]]);
      } else if (multiple) {
        // For multiple mode, append new files to existing ones
        setInternalFiles(prevFiles => {
          const newFiles = [...prevFiles, ...validFiles];
          onFileChange(newFiles);
          return newFiles;
        });
      } else {
        // Start loading state BEFORE updating files to avoid mid-state flash (opt-in)
        if (showLoaderDuringSingleSelection) {
          setIsSelectionLoading(true);
        }
        setInternalFiles(validFiles);
        onFileChange(validFiles);
      }

      // Keep a brief loading state in single-file mode (opt-in)
      if (showLoaderDuringSingleSelection && !multiple && validFiles.length > 0) {
        if (selectionLoadingTimerRef.current) {
          window.clearTimeout(selectionLoadingTimerRef.current);
        }
        selectionLoadingTimerRef.current = window.setTimeout(() => {
          setIsSelectionLoading(false);
          selectionLoadingTimerRef.current = null;
        }, loaderDurationMs);
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
    setIsSelectionLoading(false);
    if (selectionLoadingTimerRef.current) {
      window.clearTimeout(selectionLoadingTimerRef.current);
      selectionLoadingTimerRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onFileChange, onFileRemove]);

  const handleRemoveFile = useCallback((indexToRemove: number) => {
    setInternalFiles(prevFiles => {
      const newFiles = prevFiles.filter((_, index) => index !== indexToRemove);
      onFileChange(newFiles);
      // If we removed the last file, also invoke onFileRemove and clear input
      if (newFiles.length === 0) {
        if (onFileRemove) onFileRemove();
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
      return newFiles;
    });
    setIsSelectionLoading(false);
    if (selectionLoadingTimerRef.current) {
      window.clearTimeout(selectionLoadingTimerRef.current);
      selectionLoadingTimerRef.current = null;
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
                    ${disabled ? 'cursor-not-allowed bg-muted/50' : 'cursor-pointer hover:border-muted-foreground/50'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <Input
          id="file-input-element"
          ref={fileInputRef}
          type="file"
          accept={acceptedMimeTypes}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
          multiple={multiple}
        />
        {(forceLoading || (showLoaderDuringSingleSelection && !multiple && isSelectionLoading)) ? (
          <div className="flex flex-col items-center space-y-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>Processing file...</p>
          </div>
        ) : (
          <>
            {displayFiles.length === 0 && (
              <div className="flex flex-col items-center space-y-2 text-muted-foreground">
                <UploadCloud className="h-10 w-10" />
                <p>Drag & drop or click to upload {multiple ? 'files' : 'a file'}</p>
                {!suppressAcceptedTypes && (
                  <p className="text-xs">
                    Accepted: {acceptTypes.join(', ')}
                  </p>
                )}
              </div>
            )}
            {displayFiles.length > 0 && (
              <div className="space-y-2">
                {!suppressSelectionSummary && (
                  <div className="text-sm text-muted-foreground p-2 border rounded-md bg-background text-center">
                      {displayFiles.length} file{displayFiles.length === 1 ? '' : 's'} selected
                      {multiple && !disabled && (
                        <span className="block text-xs mt-1 text-primary">
                          <ImagePlus className="inline h-3 w-3 mr-1" />
                          Click or drag to add more
                        </span>
                      )}
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {displayFiles.map((file, index) => (
                        <div key={index} className="relative group">
                            {file.type.startsWith('image/') && displayPreviewUrls[index] ? (
                                <img
                                    src={displayPreviewUrls[index]}
                                    alt={file.name || `Preview ${index + 1}`}
                                    className="w-full h-16 object-cover rounded border"
                                />
                            ) : file.type.startsWith('video/') && displayPreviewUrls[index] ? (
                                <div className="w-full h-16 bg-gray-200 rounded border flex items-center justify-center">
                                    <VideoIcon className="h-6 w-6 text-gray-500" />
                                </div>
                            ) : (
                                <div className="w-full h-16 bg-gray-200 rounded border flex items-center justify-center">
                                    <FileText className="h-6 w-6 text-gray-500" />
                                </div>
                            )}
                            {!disabled && (
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5"
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        handleRemoveFile(index);
                                    }}
                                    aria-label={`Remove ${file.name}`}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 truncate text-center" title={file.name}>
                              {cropFilename(file.name)}
                            </p>
                        </div>
                    ))}
                </div>
                {!suppressRemoveAll && !disabled && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation(); 
                            handleRemoveAllFiles();
                        }}
                        className="w-full"
                    >
                        Remove All Files
                    </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FileInput; 