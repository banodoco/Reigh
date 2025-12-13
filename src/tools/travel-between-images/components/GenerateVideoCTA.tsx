import React from 'react';
import { Button } from '@/shared/components/ui/button';

interface GenerateVideoCTAProps {
  variantName: string;
  onVariantNameChange: (name: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  justQueued: boolean;
  disabled: boolean;
  inputId?: string;
}

/**
 * Shared Generate Video CTA component
 * Used in both the original position and floating position
 */
export const GenerateVideoCTA: React.FC<GenerateVideoCTAProps> = ({
  variantName,
  onVariantNameChange,
  onGenerate,
  isGenerating,
  justQueued,
  disabled,
  inputId = 'variant-name'
}) => {
  return (
    <div className="flex flex-col items-center">
      {/* Variant Name Input */}
      <div className="w-full max-w-md mb-4">
        <input
          id={inputId}
          type="text"
          value={variantName}
          onChange={(e) => onVariantNameChange(e.target.value)}
          placeholder="Variant name"
          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>
      
      <Button 
        size="retro-default" 
        className="w-full max-w-md" 
        variant={justQueued ? "success" : "retro"}
        onClick={onGenerate}
        disabled={disabled}
      >
        {justQueued
          ? "Added to queue!"
          : isGenerating 
            ? 'Creating Tasks...' 
            : 'Generate Video'}
      </Button>
    </div>
  );
};

