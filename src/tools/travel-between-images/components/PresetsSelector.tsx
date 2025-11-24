import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Library, Pencil } from 'lucide-react';
import { PhaseConfig } from '../settings';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

interface SelectedPresetCardProps {
  presetId: string;
  phaseConfig?: PhaseConfig;
  onSwitchToAdvanced?: () => void;
}

const SelectedPresetCard: React.FC<SelectedPresetCardProps> = ({ 
  presetId, 
  phaseConfig,
  onSwitchToAdvanced 
}) => {
  // Fetch preset details from database
  const { data: preset, isLoading } = useQuery({
    queryKey: ['preset-details', presetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('id', presetId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!presetId
  });

  if (isLoading || !preset) {
    return (
      <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">Loading preset...</p>
      </Card>
    );
  }

  const metadata = preset.metadata as any;
  const sampleGenerations = metadata?.sample_generations || [];
  const hasVideo = sampleGenerations.some((gen: any) => gen.type === 'video');

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
      <div className="flex gap-4">
        {/* Left side - Name, Description, and Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-base text-blue-900 dark:text-blue-100">
              {metadata?.name || 'Unnamed Preset'}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSwitchToAdvanced}
              className="flex items-center gap-1 flex-shrink-0 text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-900/50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          
          {/* Description Box */}
          {metadata?.description && (
            <div className="mb-3 p-2 rounded border border-blue-200 dark:border-blue-800 bg-white/50 dark:bg-blue-950/50">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {metadata.description}
              </p>
            </div>
          )}
          
          {/* Preset Prompt Settings */}
          {(metadata?.presetPromptPrefix || metadata?.presetPromptSuffix || metadata?.presetBasePrompt || metadata?.presetNegativePrompt) && (
            <div className="mb-3 space-y-2">
              {metadata?.presetPromptPrefix && (
                <div className="p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                    Before Prompt:
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-mono">
                    {metadata.presetPromptPrefix}
                  </p>
                </div>
              )}
              {metadata?.presetPromptSuffix && (
                <div className="p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                    After Prompt:
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-mono">
                    {metadata.presetPromptSuffix}
                  </p>
                </div>
              )}
              {metadata?.presetBasePrompt && (
                <div className="p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                    Base Prompt:
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-mono">
                    {metadata.presetBasePrompt}
                  </p>
                </div>
              )}
              {metadata?.presetNegativePrompt && (
                <div className="p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                    Negative Prompt:
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-mono">
                    {metadata.presetNegativePrompt}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Prompt Enhancement Settings */}
          {(metadata?.presetEnhancePrompt || metadata?.presetAutoCreateIndividualPrompts) && (
            <div className="mb-3 p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30">
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                Prompt Settings:
              </p>
              <div className="flex flex-wrap gap-2">
                {metadata?.presetEnhancePrompt && (
                  <Badge variant="outline" className="text-xs bg-white dark:bg-blue-950">
                    Enhance Prompts
                  </Badge>
                )}
                {metadata?.presetAutoCreateIndividualPrompts && (
                  <Badge variant="outline" className="text-xs bg-white dark:bg-blue-950">
                    Auto-Create Prompts
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          {/* Phase Info */}
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
              {phaseConfig?.num_phases || 2} phases
            </Badge>
          </div>
        </div>
        
        {/* Right side - Video Preview */}
        {hasVideo && (
          <div className="flex-shrink-0 w-32">
            {sampleGenerations
              .filter((gen: any) => gen.type === 'video')
              .slice(0, 1)
              .map((gen: any, idx: number) => (
                <HoverScrubVideo
                  key={idx}
                  src={gen.url}
                  className="w-full h-auto rounded border border-blue-200 dark:border-blue-800"
                />
              ))
            }
          </div>
        )}
      </div>
    </Card>
  );
};

interface PresetsSelectorProps {
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: any) => void;
  onPhasePresetRemove: () => void;
  phaseConfig?: PhaseConfig;
  onSwitchToAdvanced?: () => void;
}

export const PresetsSelector: React.FC<PresetsSelectorProps> = ({
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  phaseConfig,
  onSwitchToAdvanced
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<'browse' | 'add-new'>('browse');
  
  // Check if we have a selected preset
  const hasSelectedPreset = !!selectedPhasePresetId;

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setModalInitialTab('browse');
            setIsModalOpen(true);
          }}
          className="gap-2 whitespace-nowrap flex-1 sm:flex-none"
        >
          <Library className="h-4 w-4" />
          {hasSelectedPreset ? 'Change Preset' : 'Load Preset'}
        </Button>
      </div>

      {/* Selected Preset Info Card - shown when a preset is selected */}
      {hasSelectedPreset && selectedPhasePresetId && (
        <SelectedPresetCard 
          presetId={selectedPhasePresetId}
          phaseConfig={phaseConfig}
          onSwitchToAdvanced={onSwitchToAdvanced}
        />
      )}

      {/* Empty State - shown when no preset is selected */}
      {!hasSelectedPreset && (
        <Card className="p-6 border-dashed">
          <div className="text-center text-muted-foreground">
            <Library className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm mb-1">No preset selected</p>
            <p className="text-xs opacity-75">
              Load a preset to quickly apply pre-configured phase settings
            </p>
          </div>
        </Card>
      )}

      {/* Phase Config Selector Modal */}
      <PhaseConfigSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectPreset={(preset) => {
          if (preset.metadata.phaseConfig) {
            onPhasePresetSelect(preset.id, preset.metadata.phaseConfig, preset.metadata);
          }
          setIsModalOpen(false);
        }}
        onRemovePreset={onPhasePresetRemove}
        selectedPresetId={selectedPhasePresetId || null}
        currentPhaseConfig={phaseConfig}
        initialTab={modalInitialTab}
      />
    </div>
  );
};

