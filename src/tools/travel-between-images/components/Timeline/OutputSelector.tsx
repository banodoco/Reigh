/**
 * OutputSelector - Dropdown for switching between parent generations
 * 
 * Shows when there are multiple "runs" (parent generations) for a shot,
 * allowing the user to switch between them.
 */

import React from 'react';
import { Check, ChevronDown, Film, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { GenerationRow } from '@/types/shots';
import { formatDistanceToNow } from 'date-fns';

interface OutputSelectorProps {
  parentGenerations: GenerationRow[];
  selectedParentId: string | null;
  onSelect: (id: string) => void;
  segmentProgress: { completed: number; total: number };
  className?: string;
}

export const OutputSelector: React.FC<OutputSelectorProps> = ({
  parentGenerations,
  selectedParentId,
  onSelect,
  segmentProgress,
  className = '',
}) => {
  // Don't render if no parents or only one
  if (parentGenerations.length <= 1) {
    // Still show progress for single output
    if (parentGenerations.length === 1 && segmentProgress.total > 0) {
      return (
        <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
          {segmentProgress.completed === segmentProgress.total ? (
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-500" />
              {segmentProgress.total} {segmentProgress.total === 1 ? 'segment' : 'segments'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              {segmentProgress.completed}/{segmentProgress.total} segments
            </span>
          )}
        </div>
      );
    }
    return null;
  }
  
  const selectedIndex = parentGenerations.findIndex(p => p.id === selectedParentId);
  const selectedParent = parentGenerations.find(p => p.id === selectedParentId);
  
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Select value={selectedParentId || ''} onValueChange={onSelect}>
        <SelectTrigger className="w-auto min-w-[180px] h-8 text-sm">
          <Film className="w-4 h-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Select output">
            {selectedParentId && (
              <span>
                Output {selectedIndex + 1} of {parentGenerations.length}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {parentGenerations.map((parent, index) => {
            const createdAt = parent.created_at || parent.createdAt;
            const timeAgo = createdAt ? formatDistanceToNow(new Date(createdAt), { addSuffix: true }) : '';
            const hasOutput = !!parent.location;
            
            return (
              <SelectItem key={parent.id} value={parent.id}>
                <div className="flex items-center gap-2">
                  <span>Output {index + 1}</span>
                  {hasOutput && <Check className="w-3 h-3 text-green-500" />}
                  <span className="text-xs text-muted-foreground">{timeAgo}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      
      {/* Progress indicator */}
      {segmentProgress.total > 0 && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {segmentProgress.completed === segmentProgress.total ? (
            <>
              <Check className="w-4 h-4 text-green-500" />
              <span>{segmentProgress.total} segments</span>
            </>
          ) : (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>{segmentProgress.completed}/{segmentProgress.total}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default OutputSelector;

