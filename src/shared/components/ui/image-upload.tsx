
import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageUploadProps {
  onImageSelect: (file: File | null) => void;
  className?: string;
  label?: string;
  existingImage?: string | null;
}

const ImageUpload = ({
  onImageSelect,
  className,
  label = "Upload Image",
  existingImage = null,
}: ImageUploadProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingImage);
  const [isDragging, setIsDragging] = useState(false);

  // Update preview if existingImage prop changes
  useEffect(() => {
    if (existingImage) {
      setPreviewUrl(existingImage);
    }
  }, [existingImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFile(file);
  };

  const handleFile = (file: File | null) => {
    if (file) {
      onImageSelect(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemove = () => {
    onImageSelect(null);
    setPreviewUrl(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFile(file);
  };

  return (
    <div className="space-y-2">
      {label && <div className="text-center font-light">{label}</div>}
      <div
        className={cn(
          "border-2 border-dashed rounded-md flex flex-col items-center justify-center p-4 transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400",
          previewUrl ? "bg-transparent" : "bg-gray-50",
          className
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id="imageUpload"
        />
        <label htmlFor="imageUpload" className="w-full h-full cursor-pointer">
          <div className="flex flex-col items-center justify-center h-full">
            {previewUrl ? (
              <div className="relative w-full">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-auto object-contain max-h-48"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-0 right-0 rounded-full transform translate-x-1/2 -translate-y-1/2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemove();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center p-6">
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">
                  Drag and drop or click to upload
                </p>
              </div>
            )}
          </div>
        </label>
      </div>
    </div>
  );
};

export { ImageUpload };
