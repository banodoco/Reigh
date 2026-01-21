import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Film, Loader2, Check } from 'lucide-react';

interface GenerateVideoCTAProps {
  variantName: string;
  onVariantNameChange: (name: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  justQueued: boolean;
  disabled: boolean;
  inputId?: string;
  /** Number of videos that will be generated (for plural text). Defaults to 1. */
  videoCount?: number;
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
  inputId = 'variant-name',
  videoCount = 1,
}) => {
  const isPlural = videoCount >= 2;
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
          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent preserve-case"
        />
      </div>
      
      <Button
        size="lg"
        className={`w-full max-w-md shadow-lg gap-2 h-12 ${justQueued ? 'bg-green-500 hover:bg-green-600' : ''}`}
        onClick={onGenerate}
        disabled={disabled}
      >
        {isGenerating ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : justQueued ? (
          <Check className="w-5 h-5" />
        ) : (
          <Film className="w-5 h-5" />
        )}
        <span className="font-medium text-lg">
          {justQueued
            ? 'Added to queue!'
            : isGenerating
              ? 'Creating Tasks...'
              : isPlural ? 'Generate Videos' : 'Generate Video'}
        </span>
      </Button>
    </div>
  );
};

