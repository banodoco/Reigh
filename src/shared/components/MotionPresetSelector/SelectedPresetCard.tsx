import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/shared/components/ui/button';
import { Settings, X } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import type { SelectedPresetCardProps, PresetMetadata } from './types';

// Helper to check if an ID is a built-in preset (not in database)
const isBuiltinPresetId = (id: string | null | undefined): boolean => {
  return !!id && id.startsWith('__builtin');
};

/**
 * Card shown when a non-known preset is selected (from Browse modal).
 * Shows preset info with Change and Edit buttons.
 */
export const SelectedPresetCard: React.FC<SelectedPresetCardProps> = ({
  presetId,
  onSwitchToAdvanced,
  onChangePreset,
  onRemove,
  queryKeyPrefix = 'motion-presets',
}) => {
  // Don't query database for built-in presets (they have __builtin prefix)
  const shouldFetch = !!presetId && !isBuiltinPresetId(presetId);

  // Fetch preset details from database
  const { data: preset, isLoading } = useQuery({
    queryKey: [queryKeyPrefix, 'preset', presetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('id', presetId)
        .single();

      if (error) throw error;
      return data as { id: string; metadata: PresetMetadata };
    },
    enabled: shouldFetch,
  });

  // If it's a builtin preset that somehow got here, just show a simple card
  // (This can happen during mode transitions between I2V and VACE)
  if (isBuiltinPresetId(presetId)) {
    return (
      <div className="relative p-3 border rounded-lg bg-muted/30 border-border">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Default Preset</p>
            <p className="text-xs text-muted-foreground">Switch modes or select a different preset</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onChangePreset}
            className="h-7 text-xs"
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30 animate-pulse">
        <div className="h-4 bg-muted rounded w-24" />
      </div>
    );
  }

  const metadata = preset?.metadata;
  const sampleVideo = metadata?.sample_generations?.find((g) => g.type === 'video');

  return (
    <div className="relative p-3 border rounded-lg bg-primary/10 border-primary/30">
      {/* X button in top-right corner */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 p-1 rounded-full bg-muted border border-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
          title="Remove preset"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <div className="flex items-center gap-3">
        {/* Thumbnail */}
        {sampleVideo && (
          <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
            <HoverScrubVideo
              src={sampleVideo.url}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate preserve-case">
            {metadata?.name || 'Custom Preset'}
          </p>
          {metadata?.description && (
            <p className="text-xs text-muted-foreground truncate">
              {metadata.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onChangePreset}
            className="h-7 text-xs"
          >
            Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSwitchToAdvanced}
            className="h-7 text-xs"
          >
            <Settings className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
};
