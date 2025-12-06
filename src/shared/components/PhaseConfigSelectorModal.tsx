import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter as ItemCardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useListResources, useListPublicResources, useCreateResource, useUpdateResource, useDeleteResource, Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/shared/components/ui/pagination";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { toast } from "sonner";
import { Switch } from "@/shared/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/shared/components/ui/alert-dialog";
import { Info, X, Layers, Zap, Settings2, Trash2, Pencil, RotateCcw, Search, Download } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { supabase } from '@/integrations/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu";
import { LoraModel, LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PREDEFINED_LORAS, getDisplayNameFromUrl } from '@/tools/travel-between-images/utils/loraDisplayUtils';
import { Badge } from "@/shared/components/ui/badge";
import FileInput from "@/shared/components/FileInput";
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { framesToSecondsValue } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
import { Slider } from "@/shared/components/ui/slider";

type SortOption = 'default' | 'newest' | 'oldest' | 'mostUsed' | 'name';

interface PhaseConfigSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  selectedPresetId: string | null;
  currentPhaseConfig?: PhaseConfig; // The current config (for "Save Current" feature)
  initialTab?: 'browse' | 'add-new'; // Which tab to open with
  intent?: 'load' | 'overwrite'; // Mode of operation
  availableLoras?: LoraModel[]; // Available LoRAs for selection
  // Current generation type mode (I2V vs VACE)
  generationTypeMode?: 'i2v' | 'vace';
  // Current settings to pre-populate the form
  currentSettings?: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
}

interface BrowsePresetsTabProps {
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  selectedPresetId: string | null;
  myPresetsResource: UseQueryResult<Resource[], Error>;
  publicPresetsResource: UseQueryResult<Resource[], Error>;
  createResource: ReturnType<typeof useCreateResource>;
  updateResource: ReturnType<typeof useUpdateResource>;
  deleteResource: ReturnType<typeof useDeleteResource>;
  onClose: () => void;
  onEdit: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  showMyPresetsOnly: boolean;
  setShowMyPresetsOnly: (value: boolean) => void;
  showSelectedPresetOnly: boolean;
  setShowSelectedPresetOnly: (value: boolean) => void;
  onProcessedPresetsLengthChange: (length: number) => void;
  onPageChange?: (page: number, totalPages: number, setPage: (page: number) => void) => void;
  intent?: 'load' | 'overwrite';
  onOverwrite?: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
}

const BrowsePresetsTab: React.FC<BrowsePresetsTabProps> = ({ 
  onSelectPreset, 
  onRemovePreset,
  selectedPresetId,
  myPresetsResource, 
  publicPresetsResource,
  createResource,
  updateResource,
  deleteResource,
  onClose,
  onEdit,
  showMyPresetsOnly,
  setShowMyPresetsOnly,
  showSelectedPresetOnly,
  setShowSelectedPresetOnly,
  onProcessedPresetsLengthChange,
  onPageChange,
  intent = 'load',
  onOverwrite
}) => {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 12;
  
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<{ id: string; name: string; isSelected: boolean } | null>(null);
  
  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (presetToDelete) {
      deleteResource.mutate({ id: presetToDelete.id, type: 'phase-config' });
      if (presetToDelete.isSelected) {
        onRemovePreset();
      }
      setDeleteDialogOpen(false);
      setPresetToDelete(null);
    }
  };

  const myPresetIds = useMemo(() => myPresetsResource.data?.map(r => r.id) || [], [myPresetsResource.data]);

  // Combine all presets (my presets + public presets)
  const allPresets = useMemo(() => {
    console.log('[PhaseConfigModal] Combining presets:', {
      myPresetsCount: myPresetsResource.data?.length || 0,
      publicPresetsCount: publicPresetsResource.data?.length || 0,
      myPresetIds: myPresetIds.map(id => id.substring(0, 8)),
      timestamp: Date.now()
    });
    
    const myPresets = (myPresetsResource.data || []).map(r => ({
      ...r,
      metadata: r.metadata as PhaseConfigMetadata,
      _isMyPreset: true
    }));
    const publicPresets = (publicPresetsResource.data || []).map(r => ({
      ...r,
      metadata: r.metadata as PhaseConfigMetadata,
      _isMyPreset: myPresetIds.includes(r.id)
    }));
    
    console.log('[PhaseConfigModal] Preset details:', {
      myPresets: myPresets.map(p => ({
        id: p.id.substring(0, 8),
        name: p.metadata.name,
        isPublic: p.metadata.is_public,
        userId: p.userId?.substring(0, 8)
      })),
      publicPresets: publicPresets.map(p => ({
        id: p.id.substring(0, 8),
        name: p.metadata.name,
        isPublic: p.metadata.is_public,
        userId: p.userId?.substring(0, 8),
        _isMyPreset: p._isMyPreset
      })),
      timestamp: Date.now()
    });
    
    // Deduplicate by ID, prioritizing my presets
    const presetMap = new Map<string, typeof myPresets[0]>();
    publicPresets.forEach(preset => presetMap.set(preset.id, preset));
    myPresets.forEach(preset => presetMap.set(preset.id, preset));
    
    const combined = Array.from(presetMap.values());
    console.log('[PhaseConfigModal] Combined presets:', {
      totalCount: combined.length,
      presets: combined.map(p => ({
        id: p.id.substring(0, 8),
        name: p.metadata.name,
        isPublic: p.metadata.is_public,
        _isMyPreset: p._isMyPreset
      })),
      timestamp: Date.now()
    });
    
    return combined;
  }, [myPresetsResource.data, publicPresetsResource.data, myPresetIds]);

  const processedPresets = useMemo(() => {
    let filtered = allPresets;
    
    // Filter by "My Presets Only"
    if (showMyPresetsOnly) {
      filtered = filtered.filter(preset => preset._isMyPreset);
    }
    
    // Filter by "Selected Preset Only"
    if (showSelectedPresetOnly) {
      filtered = filtered.filter(preset => preset.id === selectedPresetId);
    }
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(preset => {
        const metadata = preset.metadata;
        return (
          metadata.name.toLowerCase().includes(term) ||
          metadata.description.toLowerCase().includes(term) ||
          metadata.tags?.some(tag => tag.toLowerCase().includes(term))
        );
      });
    }

    const sorted = [...filtered];
    switch (sortOption) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'mostUsed':
        sorted.sort((a, b) => (b.metadata.use_count || 0) - (a.metadata.use_count || 0));
        break;
      case 'name':
        sorted.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
        break;
      case 'default':
      default:
        break;
    }
    return sorted;
  }, [allPresets, searchTerm, sortOption, showMyPresetsOnly, showSelectedPresetOnly, selectedPresetId]);

  // Update parent with processed presets length
  React.useEffect(() => {
    onProcessedPresetsLengthChange(processedPresets.length);
  }, [processedPresets.length, onProcessedPresetsLengthChange]);

  // Reset page when filter/sort changes
  React.useEffect(() => { setPage(0); }, [searchTerm, sortOption, showMyPresetsOnly, showSelectedPresetOnly]);

  const totalPages = Math.ceil(processedPresets.length / ITEMS_PER_PAGE);
  const paginatedPresets = useMemo(() => processedPresets.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE), [processedPresets, page]);

  // Notify parent about pagination state
  React.useEffect(() => {
    if (onPageChange) {
      onPageChange(page, totalPages, setPage);
    }
  }, [page, totalPages, onPageChange]);

  const myPresetsCount = allPresets.filter(preset => preset._isMyPreset).length;

  return (
    <div className="relative flex flex-col h-full min-h-0 px-0 sm:px-4">
      <div className="flex gap-2 mb-4">
        <Input
          type="text"
          placeholder="Search presets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-grow"
        />
        <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="mostUsed">Most Used</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="default">Default Order</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${isMobile ? 'pb-3' : 'pb-6'}`}>
          {paginatedPresets.length > 0 ? (
            paginatedPresets.map((preset) => {
              const isSelected = preset.id === selectedPresetId;
              const isMyPreset = preset._isMyPreset;
              const isSaved = myPresetIds.includes(preset.id);
              const metadata = preset.metadata;
              const config = metadata.phaseConfig;
              
              // Calculate total steps
              const totalSteps = config.steps_per_phase?.reduce((sum, steps) => sum + steps, 0) || 0;

              return (
                <Card 
                  key={preset.id} 
                  className={`w-full transition-all duration-200 shadow-none relative ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/30' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-2">
                      <div className="flex-grow">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap flex-1">
                            <CardTitle className="text-xl">{metadata.name}</CardTitle>
                            {isMyPreset && (
                              <Badge variant="secondary" className="text-xs">
                                Mine
                              </Badge>
                            )}
                            {isSelected && (
                              <Badge variant="default" className="text-xs bg-blue-500">
                                Selected
                              </Badge>
                            )}
                          </div>
                          {/* Mobile buttons */}
                          <div className={`flex gap-2 flex-shrink-0 ${isMobile ? '' : 'hidden'}`}>
                            {intent === 'overwrite' ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => onOverwrite?.(preset as Resource & { metadata: PhaseConfigMetadata })}
                                className="bg-orange-600 hover:bg-orange-700"
                              >
                                Overwrite
                              </Button>
                            ) : isSelected ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onRemovePreset()}
                              >
                                Deselect
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => onSelectPreset(preset as Resource & { metadata: PhaseConfigMetadata })}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                Use
                              </Button>
                            )}
                            {!isMyPreset && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => createResource.mutate({ type: 'phase-config', metadata })}
                                disabled={isSaved || createResource.isPending}
                              >
                                {isSaved ? 'Saved' : 'Save'}
                              </Button>
                            )}
                            {isMyPreset && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setPresetToDelete({ id: preset.id, name: metadata.name, isSelected });
                                  setDeleteDialogOpen(true);
                                }}
                                disabled={deleteResource.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {metadata.created_by && (
                          <p className="text-sm text-muted-foreground">
                            By: {metadata.created_by.is_you ? 'You' : metadata.created_by.username || 'Unknown'}
                          </p>
                        )}
                      </div>
                      {/* Desktop buttons */}
                      <div className={`flex flex-col lg:items-end gap-2 flex-shrink-0 ${isMobile ? 'hidden' : 'hidden lg:flex'}`}>
                        <div className="flex gap-2">
                          {intent === 'overwrite' ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => onOverwrite?.(preset as Resource & { metadata: PhaseConfigMetadata })}
                              className="bg-orange-600 hover:bg-orange-700"
                            >
                              Overwrite
                            </Button>
                          ) : isSelected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRemovePreset()}
                            >
                              Deselect
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => onSelectPreset(preset as Resource & { metadata: PhaseConfigMetadata })}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              Use Preset
                            </Button>
                          )}
                          {!isMyPreset && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => createResource.mutate({ type: 'phase-config', metadata })}
                              disabled={isSaved || createResource.isPending}
                            >
                              {isSaved ? 'Saved' : 'Save'}
                            </Button>
                          )}
                          {isMyPreset && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  onEdit(preset as Resource & { metadata: PhaseConfigMetadata });
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setPresetToDelete({ id: preset.id, name: metadata.name, isSelected });
                                  setDeleteDialogOpen(true);
                                }}
                                disabled={deleteResource.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Description */}
                    {metadata.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {metadata.description}
                      </p>
                    )}
                    
                    {/* Sample generation - show only main generation */}
                    {metadata.main_generation ? (
                      <div className="flex justify-center pb-2 pt-1">
                        {(() => {
                          const mainSample = metadata.sample_generations?.find(s => s.url === metadata.main_generation);
                          const isVideo = mainSample?.type === 'video';
                          return isVideo ? (
                            <div
                              className="relative h-28 w-auto rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                              onClickCapture={(e) => {
                                if (!isMobile) return;
                                const container = e.currentTarget as HTMLElement;
                                const video = container.querySelector('video') as HTMLVideoElement | null;
                                if (!video) return;
                                if (video.paused) {
                                  video.play().catch(() => {});
                                } else {
                                  video.pause();
                                }
                              }}
                              onTouchEndCapture={(e) => {
                                if (!isMobile) return;
                                const container = e.currentTarget as HTMLElement;
                                const video = container.querySelector('video') as HTMLVideoElement | null;
                                if (!video) return;
                                if (video.paused) {
                                  video.play().catch(() => {});
                                } else {
                                  video.pause();
                                }
                              }}
                            >
                              <HoverScrubVideo
                                src={metadata.main_generation}
                                className="h-full w-auto"
                                videoClassName="object-contain"
                                autoplayOnHover={!isMobile}
                                preload="metadata"
                                loop
                                muted
                              />
                            </div>
                          ) : (
                            <img
                              src={metadata.main_generation}
                              alt={mainSample?.alt_text || 'Main sample'}
                              className="h-28 w-auto object-contain rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                              title={mainSample?.alt_text || metadata.main_generation}
                              loading="lazy"
                            />
                          );
                        })()}
                      </div>
                    ) : metadata.sample_generations && metadata.sample_generations.length > 0 && (
                      <div className="flex justify-center pb-2 pt-1">
                        {(() => {
                          const sample = metadata.sample_generations[0];
                          const isVideo = sample.type === 'video';
                          return isVideo ? (
                            <div
                              className="relative h-28 w-auto rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                              onClickCapture={(e) => {
                                if (!isMobile) return;
                                const container = e.currentTarget as HTMLElement;
                                const video = container.querySelector('video') as HTMLVideoElement | null;
                                if (!video) return;
                                if (video.paused) {
                                  video.play().catch(() => {});
                                } else {
                                  video.pause();
                                }
                              }}
                              onTouchEndCapture={(e) => {
                                if (!isMobile) return;
                                const container = e.currentTarget as HTMLElement;
                                const video = container.querySelector('video') as HTMLVideoElement | null;
                                if (!video) return;
                                if (video.paused) {
                                  video.play().catch(() => {});
                                } else {
                                  video.pause();
                                }
                              }}
                            >
                              <HoverScrubVideo
                                src={sample.url}
                                className="h-full w-auto"
                                videoClassName="object-contain"
                                autoplayOnHover={!isMobile}
                                preload="metadata"
                                loop
                                muted
                              />
                            </div>
                          ) : (
                            <img
                              src={sample.url}
                              alt={sample.alt_text || 'Sample'}
                              className="h-28 w-auto object-contain rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                              title={sample.alt_text || sample.url}
                              loading="lazy"
                            />
                          );
                        })()}
                      </div>
                    )}
                    
                    {/* Tags */}
                    {metadata.tags && metadata.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {metadata.tags.map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Prompt Preview */}
                    {(metadata.basePrompt || metadata.textBeforePrompts || metadata.textAfterPrompts || metadata.durationFrames) && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground">Prompt Settings:</p>
                        {metadata.basePrompt && (
                          <div className="text-xs">
                            <span className="font-medium">Base Prompt: </span>
                            <span className="text-muted-foreground line-clamp-2">{metadata.basePrompt}</span>
                          </div>
                        )}
                        {(metadata.textBeforePrompts || metadata.textAfterPrompts) && (
                          <div className="text-xs flex gap-2">
                            {metadata.textBeforePrompts && (
                              <span className="text-muted-foreground">Before: "{metadata.textBeforePrompts}"</span>
                            )}
                            {metadata.textAfterPrompts && (
                              <span className="text-muted-foreground">After: "{metadata.textAfterPrompts}"</span>
                            )}
                          </div>
                        )}
                        {metadata.durationFrames && (
                          <div className="text-xs">
                            <span className="font-medium">Suggested duration: </span>
                            <span className="text-muted-foreground">{metadata.durationFrames} frames ({framesToSecondsValue(metadata.durationFrames).toFixed(1)}s)</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Config Preview */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t">
                      {/* Model Type */}
                      <div className="flex items-center gap-1.5">
                        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Model</p>
                          <p className="text-sm font-medium uppercase">{metadata.generationTypeMode || 'i2v'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Phases</p>
                          <p className="text-sm font-medium">{config.num_phases}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Steps</p>
                          <p className="text-sm font-medium">{totalSteps}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Solver</p>
                          <p className="text-sm font-medium capitalize">{config.sample_solver}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Flow Shift</p>
                          <p className="text-sm font-medium">{config.flow_shift}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Phase details */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-xs font-medium text-muted-foreground">Phase Details:</p>
                      {config.phases?.map((phase, idx) => (
                        <div key={idx} className="text-xs flex items-center gap-2">
                          <span className="font-medium">Phase {phase.phase}:</span>
                          <span>Guidance {phase.guidance_scale}</span>
                          {phase.loras && phase.loras.length > 0 && (
                            <span className="text-muted-foreground">• {phase.loras.length} LoRA{phase.loras.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* Usage count */}
                    {metadata.use_count !== undefined && metadata.use_count > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Used {metadata.use_count} time{metadata.use_count !== 1 ? 's' : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <p className="text-center text-muted-foreground py-8 col-span-full">No presets match your search criteria.</p>
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{presetToDelete?.name}"? This action cannot be undone.
              {presetToDelete?.isSelected && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Note: This preset is currently selected and will be deselected.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setPresetToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface AddNewTabProps {
  createResource: ReturnType<typeof useCreateResource>;
  updateResource: ReturnType<typeof useUpdateResource>;
  onSwitchToBrowse: () => void;
  currentPhaseConfig?: PhaseConfig;
  editingPreset?: (Resource & { metadata: PhaseConfigMetadata }) | null;
  onClearEdit: () => void;
  isOverwriting?: boolean;
  availableLoras?: LoraModel[];
  generationTypeMode?: 'i2v' | 'vace';
  currentSettings?: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
}

// Generate a preset name based on current settings
const generatePresetName = (
  phaseConfig?: PhaseConfig,
  basePrompt?: string,
  selectedLoras?: Array<{ id: string; name: string; strength: number }>
): string => {
  const randomWords = [
    'Cloud', 'Storm', 'River', 'Mountain', 'Ocean', 'Forest', 'Desert', 
    'Glacier', 'Valley', 'Canyon', 'Meadow', 'Prairie', 'Tundra', 'Jungle',
    'Sunset', 'Dawn', 'Eclipse', 'Aurora', 'Comet', 'Nebula', 'Stellar',
    'Cosmic', 'Lunar', 'Solar', 'Crystal', 'Diamond', 'Emerald', 'Sapphire'
  ];
  
  // Count phases
  const phaseCount = phaseConfig?.num_phases || 0;
  const phaseText = phaseCount > 0 ? `${phaseCount} Phase` : 'Custom';
  
  // Extract and truncate prompt (remove common words, take meaningful parts)
  let promptPart = '';
  if (basePrompt) {
    const cleaned = basePrompt
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(word => word.length > 3) // Filter out short words
      .slice(0, 3) // Take first 3 meaningful words
      .join(' ');
    promptPart = cleaned.substring(0, 20);
  }
  
  // Extract and truncate LoRA names
  let loraPart = '';
  if (selectedLoras && selectedLoras.length > 0) {
    loraPart = selectedLoras
      .map(lora => lora.name)
      .join(', ')
      .substring(0, 20);
  }
  
  // Pick random word
  const randomWord = randomWords[Math.floor(Math.random() * randomWords.length)];
  
  // Build name
  const parts = [phaseText];
  if (promptPart) parts.push(`"${promptPart}"`);
  if (loraPart) parts.push(loraPart);
  parts.push(randomWord);
  
  return parts.join(' - ');
};

const AddNewTab: React.FC<AddNewTabProps> = ({ createResource, updateResource, onSwitchToBrowse, currentPhaseConfig, editingPreset, onClearEdit, currentSettings, isOverwriting = false, availableLoras = [], generationTypeMode: initialGenerationTypeMode = 'i2v' }) => {
  const isEditMode = !!editingPreset;
  
  // Generation type mode state (I2V vs VACE)
  const [generationTypeMode, setGenerationTypeMode] = useState<'i2v' | 'vace'>(() => {
    if (editingPreset?.metadata?.generationTypeMode && !isOverwriting) {
      return editingPreset.metadata.generationTypeMode;
    }
    return initialGenerationTypeMode;
  });
  
  console.log('[PresetAutoPopulate] AddNewTab received currentSettings:', currentSettings);
  
  const [addForm, setAddForm] = useState(() => {
    const generatedName = generatePresetName(
      currentPhaseConfig,
      currentSettings?.basePrompt,
      currentSettings?.selectedLoras
    );
    
    const initialForm = {
      name: generatedName,
      description: '',
      created_by_is_you: true,
      created_by_username: '',
      is_public: true,
      basePrompt: currentSettings?.basePrompt || '',
      negativePrompt: currentSettings?.negativePrompt || '',
      textBeforePrompts: currentSettings?.textBeforePrompts || '',
      textAfterPrompts: currentSettings?.textAfterPrompts || '',
      enhancePrompt: currentSettings?.enhancePrompt ?? true,
      durationFrames: currentSettings?.durationFrames || 60,
    };
    console.log('[PresetAutoPopulate] AddNewTab initializing form state:', initialForm);
    return initialForm;
  });
  const [sampleFiles, setSampleFiles] = useState<File[]>([]);
  const [deletedExistingSampleUrls, setDeletedExistingSampleUrls] = useState<string[]>([]);
  const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [userName, setUserName] = useState<string>('');
  const [initialVideoSample, setInitialVideoSample] = useState<string | null>(null);
  const [initialVideoDeleted, setInitialVideoDeleted] = useState(false);
  const isMobile = useIsMobile();
  
  // Editable phase config state
  const [editablePhaseConfig, setEditablePhaseConfig] = useState<PhaseConfig>(() => {
    if (editingPreset?.metadata?.phaseConfig && !isOverwriting) {
      return editingPreset.metadata.phaseConfig;
    }
    return currentPhaseConfig || DEFAULT_PHASE_CONFIG;
  });
  
  // LoRA selector modal state
  const [activePhaseForLoraSelection, setActivePhaseForLoraSelection] = useState<number | null>(null);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [focusedLoraInput, setFocusedLoraInput] = useState<string | null>(null);
  
  // Phase labels based on number of phases
  const phaseLabels2 = ["High Noise Sampler", "Low Noise Sampler"];
  const phaseLabels3 = ["High Noise Sampler 1", "High Noise Sampler 2", "Low Noise Sampler"];
  const phaseLabels = editablePhaseConfig.num_phases === 2 ? phaseLabels2 : phaseLabels3;
  
  // Update editable phase config when editing preset changes or mode changes
  useEffect(() => {
    if (editingPreset?.metadata?.phaseConfig) {
      if (!isOverwriting) {
        setEditablePhaseConfig(editingPreset.metadata.phaseConfig);
        // Also restore the generation type mode
        if (editingPreset.metadata.generationTypeMode) {
          setGenerationTypeMode(editingPreset.metadata.generationTypeMode);
        }
      } else {
        setEditablePhaseConfig(currentPhaseConfig || DEFAULT_PHASE_CONFIG);
        setGenerationTypeMode(initialGenerationTypeMode);
      }
    } else if (currentPhaseConfig) {
      setEditablePhaseConfig(currentPhaseConfig);
    } else {
      setEditablePhaseConfig(DEFAULT_PHASE_CONFIG);
    }
  }, [editingPreset, isOverwriting, currentPhaseConfig, initialGenerationTypeMode]);
  
  // Update form from current settings when they change (and not editing)
  useEffect(() => {
    console.log('[PresetAutoPopulate] AddNewTab useEffect triggered:', {
      editingPreset: !!editingPreset,
      currentSettings,
      willUpdate: !editingPreset && !!currentSettings
    });
    
    if (!editingPreset && currentSettings) {
      const generatedName = generatePresetName(
        currentPhaseConfig,
        currentSettings.basePrompt,
        currentSettings.selectedLoras
      );
      
      const newFields = {
        name: generatedName, // Auto-generate name
        basePrompt: currentSettings.basePrompt || '',
        negativePrompt: currentSettings.negativePrompt || '',
        textBeforePrompts: currentSettings.textBeforePrompts || '',
        textAfterPrompts: currentSettings.textAfterPrompts || '',
        enhancePrompt: currentSettings.enhancePrompt ?? true,
        durationFrames: currentSettings.durationFrames || 60,
      };
      console.log('[PresetAutoPopulate] AddNewTab updating form with:', newFields);
      
      setAddForm(prev => ({
        ...prev,
        ...newFields
      }));
      
      // Also set the initial video sample if available
      if (currentSettings.lastGeneratedVideoUrl) {
        setInitialVideoSample(currentSettings.lastGeneratedVideoUrl);
        setInitialVideoDeleted(false); // Reset deletion flag
        console.log('[PresetAutoPopulate] Set initial video sample:', currentSettings.lastGeneratedVideoUrl);
      }
    }
  }, [currentSettings, editingPreset, currentPhaseConfig]);

  // Pre-populate form when editing
  useEffect(() => {
    if (editingPreset && editingPreset.metadata) {
      const metadata = editingPreset.metadata;
      
      // If overwriting, we use the name/description from the preset, 
      // but current settings for the configuration and prompt details
      if (isOverwriting && currentSettings) {
         setAddForm({
          name: metadata.name || '',
          description: metadata.description || '',
          created_by_is_you: metadata.created_by?.is_you ?? true,
          created_by_username: metadata.created_by?.username || '',
          is_public: metadata.is_public ?? true,
          basePrompt: currentSettings.basePrompt || '',
          negativePrompt: currentSettings.negativePrompt || '',
          textBeforePrompts: currentSettings.textBeforePrompts || '',
          textAfterPrompts: currentSettings.textAfterPrompts || '',
          enhancePrompt: currentSettings.enhancePrompt ?? true,
          durationFrames: currentSettings.durationFrames || 60,
        });
        
        // When overwriting, we start with no samples (user can add new ones), 
        // unless there's a last generated video they might want to use.
        // Or should we keep old samples? Overwriting config likely invalidates old samples.
        // Let's clear old samples and allow adding new ones.
        setSampleFiles([]);
        setDeletedExistingSampleUrls([]); // We'll effectively remove them by not including them? 
        // Actually, if we're in overwrite mode, we probably shouldn't show the "Existing Samples" section
        // or we should show them as available but maybe not selected?
        // Let's assume overwrite means "fresh start" for samples except maybe keeping name.
        
        // Wait, if I overwrite, I'm updating the resource. If I don't send sample_generations, 
        // they might be lost or kept depending on how I construct the update.
        // The handleAddPresetFromForm constructs metadata.
        
        // If isOverwriting, we might want to default to clearing samples.
      } else {
        // Normal Edit Mode
        setAddForm({
          name: metadata.name || '',
          description: metadata.description || '',
          created_by_is_you: metadata.created_by?.is_you ?? true,
          created_by_username: metadata.created_by?.username || '',
          is_public: metadata.is_public ?? true,
          basePrompt: metadata.basePrompt || '',
          negativePrompt: metadata.negativePrompt || '',
          textBeforePrompts: metadata.textBeforePrompts || '',
          textAfterPrompts: metadata.textAfterPrompts || '',
          enhancePrompt: metadata.enhancePrompt ?? true,
          durationFrames: metadata.durationFrames || 60,
        });
      }
      
      // Reset new uploads and deleted samples when switching to a different preset
      setSampleFiles([]);
      setDeletedExistingSampleUrls([]);
      setMainGenerationIndex(0);
      setFileInputKey(prev => prev + 1);
      
      // If overwriting and we have a last generated video, use it
      if (isOverwriting && currentSettings?.lastGeneratedVideoUrl) {
        setInitialVideoSample(currentSettings.lastGeneratedVideoUrl);
        setInitialVideoDeleted(false);
      } else if (!isOverwriting) {
        // CRITICAL: When editing normally (not overwriting), clear the initial video sample
        // to ensure we show the preset's saved samples, NOT the last generated video
        // This fixes Task 25: Phase Config Editor Pre-Populates Last Generated Video Incorrectly
        setInitialVideoSample(null);
        setInitialVideoDeleted(false);
        console.log('[PhaseConfigPrePopulate] Cleared initialVideoSample for normal edit mode');
      }
    }
  }, [editingPreset, isOverwriting, currentSettings]);

  // Manage preview URLs for sample files
  useEffect(() => {
    // Clean up existing URLs
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    
    // Create new URLs for current files
    const newUrls = sampleFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(newUrls);
    
    // Reset main generation index if it's out of bounds
    if (mainGenerationIndex >= sampleFiles.length) {
      setMainGenerationIndex(0);
    }
    
    // Cleanup function
    return () => {
      newUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [sampleFiles, mainGenerationIndex]);

  // Fetch current user's name
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user name:', error);
          return;
        }

        setUserName(data?.name || '');
      } catch (error) {
        console.error('Error in fetchUserName:', error);
      }
    };

    fetchUserName();
  }, []);
  
  const handleFormChange = (field: string, value: any) => {
    setAddForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddPresetFromForm = async () => {
    if (!addForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    
    // Use the editable phase config (always available)
    if (!editablePhaseConfig) {
      toast.error("No phase config available to save");
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Upload sample generations if any
      const uploadedSamples: { url: string; type: 'image' | 'video'; alt_text?: string; }[] = [];
      
      for (const file of sampleFiles) {
        const uploadedUrl = await uploadImageToStorage(file);
        uploadedSamples.push({
          url: uploadedUrl,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          alt_text: file.name,
        });
      }

      // Combine existing samples (minus deleted ones) with new uploads
      // If overwriting, we don't include existing samples by default unless we want to keep them?
      // For now, let's treat overwrite as "keep existing samples unless deleted" just like edit, 
      // but user can delete them.
      const existingSamples = isEditMode 
        ? (editingPreset?.metadata.sample_generations || []).filter(s => !deletedExistingSampleUrls.includes(s.url))
        : [];
      
      // Include initial video sample if present and not deleted (only when creating new preset OR overwriting)
      const initialSample = ((!isEditMode || isOverwriting) && initialVideoSample && !initialVideoDeleted) 
        ? [{ url: initialVideoSample, type: 'video' as const, alt_text: 'Latest video generation' }]
        : [];
      
      const finalSamples = [...initialSample, ...existingSamples, ...uploadedSamples];

      // Determine main generation
      let mainGeneration: string | undefined;
      if ((!isEditMode || isOverwriting) && initialVideoSample && !initialVideoDeleted) {
        // Use initial video as main generation when creating new preset or overwriting
        mainGeneration = initialVideoSample;
      } else if (uploadedSamples.length > 0 && uploadedSamples[mainGenerationIndex]) {
        mainGeneration = uploadedSamples[mainGenerationIndex].url;
      } else if (isEditMode && editingPreset?.metadata.main_generation && !deletedExistingSampleUrls.includes(editingPreset.metadata.main_generation)) {
        // Keep existing main generation if it wasn't deleted
        mainGeneration = editingPreset.metadata.main_generation;
      } else if (finalSamples.length > 0) {
        // Default to first sample if no main generation set
        mainGeneration = finalSamples[0].url;
      }

      const presetMetadata: PhaseConfigMetadata = {
        name: addForm.name,
        description: addForm.description,
        phaseConfig: editablePhaseConfig,
        created_by: {
          is_you: addForm.created_by_is_you,
          username: addForm.created_by_is_you ? undefined : addForm.created_by_username,
        },
        is_public: addForm.is_public,
        sample_generations: finalSamples.length > 0 ? finalSamples : undefined,
        main_generation: mainGeneration,
        use_count: isEditMode ? (editingPreset?.metadata.use_count || 0) : 0,
        created_at: isEditMode ? (editingPreset?.metadata.created_at || new Date().toISOString()) : new Date().toISOString(),
        // Prompt and generation settings
        basePrompt: addForm.basePrompt || undefined,
        negativePrompt: addForm.negativePrompt || undefined,
        textBeforePrompts: addForm.textBeforePrompts || undefined,
        textAfterPrompts: addForm.textAfterPrompts || undefined,
        enhancePrompt: addForm.enhancePrompt,
        durationFrames: addForm.durationFrames,
        selectedLoras: currentSettings?.selectedLoras,
        // Generation type mode
        generationTypeMode: generationTypeMode,
      };

      if (isEditMode && editingPreset) {
        await updateResource.mutateAsync({ 
          id: editingPreset.id, 
          type: 'phase-config', 
          metadata: presetMetadata as any 
        });
        onClearEdit();
      } else {
        await createResource.mutateAsync({ type: 'phase-config', metadata: presetMetadata as any });
      }

      // Reset form
      setAddForm({
        name: '',
        description: '',
        created_by_is_you: true,
        created_by_username: '',
        is_public: true,
        basePrompt: '',
        negativePrompt: '',
        textBeforePrompts: '',
        textAfterPrompts: '',
        enhancePrompt: true,
        durationFrames: 60,
      });
      setEditablePhaseConfig(currentPhaseConfig || DEFAULT_PHASE_CONFIG);
      setSampleFiles([]);
      setDeletedExistingSampleUrls([]);
      setMainGenerationIndex(0);
      setFileInputKey(prev => prev + 1);
      
      // Switch to browse tab to show the preset
      onSwitchToBrowse();
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'adding'} preset:`, error);
      toast.error(`Failed to ${isEditMode ? 'update' : 'add'} preset: ` + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="space-y-4">
      {isEditMode && (
        <div className={`flex items-center justify-between p-3 border rounded-lg ${
          isOverwriting 
            ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' 
            : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            <Pencil className={`h-4 w-4 ${isOverwriting ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`} />
            <span className={`text-sm font-medium ${isOverwriting ? 'text-orange-900 dark:text-orange-100' : 'text-blue-900 dark:text-blue-100'}`}>
              {isOverwriting ? `Overwriting: ${editingPreset?.metadata.name}` : `Editing: ${editingPreset?.metadata.name}`}
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              onClearEdit();
              setAddForm({
                name: '',
                description: '',
                created_by_is_you: true,
                created_by_username: '',
                is_public: true,
                basePrompt: '',
                negativePrompt: '',
                textBeforePrompts: '',
                textAfterPrompts: '',
                enhancePrompt: true,
                durationFrames: 60,
              });
              setEditablePhaseConfig(currentPhaseConfig || DEFAULT_PHASE_CONFIG);
              setSampleFiles([]);
              setDeletedExistingSampleUrls([]);
              setMainGenerationIndex(0);
              setFileInputKey(prev => prev + 1);
            }}
          >
            Cancel Edit
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? (isOverwriting ? 'Overwrite Preset' : 'Edit Phase Config Preset') : 'Create New Phase Config Preset'}</CardTitle>
          <CardDescription>
            {isEditMode 
              ? (isOverwriting ? 'Update this preset with your current configuration.' : 'Update your phase configuration preset.') 
              : 'Save your current phase configuration for reuse.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="preset-name">Name *</Label>
            <Input 
              id="preset-name" 
              placeholder="My Custom Phase Config" 
              value={addForm.name} 
              onChange={e => handleFormChange('name', e.target.value)} 
              maxLength={50}
            />
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="preset-description">Description (optional)</Label>
            <Textarea 
              id="preset-description" 
              placeholder="Describe what this preset does and when to use it..." 
              value={addForm.description} 
              onChange={e => handleFormChange('description', e.target.value)} 
              rows={3}
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="created-by-you" 
                checked={addForm.created_by_is_you}
                onCheckedChange={(checked) => handleFormChange('created_by_is_you', checked)}
              />
              <Label htmlFor="created-by-you" className="font-normal text-sm">This is my creation</Label>
            </div>
            {!addForm.created_by_is_you && (
              <Input 
                placeholder="Creator's username" 
                value={addForm.created_by_username} 
                onChange={e => handleFormChange('created_by_username', e.target.value)} 
                maxLength={30}
                className="w-40"
              />
            )}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="is-public" 
                checked={addForm.is_public}
                onCheckedChange={(checked) => handleFormChange('is_public', checked)}
              />
              <Label htmlFor="is-public" className="font-normal text-sm">Available to others</Label>
            </div>
          </div>

          {/* Base Generation Settings */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base font-semibold">Base Generation Settings</Label>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="preset-base-prompt">Base Prompt</Label>
                <Textarea 
                  id="preset-base-prompt" 
                  placeholder="Enter the main prompt for this preset..." 
                  value={addForm.basePrompt} 
                  onChange={e => handleFormChange('basePrompt', e.target.value)} 
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="preset-negative-prompt">Negative Prompt</Label>
                <Textarea 
                  id="preset-negative-prompt" 
                  placeholder="Enter negative prompt..." 
                  value={addForm.negativePrompt} 
                  onChange={e => handleFormChange('negativePrompt', e.target.value)} 
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border">
              <Switch 
                id="preset-enhance" 
                checked={addForm.enhancePrompt}
                onCheckedChange={(checked) => handleFormChange('enhancePrompt', checked)}
              />
              <div className="flex-1">
                <Label htmlFor="preset-enhance" className="font-medium">
                  Enhance/Create Prompts
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="preset-text-before">Text Before Prompts</Label>
                <Input 
                  id="preset-text-before" 
                  placeholder="Prefix text..." 
                  value={addForm.textBeforePrompts} 
                  onChange={e => handleFormChange('textBeforePrompts', e.target.value)} 
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="preset-text-after">Text After Prompts</Label>
                <Input 
                  id="preset-text-after" 
                  placeholder="Suffix text..." 
                  value={addForm.textAfterPrompts} 
                  onChange={e => handleFormChange('textAfterPrompts', e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="preset-duration">Suggested duration</Label>
              <div className="flex items-center gap-3">
                <Slider
                  id="preset-duration"
                  min={10}
                  max={81}
                  step={1}
                  value={[addForm.durationFrames]}
                  onValueChange={([value]) => handleFormChange('durationFrames', value)}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-16 text-right">
                  {addForm.durationFrames} ({framesToSecondsValue(addForm.durationFrames).toFixed(1)}s)
                </span>
              </div>
            </div>
          </div>

          {/* Editable Phase Configuration */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Phase Configuration</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditablePhaseConfig(DEFAULT_PHASE_CONFIG)}
                className="h-7 text-xs"
                type="button"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to Default
              </Button>
            </div>
            
            {/* Model Type Toggle (I2V vs VACE) */}
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-light">Model Type</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p><strong>I2V (Image-to-Video):</strong> Generate video from images only.<br />
                      <strong>VACE:</strong> Use a structure/guidance video for motion control.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <RadioGroup
                value={generationTypeMode}
                onValueChange={(value) => setGenerationTypeMode(value as 'i2v' | 'vace')}
                className="flex flex-row gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="i2v" id="preset-gen-type-i2v" />
                  <Label htmlFor="preset-gen-type-i2v" className="text-sm">I2V (Image-to-Video)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="vace" id="preset-gen-type-vace" />
                  <Label htmlFor="preset-gen-type-vace" className="text-sm">VACE (Structure Video)</Label>
                </div>
              </RadioGroup>
            </div>
            
            {/* Global Settings */}
            <Card className="bg-muted/20">
              <CardContent className="pt-4 px-4 pb-4">
                <p className="text-xs font-medium text-muted-foreground mb-3">Global Settings</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Number of Phases */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-light">Number of Phases</Label>
                    <RadioGroup
                      value={String(editablePhaseConfig.num_phases)}
                      onValueChange={(value) => {
                        const newNumPhases = parseInt(value);
                        const currentPhases = editablePhaseConfig.phases || [];
                        const currentSteps = editablePhaseConfig.steps_per_phase || [];
                        
                        let newPhases = currentPhases.slice(0, newNumPhases);
                        let newSteps = currentSteps.slice(0, newNumPhases);
                        
                        while (newPhases.length < newNumPhases) {
                          newPhases.push({
                            phase: newPhases.length + 1,
                            guidance_scale: 1.0,
                            loras: []
                          });
                        }
                        
                        while (newSteps.length < newNumPhases) {
                          newSteps.push(2);
                        }
                        
                        setEditablePhaseConfig({
                          ...editablePhaseConfig,
                          num_phases: newNumPhases,
                          phases: newPhases,
                          steps_per_phase: newSteps,
                          model_switch_phase: newNumPhases === 2 ? 1 : editablePhaseConfig.model_switch_phase
                        });
                      }}
                      className="flex flex-row gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="2" id="preset-phases-2" />
                        <Label htmlFor="preset-phases-2" className="text-sm">2</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="3" id="preset-phases-3" />
                        <Label htmlFor="preset-phases-3" className="text-sm">3</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Sample Solver */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-light">Sample Solver</Label>
                    <RadioGroup
                      value={editablePhaseConfig.sample_solver}
                      onValueChange={(value) => setEditablePhaseConfig({
                        ...editablePhaseConfig,
                        sample_solver: value
                      })}
                      className="flex flex-row gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="euler" id="preset-euler" />
                        <Label htmlFor="preset-euler" className="text-sm">Euler</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="unipc" id="preset-unipc" />
                        <Label htmlFor="preset-unipc" className="text-sm">UniPC</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="dpm++" id="preset-dpm" />
                        <Label htmlFor="preset-dpm" className="text-sm">DPM++</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                {/* Flow Shift */}
                <div className="space-y-1.5 mt-4">
                  <Label className="text-sm font-light">
                    Flow Shift: {editablePhaseConfig.flow_shift}
                  </Label>
                  <Slider
                    min={1}
                    max={10}
                    step={0.1}
                    value={[editablePhaseConfig.flow_shift]}
                    onValueChange={(value) => setEditablePhaseConfig({
                      ...editablePhaseConfig,
                      flow_shift: value[0]
                    })}
                  />
                </div>

                {/* Total Steps Display */}
                <div className="text-sm text-muted-foreground pt-3 mt-3 border-t">
                  Total Steps: {editablePhaseConfig.steps_per_phase.reduce((a, b) => a + b, 0)}
                </div>
              </CardContent>
            </Card>

            {/* Per-Phase Settings */}
            {editablePhaseConfig.phases.map((phase, phaseIdx) => (
              <Card key={phaseIdx} className="bg-muted/30">
                <CardContent className="pt-4 px-4 pb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    {phaseLabels[phaseIdx] || `Phase ${phase.phase}`}
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Left: Steps and Guidance */}
                    <div className="space-y-3">
                      {/* Steps */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-light">
                          Steps: {editablePhaseConfig.steps_per_phase[phaseIdx]}
                        </Label>
                        <Slider
                          min={1}
                          max={15}
                          step={1}
                          value={[editablePhaseConfig.steps_per_phase[phaseIdx]]}
                          onValueChange={(value) => {
                            const newSteps = [...editablePhaseConfig.steps_per_phase];
                            newSteps[phaseIdx] = value[0];
                            setEditablePhaseConfig({
                              ...editablePhaseConfig,
                              steps_per_phase: newSteps
                            });
                          }}
                        />
                      </div>

                      {/* Guidance Scale */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-light">Guidance Scale</Label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={phase.guidance_scale}
                          onChange={(e) => {
                            const newPhases = [...editablePhaseConfig.phases];
                            newPhases[phaseIdx] = {
                              ...newPhases[phaseIdx],
                              guidance_scale: parseFloat(e.target.value) || 0
                            };
                            setEditablePhaseConfig({
                              ...editablePhaseConfig,
                              phases: newPhases
                            });
                          }}
                        />
                      </div>
                    </div>

                    {/* Right: LoRAs (spans 2 columns) */}
                    <div className="sm:col-span-2">
                      <Label className="text-sm font-medium mb-1.5 block">LoRAs</Label>
                      <div className="grid grid-cols-2 gap-2 mb-1.5 w-full">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActivePhaseForLoraSelection(phaseIdx);
                            setIsLoraModalOpen(true);
                          }}
                          type="button"
                        >
                          <Search className="h-3 w-3 mr-1" /> Search
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                            >
                              <Download className="h-3 w-3 mr-1" /> Utility
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-72">
                            {Object.entries(
                              PREDEFINED_LORAS.reduce((acc, lora) => {
                                if (!acc[lora.category]) acc[lora.category] = [];
                                acc[lora.category].push(lora);
                                return acc;
                              }, {} as Record<string, typeof PREDEFINED_LORAS>)
                            ).map(([category, loras], idx) => (
                              <React.Fragment key={category}>
                                {idx > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                                  {category}
                                </DropdownMenuLabel>
                                {loras.map((predefinedLora) => (
                                  <DropdownMenuItem
                                    key={predefinedLora.url}
                                    onClick={() => {
                                      const newPhases = [...editablePhaseConfig.phases];
                                      newPhases[phaseIdx] = { 
                                        ...newPhases[phaseIdx],
                                        loras: newPhases[phaseIdx].loras.filter(l => l.url && l.url.trim() !== "")
                                      };
                                      newPhases[phaseIdx].loras.push({
                                        url: predefinedLora.url,
                                        multiplier: "1.0"
                                      });
                                      setEditablePhaseConfig({
                                        ...editablePhaseConfig,
                                        phases: newPhases
                                      });
                                    }}
                                    className="text-xs"
                                  >
                                    {predefinedLora.name}
                                  </DropdownMenuItem>
                                ))}
                              </React.Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      {phase.loras.map((lora, loraIdx) => {
                        const inputId = `preset-lora-${phaseIdx}-${loraIdx}`;
                        const isFocused = focusedLoraInput === inputId;
                        return (
                          <div key={loraIdx} className="flex items-center gap-2 mb-1.5">
                            <div className="relative flex-1 min-w-0">
                              <Input
                                placeholder="LoRA URL"
                                value={isFocused ? lora.url : getDisplayNameFromUrl(lora.url, availableLoras)}
                                onChange={(e) => {
                                  const newPhases = [...editablePhaseConfig.phases];
                                  newPhases[phaseIdx].loras[loraIdx].url = e.target.value;
                                  setEditablePhaseConfig({
                                    ...editablePhaseConfig,
                                    phases: newPhases
                                  });
                                }}
                                onFocus={() => setFocusedLoraInput(inputId)}
                                onBlur={() => setFocusedLoraInput(null)}
                                className="pr-8"
                                title={lora.url}
                              />
                              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => {
                                    const newPhases = [...editablePhaseConfig.phases];
                                    newPhases[phaseIdx].loras.splice(loraIdx, 1);
                                    setEditablePhaseConfig({
                                      ...editablePhaseConfig,
                                      phases: newPhases
                                    });
                                  }}
                                  type="button"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <Input
                              type="number"
                              placeholder="Multiplier"
                              value={lora.multiplier}
                              min={0}
                              max={2}
                              step={0.1}
                              onChange={(e) => {
                                const newPhases = [...editablePhaseConfig.phases];
                                newPhases[phaseIdx].loras[loraIdx].multiplier = e.target.value;
                                setEditablePhaseConfig({
                                  ...editablePhaseConfig,
                                  phases: newPhases
                                });
                              }}
                              className="w-16 sm:w-20 flex-shrink-0 text-center"
                            />
                          </div>
                        );
                      })}
                      
                      {/* Add LoRA button */}
                      <button
                        onClick={() => {
                          const newPhases = [...editablePhaseConfig.phases];
                          newPhases[phaseIdx] = { 
                            ...newPhases[phaseIdx],
                            loras: newPhases[phaseIdx].loras.filter(l => l.url && l.url.trim() !== "")
                          };
                          newPhases[phaseIdx].loras.push({
                            url: "",
                            multiplier: "1.0"
                          });
                          setEditablePhaseConfig({
                            ...editablePhaseConfig,
                            phases: newPhases
                          });
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
                        type="button"
                      >
                        + Add LoRA
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* LoRA Selector Modal */}
          <LoraSelectorModal
            isOpen={isLoraModalOpen}
            onClose={() => {
              setIsLoraModalOpen(false);
              setActivePhaseForLoraSelection(null);
            }}
            selectedLoras={[]}
            loras={availableLoras || []}
            onAddLora={(lora) => {
              if (activePhaseForLoraSelection !== null) {
                const loraUrl = ((lora as any).huggingface_url as string) || '';
                const newPhases = [...editablePhaseConfig.phases];
                newPhases[activePhaseForLoraSelection] = { 
                  ...newPhases[activePhaseForLoraSelection],
                  loras: newPhases[activePhaseForLoraSelection].loras.filter(l => l.url && l.url.trim() !== "")
                };
                newPhases[activePhaseForLoraSelection].loras.push({
                  url: loraUrl,
                  multiplier: "1.0"
                });
                setEditablePhaseConfig({
                  ...editablePhaseConfig,
                  phases: newPhases
                });
                setIsLoraModalOpen(false);
                setActivePhaseForLoraSelection(null);
              }
            }}
            onRemoveLora={() => {}}
            onUpdateLoraStrength={() => {}}
            lora_type="Wan 2.1 14b"
          />

          {/* Sample Generations Section */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base font-semibold">Sample Generations</Label>
            <p className="text-sm text-muted-foreground">
              Add sample images or videos to showcase what this preset can generate.
            </p>
            
            {/* Display existing samples when editing */}
            {isEditMode && editingPreset?.metadata.sample_generations && editingPreset.metadata.sample_generations.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-light">Existing Samples ({editingPreset.metadata.sample_generations.filter(s => !deletedExistingSampleUrls.includes(s.url)).length})</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {editingPreset.metadata.sample_generations
                    .filter(sample => !deletedExistingSampleUrls.includes(sample.url))
                    .map((sample, index) => {
                      const isPrimary = sample.url === editingPreset.metadata.main_generation;
                      return (
                        <div key={sample.url} className="relative group">
                          <div 
                            className={`relative rounded-lg border-2 overflow-hidden ${
                              isPrimary 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' 
                                : 'border-gray-200'
                            }`}
                          >
                            {sample.type === 'image' ? (
                              <img
                                src={sample.url}
                                alt={sample.alt_text || 'Sample'}
                                className="w-full h-24 object-cover"
                              />
                            ) : (
                              <div className="relative h-24 w-full">
                                <HoverScrubVideo
                                  src={sample.url}
                                  className="h-full w-full"
                                  videoClassName="object-cover"
                                  autoplayOnHover={!isMobile}
                                  preload="metadata"
                                  loop
                                  muted
                                />
                              </div>
                            )}
                            
                            {/* Primary indicator */}
                            {isPrimary && (
                              <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                                Primary
                              </div>
                            )}
                            
                            {/* Delete button */}
                            <Button
                              size="sm"
                              variant="destructive"
                              className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletedExistingSampleUrls(prev => [...prev, sample.url]);
                              }}
                              title="Delete sample"
                            >
                              ×
                            </Button>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                            {sample.alt_text || `Sample ${index + 1}`}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Display initial video sample from last generation (when not editing OR overwriting) */}
            {(!isEditMode || isOverwriting) && initialVideoSample && !initialVideoDeleted && (
              <div className="space-y-2">
                <Label className="text-sm font-light">Last Generated Video (auto-included)</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="relative group">
                    <div className="relative rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 overflow-hidden">
                      <div className="relative h-24 w-full">
                        <HoverScrubVideo
                          src={initialVideoSample}
                          className="h-full w-full"
                          videoClassName="object-cover"
                          autoplayOnHover={!isMobile}
                          preload="metadata"
                          loop
                          muted
                        />
                      </div>
                      
                      {/* Primary indicator */}
                      <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                        Primary
                      </div>
                      
                      {/* Delete button */}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInitialVideoDeleted(true);
                        }}
                        title="Remove from preset"
                      >
                        ×
                      </Button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                      Latest video generation
                    </p>
                  </div>
                </div>
              </div>
            )}
                        
            <FileInput
              key={fileInputKey}
              onFileChange={(newFiles) => {
                setSampleFiles(prevFiles => [...prevFiles, ...newFiles]);
                setFileInputKey(prev => prev + 1);
              }}
              acceptTypes={['image', 'video']}
              multiple={true}
              label={isEditMode ? "Add more sample images/videos" : "Upload sample images/videos"}
            />
            
            {/* Display uploaded files */}
            {sampleFiles.length > 0 && (
              <div className="space-y-2 mt-3">
                <Label className="text-sm font-light">Uploaded Files ({sampleFiles.length})</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {sampleFiles.map((file, index) => (
                    <div key={index} className="relative group">
                      <div 
                        className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                          mainGenerationIndex === index 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setMainGenerationIndex(index)}
                        title={mainGenerationIndex === index ? "Primary generation" : "Click to set as primary"}
                      >
                        {file.type.startsWith('image/') ? (
                          <img
                            src={previewUrls[index] || ''}
                            alt={file.name}
                            className="w-full h-24 object-cover"
                          />
                        ) : file.type.startsWith('video/') ? (
                          <div
                            className="relative h-24 w-full"
                            onClickCapture={(e) => {
                              if (!isMobile) return;
                              const container = e.currentTarget as HTMLElement;
                              const video = container.querySelector('video') as HTMLVideoElement | null;
                              if (!video) return;
                              if (video.paused) {
                                video.play().catch(() => {});
                              } else {
                                video.pause();
                              }
                            }}
                          >
                            <HoverScrubVideo
                              src={previewUrls[index] || ''}
                              className="h-full w-full"
                              videoClassName="object-cover"
                              autoplayOnHover={!isMobile}
                              preload="metadata"
                              loop
                              muted
                            />
                          </div>
                        ) : (
                          <div className="w-full h-24 flex items-center justify-center bg-muted">
                            <span className="text-xs text-muted-foreground">Preview unavailable</span>
                          </div>
                        )}
                        
                        {/* Primary indicator */}
                        {mainGenerationIndex === index && (
                          <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                            Primary
                          </div>
                        )}
                        
                        {/* Delete button */}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newFiles = sampleFiles.filter((_, i) => i !== index);
                            setSampleFiles(newFiles);
                            if (mainGenerationIndex === index) {
                              setMainGenerationIndex(0);
                            } else if (mainGenerationIndex > index) {
                              setMainGenerationIndex(mainGenerationIndex - 1);
                            }
                          }}
                          title="Delete file"
                        >
                          ×
                        </Button>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate" title={file.name}>
                        {file.name}
                      </p>
                    </div>
                  ))}
                </div>
                {sampleFiles.length > 1 && (
                  <p className="text-xs text-gray-500">
                    Click on any image/video to set it as the primary generation. Primary generation will be featured prominently.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <ItemCardFooter>
            <Button 
              onClick={handleAddPresetFromForm}
              disabled={isSubmitting || !addForm.name.trim()}
            >
            {isSubmitting 
              ? (isEditMode ? 'Saving Changes...' : 'Creating Preset...') 
              : (isEditMode ? (isOverwriting ? 'Overwrite Preset' : 'Save Changes') : 'Create Preset')
            }
          </Button>
        </ItemCardFooter>
      </Card>
    </div>
  );
};

export const PhaseConfigSelectorModal: React.FC<PhaseConfigSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
  onRemovePreset,
  selectedPresetId,
  currentPhaseConfig,
  initialTab = 'browse',
  currentSettings,
  intent = 'load',
  availableLoras = [],
  generationTypeMode = 'i2v'
}) => {
  console.log('[PresetAutoPopulate] PhaseConfigSelectorModal rendered:', { isOpen, currentSettings });
  
  const isMobile = useIsMobile();
  const myPresetsResource = useListResources('phase-config');
  const publicPresetsResource = useListPublicResources('phase-config');
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();
  
  // Tab state management - initialize with initialTab prop
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  
  // Update activeTab when initialTab prop changes and modal opens
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  
  // Edit state management
  const [editingPreset, setEditingPreset] = useState<(Resource & { metadata: PhaseConfigMetadata }) | null>(null);
  const [isOverwriting, setIsOverwriting] = useState(false);
  
  // Filter state for footer controls
  const [showMyPresetsOnly, setShowMyPresetsOnly] = useState(false);
  const [showSelectedPresetOnly, setShowSelectedPresetOnly] = useState(false);
  
  // Auto-set showMyPresetsOnly when intent is overwrite
  useEffect(() => {
    if (intent === 'overwrite') {
      setShowMyPresetsOnly(true);
    } else {
      // Reset when closing or changing intent
      setShowMyPresetsOnly(false);
    }
  }, [intent, isOpen]);
  
  const [processedPresetsLength, setProcessedPresetsLength] = useState(0);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [setPageFn, setSetPageFn] = useState<((page: number) => void) | null>(null);
  
  // Handle pagination state from tab
  const handlePageChange = (page: number, total: number, setPage: (page: number) => void) => {
    setCurrentPage(page);
    setTotalPages(total);
    setSetPageFn(() => setPage);
  };
  
  // Handle edit action
  const handleEdit = (preset: Resource & { metadata: PhaseConfigMetadata }) => {
    setEditingPreset(preset);
    setIsOverwriting(false);
    setActiveTab('add-new');
  };

  // Handle overwrite action
  const handleOverwrite = (preset: Resource & { metadata: PhaseConfigMetadata }) => {
    setEditingPreset(preset);
    setIsOverwriting(true);
    setActiveTab('add-new');
  };
  
  // Handle clear edit
  const handleClearEdit = () => {
    setEditingPreset(null);
    setIsOverwriting(false);
  };
  
  // Modal styling and scroll fade
  const modal = useExtraLargeModal('phaseConfigSelector');
  const { showFade, scrollRef } = useScrollFade({ 
    isOpen: isOpen,
    debug: false,
    preloadFade: modal.isMobile
  });

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={modal.className}
        style={modal.style}
        {...{...modal.props}}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-1 pb-2' : 'px-6 pt-2 pb-2'} flex-shrink-0`}>
            <DialogTitle>Phase Config Presets</DialogTitle>
            <DialogDescription>Save and reuse advanced phase configurations</DialogDescription>
          </DialogHeader>
        </div>
        <div 
          ref={scrollRef}
          className={modal.scrollClass}
        >
          <div className={`${modal.isMobile ? 'px-2' : 'px-6'} py-2 flex-shrink-0`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsList className="grid w-full grid-cols-2 mb-2">
                <TabsTrigger value="browse" className="w-full">Browse Presets</TabsTrigger>
                <TabsTrigger value="add-new" className="w-full">Add New Preset</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* Tab Content */}
          <div className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsContent value="browse" className="flex-1 flex flex-col min-h-0">
                <BrowsePresetsTab 
                  onSelectPreset={onSelectPreset}
                  onRemovePreset={onRemovePreset}
                  selectedPresetId={selectedPresetId}
                  myPresetsResource={myPresetsResource}
                  publicPresetsResource={publicPresetsResource}
                  createResource={createResource}
                  updateResource={updateResource}
                  deleteResource={deleteResource}
                  onClose={onClose}
                  onEdit={handleEdit}
                  intent={intent}
                  onOverwrite={handleOverwrite}
                  showMyPresetsOnly={showMyPresetsOnly}
                  setShowMyPresetsOnly={setShowMyPresetsOnly}
                  showSelectedPresetOnly={showSelectedPresetOnly}
                  setShowSelectedPresetOnly={setShowSelectedPresetOnly}
                  onProcessedPresetsLengthChange={setProcessedPresetsLength}
                  onPageChange={handlePageChange}
                />
              </TabsContent>
              <TabsContent value="add-new" className="flex-1 min-h-0 overflow-auto">
                <AddNewTab 
                  createResource={createResource}
                  updateResource={updateResource}
                  onSwitchToBrowse={() => {
                    setActiveTab('browse');
                    handleClearEdit();
                  }}
                  currentPhaseConfig={currentPhaseConfig}
                  editingPreset={editingPreset}
                  onClearEdit={handleClearEdit}
                  currentSettings={currentSettings}
                  isOverwriting={isOverwriting}
                  availableLoras={availableLoras}
                  generationTypeMode={generationTypeMode}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
        
        {/* Control Panel Footer */}
        {activeTab === 'browse' && (
          <div className={`${modal.footerClass} relative`}>
            {/* Fade overlay */}
            {showFade && (
              <div 
                className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
                style={{ transform: 'translateY(-64px)' }}
              >
                <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
              </div>
            )}
            
            <div className={`${modal.isMobile ? 'p-4 pt-4 pb-1' : 'p-6 pt-6 pb-2'} border-t relative z-20`}>
              <div className="flex flex-col gap-3">
                {/* Filter Controls Row */}
                <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                  {/* Selected Preset Filter */}
                  <Button
                    variant={showSelectedPresetOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowSelectedPresetOnly(!showSelectedPresetOnly)}
                    className="flex items-center gap-2"
                    disabled={!selectedPresetId}
                  >
                    <Checkbox 
                      checked={showSelectedPresetOnly}
                      className="pointer-events-none h-4 w-4"
                    />
                    <span className="hidden sm:inline">Show selected preset</span>
                    <span className="sm:hidden">Selected</span>
                  </Button>

                  {/* My Presets Filter */}
                  <Button
                    variant={showMyPresetsOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowMyPresetsOnly(!showMyPresetsOnly)}
                    className="flex items-center gap-2"
                  >
                    <Checkbox 
                      checked={showMyPresetsOnly}
                      className="pointer-events-none h-4 w-4"
                    />
                    <span className="hidden sm:inline">Show my presets</span>
                    <span className="sm:hidden">My Presets</span>
                  </Button>

                  {/* Status Text */}
                  <span className="text-sm text-muted-foreground text-center flex-1 sm:flex-none">
                    {showMyPresetsOnly && showSelectedPresetOnly ? (
                      <>{processedPresetsLength} selected</>
                    ) : showMyPresetsOnly ? (
                      <>{processedPresetsLength} yours</>
                    ) : showSelectedPresetOnly ? (
                      <>{processedPresetsLength} selected</>
                    ) : (
                      <>{processedPresetsLength} total</>
                    )}
                  </span>

                  {/* Pagination */}
                  {totalPages > 1 && setPageFn && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageFn(currentPage - 1)}
                        disabled={currentPage === 0}
                        className="h-8 w-8 p-0"
                      >
                        ←
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        {currentPage + 1} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageFn(currentPage + 1)}
                        disabled={currentPage >= totalPages - 1}
                        className="h-8 w-8 p-0"
                      >
                        →
                      </Button>
                    </div>
                  )}

                  {/* Close Button */}
                  <Button 
                    variant="outline" 
                    onClick={onClose}
                    className={`flex items-center gap-1.5 ${modal.isMobile ? 'w-full mt-2' : 'ml-auto'}`}
                  >
                    <X className="h-4 w-4" />
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

