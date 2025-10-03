import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Shot } from "@/types/shots";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { AspectRatioSelector } from '@/shared/components/AspectRatioSelector';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface HeaderProps {
  selectedShot: Shot;
  isEditingName: boolean;
  editingName: string;
  isTransitioningFromNameEdit?: boolean;
  onBack: () => void;
  onUpdateShotName?: (newName: string) => void;
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onNameClick: () => void;
  onNameSave: () => void;
  onNameCancel: (e?: React.MouseEvent) => void;
  onNameKeyDown: (e: React.KeyboardEvent) => void;
  onEditingNameChange: (value: string) => void;
  projectAspectRatio?: string;
  projectId?: string;
}

export const Header: React.FC<HeaderProps> = ({
  selectedShot,
  isEditingName,
  editingName,
  isTransitioningFromNameEdit = false,
  onBack,
  onUpdateShotName,
  onPreviousShot,
  onNextShot,
  hasPrevious,
  hasNext,
  onNameClick,
  onNameSave,
  onNameCancel,
  onNameKeyDown,
  onEditingNameChange,
  projectAspectRatio,
  projectId,
}) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const updateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleAspectRatioChange = async (newAspectRatio: string) => {
    if (!selectedShot?.id || !projectId) return;
    
    // Optimistically update ALL shots cache variants (with different maxImagesPerShot values)
    // This ensures both desktop (maxImagesPerShot=0) and mobile (maxImagesPerShot=2) caches are updated
    [0, 2].forEach(maxImages => {
      queryClient.setQueryData(['shots', projectId, maxImages], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((shot: Shot) => 
          shot.id === selectedShot.id 
            ? { ...shot, aspect_ratio: newAspectRatio }
            : shot
        );
      });
    });
    
    // Clear any pending database update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Debounce database update to avoid race conditions with rapid changes
    updateTimeoutRef.current = setTimeout(() => {
      supabase
        .from('shots')
        .update({ aspect_ratio: newAspectRatio } as any)
        .eq('id', selectedShot.id)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to update aspect ratio:', error);
            // Revert on error by invalidating all shots caches
            queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
          }
        });
    }, 300); // Wait 300ms after last change before updating database
  };
  
  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex-shrink-0 space-y-1 sm:space-y-1 pb-2 sm:pb-1">
      {/* Desktop layout */}
      <div className="hidden sm:flex justify-between items-center gap-y-2 px-2">
        {/* Back button on the left */}
        <div className="flex-1 flex justify-start">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onBack}
            className="flex items-center gap-1 border-2"
            title="Back to shots"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>
        </div>
        
        {/* Desktop shot name with navigation buttons - centered */}
        <div className="flex items-center justify-center">
          {isEditingName ? (
            // Hide navigation buttons when editing - only show name editing controls
            <div className="flex items-center space-x-2">
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={(e) => onNameCancel(e)}
                onMouseDown={(e) => e.preventDefault()}
              >
                Cancel
              </Button>
              <Input
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={onNameKeyDown}
                onBlur={onNameSave}
                className="!text-xl font-semibold text-primary h-auto py-2 px-4 w-[200px] border-2 text-center"
                autoFocus
                maxLength={30}
              />
              <Button size="sm" variant="outline" onClick={onNameSave}>
                Save
              </Button>
            </div>
          ) : (
            // Show navigation buttons tightly around the shot name
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPreviousShot}
                disabled={!hasPrevious || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Previous shot"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span 
                className={`text-xl font-semibold text-primary truncate px-4 w-[200px] text-center border-2 border-transparent rounded-md py-2 ${onUpdateShotName ? 'cursor-pointer hover:underline hover:border-border hover:bg-accent/50 transition-all duration-200' : ''}`}
                onClick={onNameClick}
                title={onUpdateShotName ? "Click to edit shot name" : selectedShot?.name || 'Untitled Shot'}
              >
                {selectedShot?.name || 'Untitled Shot'}
              </span>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onNextShot}
                disabled={!hasNext || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Next shot"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Aspect Ratio Selector on the right */}
        <div className="flex-1 flex justify-end">
          <AspectRatioSelector
            value={selectedShot?.aspect_ratio || projectAspectRatio || '16:9'}
            onValueChange={handleAspectRatioChange}
            showVisualizer={true}
          />
        </div>
      </div>

      {/* Mobile layout - all on one row */}
      <div className="sm:hidden">
        {isEditingName ? (
          // Editing mode - centered editing controls
          <div className="flex items-center justify-center space-x-2 px-3">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={(e) => onNameCancel(e)}
              onMouseDown={(e) => e.preventDefault()}
              className="flex-shrink-0"
            >
              Cancel
            </Button>
            <Input
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onKeyDown={onNameKeyDown}
              onBlur={onNameSave}
              className="!text-xl font-semibold text-primary h-auto py-0.5 px-2 flex-1 max-w-[135px] text-center"
              autoFocus
              maxLength={30}
            />
            <Button size="sm" variant="outline" onClick={onNameSave} className="flex-shrink-0">
              Save
            </Button>
          </div>
        ) : (
          // Normal mode - back button, name with chevrons, and aspect ratio all on one row
          <div className="flex items-center justify-between px-3">
            {/* Back button on the left */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onBack}
              className="flex items-center border-2 flex-shrink-0 px-2"
              title="Back to shots"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            {/* Shot name with navigation buttons - tighter spacing */}
            <div className="flex items-center space-x-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPreviousShot}
                disabled={!hasPrevious || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Previous shot"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span 
                className={`text-base font-semibold text-primary truncate text-center px-1 max-w-[100px] ${onUpdateShotName ? 'cursor-pointer hover:underline' : ''}`}
                onClick={onNameClick}
                title={onUpdateShotName ? "Click to edit shot name" : selectedShot?.name || 'Untitled Shot'}
              >
                {selectedShot?.name || 'Untitled Shot'}
              </span>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onNextShot}
                disabled={!hasNext || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Next shot"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Aspect Ratio Selector on the right */}
            <div className="flex-shrink-0">
              <AspectRatioSelector
                value={selectedShot?.aspect_ratio || projectAspectRatio || '16:9'}
                onValueChange={handleAspectRatioChange}
                showVisualizer={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 