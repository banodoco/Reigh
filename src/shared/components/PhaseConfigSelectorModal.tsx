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
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/shared/components/ui/alert-dialog";
import { Info, X, Layers, Zap, Settings2, Trash2, Pencil } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from "@/shared/components/ui/badge";
import FileInput from "@/shared/components/FileInput";
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

type SortOption = 'default' | 'newest' | 'oldest' | 'mostUsed' | 'name';

interface PhaseConfigSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  selectedPresetId: string | null;
  currentPhaseConfig?: PhaseConfig; // The current config (for "Save Current" feature)
}

interface BrowsePresetsTabProps {
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  selectedPresetId: string | null;
  myPresetsResource: UseQueryResult<Resource[], Error>;
  publicPresetsResource: UseQueryResult<Resource[], Error>;
  createResource: UseMutationResult<Resource, Error, { type: 'phase-config'; metadata: PhaseConfigMetadata; }, unknown>;
  updateResource: UseMutationResult<Resource, Error, { id: string; type: 'phase-config'; metadata: PhaseConfigMetadata; }, unknown>;
  deleteResource: UseMutationResult<void, Error, { id: string; type: "phase-config"; }, unknown>;
  onClose: () => void;
  onEdit: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  showMyPresetsOnly: boolean;
  setShowMyPresetsOnly: (value: boolean) => void;
  showSelectedPresetOnly: boolean;
  setShowSelectedPresetOnly: (value: boolean) => void;
  onProcessedPresetsLengthChange: (length: number) => void;
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
  onProcessedPresetsLengthChange
}) => {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;
  
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
    
    // Deduplicate by ID, prioritizing my presets
    const presetMap = new Map<string, typeof myPresets[0]>();
    publicPresets.forEach(preset => presetMap.set(preset.id, preset));
    myPresets.forEach(preset => presetMap.set(preset.id, preset));
    
    return Array.from(presetMap.values());
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
                            {isSelected ? (
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
                          {isSelected ? (
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
                    
                    {/* Sample generations */}
                    {metadata.sample_generations && metadata.sample_generations.length > 0 && (
                      <div className="flex space-x-2 overflow-x-auto pb-2 pt-1">
                        {metadata.sample_generations.slice(0, 5).map((sample, sampleIdx) => {
                          const isVideo = sample.type === 'video';
                          return isVideo ? (
                            <div
                              key={sampleIdx}
                              className="relative h-28 w-auto min-w-20 sm:min-w-0 rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
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
                              key={sampleIdx}
                              src={sample.url}
                              alt={sample.alt_text || `Sample ${sampleIdx + 1}`}
                              className="h-28 w-auto min-w-20 sm:min-w-0 object-contain rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                              title={sample.alt_text || sample.url}
                              loading="lazy"
                            />
                          );
                        })}
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

                    {/* Config Preview */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t">
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

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="col-span-full">
              <Pagination className="pt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page > 0) setPage(page - 1); }}
                      className={page === 0 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <PaginationItem key={idx}>
                      <PaginationLink
                        href="#"
                        isActive={idx === page}
                        onClick={(e) => { e.preventDefault(); setPage(idx); }}
                      >
                        {idx + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page < totalPages - 1) setPage(page + 1); }}
                      className={page === totalPages - 1 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
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
  createResource: UseMutationResult<Resource, Error, { type: 'phase-config'; metadata: PhaseConfigMetadata; }, unknown>;
  updateResource: UseMutationResult<Resource, Error, { id: string; type: 'phase-config'; metadata: PhaseConfigMetadata; }, unknown>;
  onSwitchToBrowse: () => void;
  currentPhaseConfig?: PhaseConfig;
  editingPreset?: (Resource & { metadata: PhaseConfigMetadata }) | null;
  onClearEdit: () => void;
}

const AddNewTab: React.FC<AddNewTabProps> = ({ createResource, updateResource, onSwitchToBrowse, currentPhaseConfig, editingPreset, onClearEdit }) => {
  const isEditMode = !!editingPreset;
  const [addForm, setAddForm] = useState({
    name: '',
    description: '',
    created_by_is_you: true,
    created_by_username: '',
    is_public: true,
  });
  const [sampleFiles, setSampleFiles] = useState<File[]>([]);
  const [deletedExistingSampleUrls, setDeletedExistingSampleUrls] = useState<string[]>([]);
  const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [userName, setUserName] = useState<string>('');
  const isMobile = useIsMobile();
  
  // Pre-populate form when editing
  useEffect(() => {
    if (editingPreset && editingPreset.metadata) {
      const metadata = editingPreset.metadata;
      setAddForm({
        name: metadata.name || '',
        description: metadata.description || '',
        created_by_is_you: metadata.created_by?.is_you ?? true,
        created_by_username: metadata.created_by?.username || '',
        is_public: metadata.is_public ?? true,
      });
      
      // Reset new uploads and deleted samples when switching to a different preset
      setSampleFiles([]);
      setDeletedExistingSampleUrls([]);
      setMainGenerationIndex(0);
      setFileInputKey(prev => prev + 1);
    }
  }, [editingPreset]);

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
  
  // Calculate total steps from current config
  const totalSteps = currentPhaseConfig?.steps_per_phase?.reduce((sum, steps) => sum + steps, 0) || 0;

  const handleFormChange = (field: string, value: any) => {
    setAddForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddPresetFromForm = async () => {
    if (!addForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    
    // When editing, we can use the existing phase config from the preset
    // When creating, we need a current phase config
    const phaseConfigToUse = isEditMode ? (editingPreset?.metadata.phaseConfig || currentPhaseConfig) : currentPhaseConfig;
    if (!phaseConfigToUse) {
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
      const existingSamples = isEditMode 
        ? (editingPreset?.metadata.sample_generations || []).filter(s => !deletedExistingSampleUrls.includes(s.url))
        : [];
      const finalSamples = [...existingSamples, ...uploadedSamples];

      // Determine main generation
      let mainGeneration: string | undefined;
      if (uploadedSamples.length > 0 && uploadedSamples[mainGenerationIndex]) {
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
        phaseConfig: phaseConfigToUse,
        created_by: {
          is_you: addForm.created_by_is_you,
          username: addForm.created_by_is_you ? undefined : addForm.created_by_username,
        },
        is_public: addForm.is_public,
        sample_generations: finalSamples.length > 0 ? finalSamples : undefined,
        main_generation: mainGeneration,
        use_count: isEditMode ? (editingPreset?.metadata.use_count || 0) : 0,
        created_at: isEditMode ? (editingPreset?.metadata.created_at || new Date().toISOString()) : new Date().toISOString(),
      };

      if (isEditMode && editingPreset) {
        await updateResource.mutateAsync({ 
          id: editingPreset.id, 
          type: 'phase-config', 
          metadata: presetMetadata as any 
        });
        toast.success('Preset updated successfully');
        onClearEdit();
      } else {
        await createResource.mutateAsync({ type: 'phase-config', metadata: presetMetadata as any });
        toast.success('Preset created successfully');
      }

      // Reset form
      setAddForm({
        name: '',
        description: '',
        created_by_is_you: true,
        created_by_username: '',
        is_public: true,
      });
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
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Editing: {editingPreset?.metadata.name}
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
              });
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
          <CardTitle>{isEditMode ? 'Edit Phase Config Preset' : 'Create New Phase Config Preset'}</CardTitle>
          <CardDescription>
            {isEditMode ? 'Update your phase configuration preset.' : 'Save your current phase configuration for reuse.'}
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

          <div className="space-y-2">
            {/* Display existing samples when editing */}
            {isEditMode && editingPreset?.metadata.sample_generations && editingPreset.metadata.sample_generations.length > 0 && (
              <div className="space-y-2 mb-3">
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
                        
            <FileInput
              key={fileInputKey}
              onFileChange={(newFiles) => {
                setSampleFiles(prevFiles => [...prevFiles, ...newFiles]);
                setFileInputKey(prev => prev + 1);
              }}
              acceptTypes={['image', 'video']}
              multiple={true}
              label={isEditMode ? "Add more sample images/videos (optional)" : "Upload sample images/videos (optional)"}
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

          <div className="space-y-2 pt-2 border-t">
            <Label>Current Phase Configuration *</Label>
            {currentPhaseConfig ? (
              <div className="p-3 bg-accent/20 rounded-lg border space-y-2">
                <p className="text-sm font-medium">This preset will save your current configuration:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Phases:</span>
                    <span className="ml-1 font-medium">{currentPhaseConfig.num_phases}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Steps:</span>
                    <span className="ml-1 font-medium">{totalSteps}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Solver:</span>
                    <span className="ml-1 font-medium capitalize">{currentPhaseConfig.sample_solver}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Flow Shift:</span>
                    <span className="ml-1 font-medium">{currentPhaseConfig.flow_shift}</span>
                  </div>
                </div>
                {currentPhaseConfig.phases && currentPhaseConfig.phases.length > 0 && (
                  <div className="pt-2 border-t space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Phase Details:</p>
                    {currentPhaseConfig.phases.map((phase, idx) => (
                      <div key={idx} className="text-xs flex items-center gap-2">
                        <span className="font-medium">Phase {phase.phase}:</span>
                        <span>Guidance {phase.guidance_scale}</span>
                        <span>• Steps {currentPhaseConfig.steps_per_phase?.[idx] || 0}</span>
                        {phase.loras && phase.loras.length > 0 && (
                          <span className="text-muted-foreground">• {phase.loras.length} LoRA{phase.loras.length > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-muted/30 rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">No phase configuration available. Enable Advanced Mode and configure your phases first.</p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Created By</Label>
            <div className="flex items-center space-x-2 mb-2">
              <Checkbox 
                id="created-by-you" 
                checked={addForm.created_by_is_you}
                onCheckedChange={(checked) => handleFormChange('created_by_is_you', checked)}
              />
              <Label htmlFor="created-by-you" className="font-normal">This is my creation</Label>
            </div>
            {!addForm.created_by_is_you && (
              <Input 
                placeholder="Creator's username" 
                value={addForm.created_by_username} 
                onChange={e => handleFormChange('created_by_username', e.target.value)} 
                maxLength={30}
              />
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="is-public" 
              checked={addForm.is_public}
              onCheckedChange={(checked) => handleFormChange('is_public', checked)}
            />
            <Label htmlFor="is-public">Available to others</Label>
          </div>
        </CardContent>
        <ItemCardFooter>
          <Button 
            onClick={handleAddPresetFromForm}
            disabled={
              isSubmitting || 
              !addForm.name.trim() || 
              (!isEditMode && !currentPhaseConfig)
            }
          >
            {isSubmitting 
              ? (isEditMode ? 'Saving Changes...' : 'Creating Preset...') 
              : (isEditMode ? 'Save Changes' : 'Create Preset')
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
}) => {
  const isMobile = useIsMobile();
  const myPresetsResource = useListResources('phase-config');
  const publicPresetsResource = useListPublicResources('phase-config');
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();
  
  // Tab state management
  const [activeTab, setActiveTab] = useState<string>('browse');
  
  // Edit state management
  const [editingPreset, setEditingPreset] = useState<(Resource & { metadata: PhaseConfigMetadata }) | null>(null);
  
  // Filter state for footer controls
  const [showMyPresetsOnly, setShowMyPresetsOnly] = useState(false);
  const [showSelectedPresetOnly, setShowSelectedPresetOnly] = useState(false);
  const [processedPresetsLength, setProcessedPresetsLength] = useState(0);
  
  // Handle edit action
  const handleEdit = (preset: Resource & { metadata: PhaseConfigMetadata }) => {
    setEditingPreset(preset);
    setActiveTab('add-new');
  };
  
  // Handle clear edit
  const handleClearEdit = () => {
    setEditingPreset(null);
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
                  showMyPresetsOnly={showMyPresetsOnly}
                  setShowMyPresetsOnly={setShowMyPresetsOnly}
                  showSelectedPresetOnly={showSelectedPresetOnly}
                  setShowSelectedPresetOnly={setShowSelectedPresetOnly}
                  onProcessedPresetsLengthChange={setProcessedPresetsLength}
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

