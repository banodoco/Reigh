import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Shot } from "@/types/shots";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AspectRatioSelector } from '@/shared/components/AspectRatioSelector';
import { supabase } from '@/integrations/supabase/client';

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
}) => {
  const isMobile = useIsMobile();

  const handleAspectRatioChange = async (newAspectRatio: string) => {
    if (selectedShot?.id) {
      await supabase
        .from('shots')
        .update({ aspect_ratio: newAspectRatio } as any)
        .eq('id', selectedShot.id);
    }
  };

  return (
    <div className="flex-shrink-0 space-y-1 sm:space-y-1 pb-2 sm:pb-1">
      {/* Desktop layout */}
      <div className="hidden sm:flex justify-between items-center gap-y-2 px-2">
        {/* Empty spacer for left side to keep center aligned */}
        <div className="flex-1" />
        
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

      {/* Mobile layout - centered */}
      <div className="sm:hidden space-y-2">
        {/* Shot name with navigation buttons centered */}
        <div className="flex justify-center px-3">
          {isEditingName ? (
            // Hide navigation buttons when editing on mobile too - centered editing controls
            <div className="flex items-center justify-center space-x-2 w-full">
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
            // Show navigation buttons with better spacing on mobile
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
                className={`text-xl font-semibold text-primary truncate text-center px-2 w-[135px] ${onUpdateShotName ? 'cursor-pointer hover:underline' : ''}`}
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
        
        {/* Aspect Ratio Selector below shot name on mobile */}
        {!isEditingName && (
          <div className="flex justify-center px-3">
            <AspectRatioSelector
              value={selectedShot?.aspect_ratio || projectAspectRatio || '16:9'}
              onValueChange={handleAspectRatioChange}
              showVisualizer={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}; 