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
import { useListResources, useCreateResource, useUpdateResource, useDeleteResource, Resource } from '@/shared/hooks/useResources';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/shared/components/ui/pagination";
import FileInput from "@/shared/components/FileInput";
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { Checkbox } from "@/shared/components/ui/checkbox";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Info, X, Pencil, Trash2, Search } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { Slider } from "@/shared/components/ui/slider";
import { supabase } from '@/integrations/supabase/client';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

// Model filter categories - broad matching
type ModelFilterCategory = 'all' | 'qwen' | 'wan' | 'z-image';

// Map a specific lora_type to its broad filter category
function getFilterCategory(loraType: string | undefined): ModelFilterCategory {
  if (!loraType) return 'all';
  const lower = loraType.toLowerCase();
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('wan')) return 'wan';
  if (lower.includes('z-image') || lower === 'z-image') return 'z-image';
  return 'all';
}

// Check if a lora matches a filter category
function matchesFilterCategory(loraType: string | undefined, filter: ModelFilterCategory): boolean {
  if (filter === 'all') return true;
  if (!loraType) return false;
  const lower = loraType.toLowerCase();
  switch (filter) {
    case 'qwen': return lower.includes('qwen');
    case 'wan': return lower.includes('wan');
    case 'z-image': return lower.includes('z-image') || lower === 'z-image';
    default: return true;
  }
}

// Get sub-filter options for a category
function getSubFilterOptions(category: ModelFilterCategory): { value: string; label: string }[] {
  switch (category) {
    case 'qwen':
      return [
        { value: 'all', label: 'All' },
        { value: 'Qwen Image', label: 'Qwen Image' },
        { value: 'Qwen Image 2512', label: 'Qwen Image 2512' },
      ];
    case 'wan':
      return [
        { value: 'all', label: 'All' },
        { value: 'Wan 2.1 14b', label: 'Wan 2.1 14b' },
      ];
    case 'z-image':
      return [
        { value: 'all', label: 'All' },
        { value: 'Z-Image', label: 'Z-Image' },
      ];
    default:
      return [];
  }
}

// Check if a lora matches both category and sub-filter
function matchesFilters(loraType: string | undefined, category: ModelFilterCategory, subFilter: string): boolean {
  // First check category
  if (!matchesFilterCategory(loraType, category)) return false;
  // Then check sub-filter (if not 'all')
  if (subFilter === 'all') return true;
  return loraType === subFilter;
}

// Description Modal Component
const DescriptionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
}> = ({ isOpen, onClose, title, description }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-light">{title}</DialogTitle>
          <DialogDescription>Full description</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4 overflow-y-auto">
          <div className="py-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {description}
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

interface LoraModelImage {
  alt_text: string;
  url: string;
  type?: string;
  source?: string;
}

interface LoraModelFile {
  path: string;
  url: string;
  size?: number;
  last_modified?: string;
}

export interface LoraModel {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: LoraModelImage[];
  "Model Files": LoraModelFile[];
  Description?: string;
  Tags?: string[];
  "Last Modified"?: string;
  Downloads?: number;
  Likes?: number;
  lora_type?: string;
  // New fields
  created_by?: {
    is_you: boolean;
    username?: string;
  };
  huggingface_url?: string;
  filename?: string;
  base_model?: string;
  sample_generations?: {
    url: string;
    type: 'image' | 'video';
    alt_text?: string;
  }[];
  main_generation?: string; // URL to the main generation
  is_public?: boolean;
  trigger_word?: string; // New field for trigger word
  // Multi-stage LoRA support (for Wan 2.2 I2V)
  high_noise_url?: string; // URL for high-noise phases
  low_noise_url?: string;  // URL for low-noise (final) phase
  [key: string]: unknown;
}

type SortOption = 'default' | 'downloads' | 'likes' | 'lastModified' | 'name';

interface LoraSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  loras: LoraModel[];
  onAddLora: (lora: LoraModel) => void;
  /** Callback to remove a LoRA from the generator */
  onRemoveLora: (loraId: string) => void;
  /** Callback to update a LoRA's strength */
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: (LoraModel & { strength: number })[];
  lora_type: string;
}

interface CommunityLorasTabProps {
  loras: LoraModel[];
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: (LoraModel & { strength: number })[];
  lora_type: string;
  myLorasResource: UseQueryResult<Resource[], Error>;
  createResource: UseMutationResult<Resource, Error, { type: 'lora'; metadata: LoraModel; }, unknown>;
  updateResource: UseMutationResult<Resource, Error, { id: string; type: 'lora'; metadata: LoraModel; }, unknown>;
  deleteResource: UseMutationResult<void, Error, { id: string; type: "lora"; }, unknown>;
  onEdit: (lora: Resource & { metadata: LoraModel }) => void;
  onPageChange?: (page: number, totalPages: number, setPage: (page: number) => void) => void;
}

const CommunityLorasTab: React.FC<CommunityLorasTabProps & {
  onClose: () => void;
  showMyLorasOnly: boolean;
  setShowMyLorasOnly: (value: boolean) => void;
  showAddedLorasOnly: boolean;
  setShowAddedLorasOnly: (value: boolean) => void;
  onProcessedLorasLengthChange: (length: number) => void;
  selectedModelFilter: ModelFilterCategory;
  setSelectedModelFilter: (value: ModelFilterCategory) => void;
  selectedSubFilter: string;
  setSelectedSubFilter: (value: string) => void;
}> = ({
  loras,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
  selectedLoras,
  lora_type,
  myLorasResource,
  createResource,
  updateResource,
  deleteResource,
  onClose,
  onEdit,
  showMyLorasOnly,
  setShowMyLorasOnly,
  showAddedLorasOnly,
  setShowAddedLorasOnly,
  onProcessedLorasLengthChange,
  onPageChange,
  selectedModelFilter,
  setSelectedModelFilter,
  selectedSubFilter,
  setSelectedSubFilter,
}) => {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('downloads');
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 12;

  // Description modal state
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState<{ title: string; description: string }>({ title: '', description: '' });

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loraToDelete, setLoraToDelete] = useState<{ id: string; name: string; isAdded: boolean } | null>(null);

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (loraToDelete) {
      deleteResource.mutate({ id: loraToDelete.id, type: 'lora' });
      if (loraToDelete.isAdded) {
        onRemoveLora(loraToDelete.id);
      }
      setDeleteDialogOpen(false);
      setLoraToDelete(null);
    }
  };

  const selectedLoraMap = useMemo(() => new Map(selectedLoras.map(l => [l['Model ID'], l.strength])), [selectedLoras]);
  const selectedLoraIds = useMemo(() => Array.from(selectedLoraMap.keys()), [selectedLoraMap]);

  const myLoraModelIds = useMemo(() => myLorasResource.data?.map(r => r.metadata["Model ID"]) || [], [myLorasResource.data]);

  // Handle description modal
  const handleShowFullDescription = (title: string, description: string) => {
    setSelectedDescription({ title, description });
    setDescriptionModalOpen(true);
  };
  
  // Local Wan LoRAs (files dropped into Headless-Wan2GP/loras)
  const [localWanLoras, setLocalWanLoras] = useState<LoraModel[]>([]);

  // Combine all LoRAs (community + saved + local)
  const allLoras = useMemo(() => {
    // Filter by selected model filter category and sub-filter
    const filterByModel = (l: LoraModel) => matchesFilters(l.lora_type, selectedModelFilter, selectedSubFilter);
    const communityLoras = loras.filter(filterByModel);
    const savedLoras = myLorasResource.data?.map(r => ({
      ...(r.metadata as LoraModel),
      _resourceId: r.id, // Add resource ID for deletion
      created_by: (r.metadata as LoraModel).created_by || { is_you: true },
    })).filter(filterByModel) || [];
    const localLoras = localWanLoras.filter(filterByModel);
    
    // Create a map to deduplicate by Model ID, prioritizing saved LoRAs (which have _resourceId)
    const loraMap = new Map<string, LoraModel>();
    
    // Add community LoRAs first
    communityLoras.forEach(lora => {
      loraMap.set(lora["Model ID"], lora);
    });
    
    // Add local LoRAs (will overwrite community if same ID)
    localLoras.forEach(lora => {
      loraMap.set(lora["Model ID"], lora);
    });
    
    // Add saved LoRAs last (will overwrite community/local if same ID, and these have _resourceId for deletion)
    savedLoras.forEach(lora => {
      loraMap.set(lora["Model ID"], lora);
    });
    
    return Array.from(loraMap.values());
  }, [loras, myLorasResource.data, localWanLoras, selectedModelFilter, selectedSubFilter]);

  const processedLoras = useMemo(() => {
    let filtered = allLoras;
    
    // Filter by "My LoRAs Only" if enabled
    if (showMyLorasOnly) {
      filtered = filtered.filter(lora => {
        return lora.created_by?.is_you || 
               lora.Author === 'You' || 
               lora.Author === 'You (Local)' ||
               myLoraModelIds.includes(lora["Model ID"]);
      });
    }
    
    // Filter by "Added LoRAs Only" if enabled
    if (showAddedLorasOnly) {
      filtered = filtered.filter(lora => {
        return selectedLoraMap.has(lora["Model ID"]);
      });
    }
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(lora => {
        for (const key in lora) {
          if (Object.prototype.hasOwnProperty.call(lora, key)) {
            const value = lora[key];
            if (typeof value === 'string' && value.toLowerCase().includes(term)) {
              return true;
            }
            if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
              if (value.some(item => (item as string).toLowerCase().includes(term))) {
                return true;
              }
            }
          }
        }
        return false;
      });
    }

    const sorted = [...filtered];
    switch (sortOption) {
      case 'downloads':
        sorted.sort((a, b) => (b.Downloads || 0) - (a.Downloads || 0));
        break;
      case 'likes':
        sorted.sort((a, b) => (b.Likes || 0) - (a.Likes || 0));
        break;
      case 'lastModified':
        sorted.sort((a, b) => {
          const dateA = a["Last Modified"] ? new Date(a["Last Modified"]).getTime() : 0;
          const dateB = b["Last Modified"] ? new Date(b["Last Modified"]).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case 'name':
        sorted.sort((a, b) => a.Name.localeCompare(b.Name));
        break;
      case 'default':
      default:
        // No specific sort for default, keeps original (potentially pre-filtered) order
        break;
    }
    return sorted;
  }, [allLoras, searchTerm, sortOption, showMyLorasOnly, showAddedLorasOnly, myLoraModelIds, selectedLoraMap]);

  // Update parent with processed LoRAs length
  React.useEffect(() => {
    onProcessedLorasLengthChange(processedLoras.length);
  }, [processedLoras.length, onProcessedLorasLengthChange]);

  // Reset page when filter/sort changes
  React.useEffect(() => { setPage(0); }, [searchTerm, sortOption, showMyLorasOnly, showAddedLorasOnly]);

  const totalPages = Math.ceil(processedLoras.length / ITEMS_PER_PAGE);
  const paginatedLoras = useMemo(() => processedLoras.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE), [processedLoras, page]);

  // Notify parent about pagination state
  React.useEffect(() => {
    if (onPageChange) {
      onPageChange(page, totalPages, setPage);
    }
  }, [page, totalPages, onPageChange]);

  const myLorasCount = allLoras.filter(lora => 
    lora.created_by?.is_you || 
    lora.Author === 'You' || 
    lora.Author === 'You (Local)' ||
    myLoraModelIds.includes(lora["Model ID"])
  ).length;

  return (
    <div className="relative flex flex-col h-full min-h-0 px-0 sm:px-4">

      <div className="flex gap-2 mb-3">
        <Input
          type="text"
          placeholder="Search all LoRA fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-grow"
        />
        <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
          <SelectTrigger variant="retro" className="w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent variant="retro">
            <SelectItem variant="retro" value="default">Default</SelectItem>
            <SelectItem variant="retro" value="downloads">Downloads</SelectItem>
            <SelectItem variant="retro" value="likes">Likes</SelectItem>
            <SelectItem variant="retro" value="lastModified">Modified</SelectItem>
            <SelectItem variant="retro" value="name">Name</SelectItem>
          </SelectContent>
        </Select>
        {/* Model Filter Dropdown - far right */}
        <Select value={selectedModelFilter} onValueChange={(v) => setSelectedModelFilter(v as ModelFilterCategory)}>
          <SelectTrigger variant="retro" className="w-[120px] ml-auto">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent variant="retro">
            <SelectItem variant="retro" value="all">All Models</SelectItem>
            <SelectItem variant="retro" value="qwen">Qwen</SelectItem>
            <SelectItem variant="retro" value="wan">Wan</SelectItem>
            <SelectItem variant="retro" value="z-image">Z-Image</SelectItem>
          </SelectContent>
        </Select>
        {/* Sub-filter - appears when a category is selected */}
        {selectedModelFilter !== 'all' && (
          <Select value={selectedSubFilter} onValueChange={setSelectedSubFilter}>
            <SelectTrigger variant="retro" className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent variant="retro">
              {getSubFilterOptions(selectedModelFilter).map(opt => (
                <SelectItem key={opt.value} variant="retro" value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
              {/* Scrollable content area with floating controls */}
        <div className="flex-1 min-h-0 overflow-y-auto relative">
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-2 ${isMobile ? 'pb-2' : 'pb-4'}`}>
          {paginatedLoras.length > 0 ? (
            paginatedLoras.map((lora) => {
              const isSelectedOnGenerator = selectedLoraMap.has(lora["Model ID"]);
              const strength = selectedLoraMap.get(lora["Model ID"]);
              const isMyLora = lora.created_by?.is_you || 
                              lora.Author === 'You' || 
                              lora.Author === 'You (Local)' ||
                              myLoraModelIds.includes(lora["Model ID"]);
              const isInSavedLoras = myLoraModelIds.includes(lora["Model ID"]);
              const isLocalLora = lora.Author === 'You (Local)';
              const resourceId = (lora as LoraModel & { _resourceId?: string })._resourceId;

              return (
                <Card 
                  key={lora["Model ID"]} 
                  className={`w-full h-full transition-all duration-200 shadow-none ${
                    isSelectedOnGenerator 
                      ? 'border-green-500' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex flex-row p-2 gap-2 h-full">
                    {/* Left side: Info and controls */}
                    <div className="flex-1 min-w-0 flex flex-col min-h-20 h-full">
                      {/* Top content */}
                      <div>
                        {/* Title row */}
                        <div className="flex items-start gap-1.5 mb-0.5">
                          <CardTitle className="text-base leading-tight truncate" title={lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}>
                            {lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}
                          </CardTitle>
                          {isMyLora && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex-shrink-0">
                              {isLocalLora ? 'Local' : 'Mine'}
                            </span>
                          )}
                        </div>
                        
                        {/* Author & stats */}
                        <p className="text-xs text-muted-foreground truncate" title={lora.Author}>
                          {lora.Author}
                          {(lora.Downloads || lora.Likes) && ' · '}
                          {lora.Downloads && <span>↓{lora.Downloads.toLocaleString()}</span>}
                          {lora.Downloads && lora.Likes && ' '}
                          {lora.Likes && <span>♥{lora.Likes.toLocaleString()}</span>}
                        </p>
                        
                        {/* Description */}
                        {lora.Description && (
                          <p 
                            className="text-[11px] text-muted-foreground/80 truncate cursor-pointer hover:text-muted-foreground mt-0.5" 
                            title={lora.Description}
                            onClick={() => handleShowFullDescription(lora.Name, lora.Description)}
                          >
                            {lora.Description}
                          </p>
                        )}
                      </div>
                      
                      {/* Bottom section - pushed to bottom */}
                      <div className="mt-auto pt-1.5">
                        {/* Action buttons */}
                        <div className="flex gap-1 flex-wrap">
                          {isSelectedOnGenerator ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                console.log('[LoraRemovalDebug] Remove button clicked in LoraSelectorModal for LoRA:', { id: lora["Model ID"], name: lora.Name });
                                onRemoveLora(lora["Model ID"]);
                              }}
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                if (lora["Model Files"] && lora["Model Files"].length > 0) {
                                  onAddLora(lora);
                                }
                              }}
                              disabled={!lora["Model Files"] || lora["Model Files"].length === 0}
                            >
                              Add
                            </Button>
                          )}
                          {!isMyLora && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => createResource.mutate({ type: 'lora', metadata: lora })}
                              disabled={isInSavedLoras || createResource.isPending}
                            >
                              {isInSavedLoras ? 'Saved' : 'Save'}
                            </Button>
                          )}
                          {isMyLora && !isLocalLora && resourceId && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  onEdit({ id: resourceId, metadata: lora } as Resource & { metadata: LoraModel });
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  setLoraToDelete({ 
                                    id: resourceId, 
                                    name: lora.Name, 
                                    isAdded: isSelectedOnGenerator 
                                  });
                                  setDeleteDialogOpen(true);
                                }}
                                disabled={deleteResource.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                        
                        {/* Strength slider - below buttons when selected */}
                        {isSelectedOnGenerator && (
                          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-green-200 dark:border-green-800">
                            <Label htmlFor={`lora-strength-${lora['Model ID']}`} className="text-[11px] flex-shrink-0 text-green-700 dark:text-green-300">Strength:</Label>
                            <Slider
                              id={`lora-strength-${lora['Model ID']}`}
                              value={[strength ?? 1]}
                              onValueChange={(value) => onUpdateLoraStrength(lora['Model ID'], value[0])}
                              min={0} max={2} step={0.05}
                              className="flex-1"
                            />
                            <span className="text-[11px] font-light w-8 text-right text-green-700 dark:text-green-300">{strength?.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Right side: Sample thumbnail */}
                    <div className="flex-shrink-0 flex items-start relative">
                      {/* Model type badge - bottom right of thumbnail */}
                      {lora.lora_type && (
                        <span className="absolute bottom-0 right-0 z-10 px-1 py-0.5 text-[8px] font-medium bg-black/70 text-white rounded-tl rounded-br whitespace-nowrap">
                          {lora.lora_type}
                        </span>
                      )}
                      {lora.main_generation ? (
                        (() => {
                          const mainSample = lora.sample_generations?.find(s => s.url === lora.main_generation);
                          const isVideo = mainSample?.type === 'video';
                          return isVideo ? (
                            <div
                              className="relative h-20 w-20 rounded border overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
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
                                src={lora.main_generation}
                                className="h-full w-full"
                                videoClassName="object-cover"
                                autoplayOnHover={!isMobile}
                                preload="metadata"
                                loop
                                muted
                              />
                            </div>
                          ) : (
                            <img
                              src={lora.main_generation}
                              alt={mainSample?.alt_text || `${lora.Name} main sample`}
                              className="h-20 w-20 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                              title={mainSample?.alt_text || lora.main_generation}
                              loading="lazy"
                            />
                          );
                        })()
                      ) : lora.Images && lora.Images.length > 0 ? (
                        (() => {
                          const image = lora.Images[0];
                          const isVideo = image.type?.startsWith('video');
                          return isVideo ? (
                            <div
                              className="relative h-20 w-20 rounded border overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
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
                                src={image.url}
                                className="h-full w-full"
                                videoClassName="object-cover"
                                autoplayOnHover={!isMobile}
                                preload="metadata"
                                loop
                                muted
                              />
                            </div>
                          ) : (
                            <img
                              src={image.url}
                              alt={image.alt_text || `${lora.Name} sample`}
                              className="h-20 w-20 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                              title={image.alt_text || image.url}
                              loading="lazy"
                            />
                          );
                        })()
                      ) : (
                        <div className="h-20 w-20 rounded border bg-muted flex items-center justify-center">
                          <span className="text-[10px] text-muted-foreground">No image</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <div className="col-span-full flex items-center justify-center py-12">
              <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 text-center max-w-sm">
                <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-base font-medium text-foreground mb-1">No LoRA models found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
              </div>
            </div>
          )}
        </div>


      </div>

      {/* Description Modal */}
      <DescriptionModal 
        isOpen={descriptionModalOpen}
        onClose={() => setDescriptionModalOpen(false)}
        title={selectedDescription.title}
        description={selectedDescription.description}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete LoRA</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{loraToDelete?.name}"? This action cannot be undone.
              {loraToDelete?.isAdded && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Note: This LoRA is currently added to your generator and will be removed.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setLoraToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete LoRA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
};

interface MyLorasTabProps {
  myLorasResource: UseQueryResult<Resource[], Error>;
  onAddLora: (lora: LoraModel) => void;
  /** Callback to remove a LoRA from the generator */
  onRemoveLora: (loraId: string) => void;
  selectedLoraIds: string[];
  deleteResource: UseMutationResult<void, Error, { id: string; type: "lora"; }, unknown>;
  createResource: UseMutationResult<Resource, Error, { type: 'lora'; metadata: LoraModel; }, unknown>;
  updateResource: UseMutationResult<Resource, Error, { id: string; type: 'lora'; metadata: LoraModel; }, unknown>;
  /** The LoRA type currently being viewed/edited */
  lora_type: string;
  /** Callback to switch to the browse tab */
  onSwitchToBrowse: () => void;
  /** LoRA being edited (if any) */
  editingLora?: (Resource & { metadata: LoraModel }) | null;
  /** Callback to clear edit state */
  onClearEdit: () => void;
  /** Default is_public value from user privacy settings */
  defaultIsPublic: boolean;
}

const MyLorasTab: React.FC<MyLorasTabProps> = ({ myLorasResource, onAddLora, onRemoveLora, selectedLoraIds, deleteResource, createResource, updateResource, lora_type, onSwitchToBrowse, editingLora, onClearEdit, defaultIsPublic }) => {
    const isEditMode = !!editingLora;
    const [addForm, setAddForm] = useState({
        name: '',
        description: '',
        created_by_is_you: false,
        created_by_username: '',
        huggingface_url: '',
        base_model: 'Wan 2.2 I2V',
        is_public: defaultIsPublic,
        trigger_word: '', // Add trigger word to form state
        // Multi-stage LoRA fields (for Wan 2.2 I2V)
        high_noise_url: '',
        low_noise_url: '',
    });

    // Check if current base_model supports multi-stage URLs (Wan 2.2 I2V and T2V)
    const supportsMultiStage = addForm.base_model === 'Wan 2.2 I2V' || addForm.base_model === 'Wan 2.2 T2V';

    // Track whether user wants single or multi-stage mode for Wan 2.2 models
    // Default to 'multi' since most Wan 2.2 LoRAs have separate high/low noise files
    const [loraMode, setLoraMode] = useState<'single' | 'multi'>('multi');

    // Actual multi-stage mode: only if model supports it AND user selected multi mode
    const isMultiStageModel = supportsMultiStage && loraMode === 'multi';
    
    const [sampleFiles, setSampleFiles] = useState<File[]>([]);
    const [deletedExistingSampleUrls, setDeletedExistingSampleUrls] = useState<string[]>([]);
    const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [fileInputKey, setFileInputKey] = useState<number>(0); // Used to reset FileInput
    const [userName, setUserName] = useState<string>('');

    // Local Wan LoRAs (files dropped into Headless-Wan2GP/loras)
    const [localWanLoras, setLocalWanLoras] = useState<LoraModel[]>([]);

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
    }, [sampleFiles, mainGenerationIndex]); // Removed previewUrls from dependencies to prevent infinite loop

    // Pre-populate form when editing
    useEffect(() => {
        if (editingLora && editingLora.metadata) {
            const metadata = editingLora.metadata;
            setAddForm({
                name: metadata.Name || '',
                description: metadata.Description || '',
                created_by_is_you: metadata.created_by?.is_you ?? false,
                created_by_username: metadata.created_by?.username || '',
                huggingface_url: metadata["Model Files"]?.[0]?.url || '',
                base_model: metadata.base_model || 'Wan 2.1 T2V',
                is_public: metadata.is_public ?? true,
                trigger_word: metadata.trigger_word || '',
                // Multi-stage LoRA fields
                high_noise_url: metadata.high_noise_url || '',
                low_noise_url: metadata.low_noise_url || '',
            });

            // Set loraMode based on whether this LoRA has multi-stage URLs
            const hasMultiStageUrls = !!(metadata.high_noise_url && metadata.low_noise_url);
            setLoraMode(hasMultiStageUrls ? 'multi' : 'single');

            // Reset new uploads and deleted samples when switching to a different LoRA
            setSampleFiles([]);
            setDeletedExistingSampleUrls([]);
            setMainGenerationIndex(0);
            setFileInputKey(prev => prev + 1);
        }
    }, [editingLora]);

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

    const extractFilenameFromUrl = (url: string) => {
        try {
            // Extract filename from /resolve/ URL
            const urlParts = url.split('/');
            const filename = urlParts[urlParts.length - 1];
            return filename || '';
        } catch {
            return '';
        }
    };

    const generateUniqueFilename = (name: string, baseModel: string, huggingfaceUrl: string = '', existingFilenames: string[] = []) => {
        // First try to get filename from HuggingFace URL
        let filename = extractFilenameFromUrl(huggingfaceUrl);
        
        // If filename is generic, too short, or missing, make it specific
        const genericNames = ['model.safetensors', 'lora.safetensors', 'pytorch_lora_weights.safetensors'];
        const isGeneric = genericNames.includes(filename.toLowerCase()) || filename.length < 8;
        
        if (!filename || isGeneric) {
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const cleanBaseModel = baseModel.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const extension = filename.includes('.') ? filename.split('.').pop() : 'safetensors';
            filename = `${cleanName}_${cleanBaseModel}.${extension}`;
        }
        
        // Ensure filename is unique by adding suffix if needed
        let uniqueFilename = filename;
        let counter = 1;
        while (existingFilenames.includes(uniqueFilename)) {
            const baseName = filename.substring(0, filename.lastIndexOf('.'));
            const extension = filename.substring(filename.lastIndexOf('.'));
            uniqueFilename = `${baseName}_${counter}${extension}`;
            counter++;
        }
        
        return uniqueFilename;
    };

    // Get existing filenames from saved LoRAs and local LoRAs
    const getExistingFilenames = () => {
        const savedFilenames = myLorasResource.data?.map(r => (r.metadata as LoraModel).filename || (r.metadata as LoraModel)["Model ID"]) || [];
        const localFilenames = localWanLoras.map(l => l.filename || l["Model ID"]);
        return [...savedFilenames, ...localFilenames];
    };

    const validateHuggingFaceUrl = (url: string) => {
        if (!url) return { isValid: false, message: 'URL is required' };
        
        // Check if it's a /resolve/ URL
        if (!url.includes('/resolve/')) {
            return { 
                isValid: false, 
                message: 'Must be a /resolve/ URL for direct download' 
            };
        }
        
        // Check if it's a HuggingFace URL
        if (!url.includes('huggingface.co')) {
            return { 
                isValid: false, 
                message: 'Must be a HuggingFace URL' 
            };
        }
        
        return { isValid: true, message: '' };
    };

    const handleFormChange = (field: string, value: any) => {
        setAddForm(prev => ({ ...prev, [field]: value }));
    };

    const handleAddLoraFromForm = async () => {
        if (!addForm.name.trim()) {
            toast.error("Name is required");
            return;
        }

        // Samples are optional - users may not have any to upload

        // Validate URLs based on whether this is a multi-stage model
        if (isMultiStageModel) {
            // For Wan 2.2 multi-stage, require at least one URL (high or low noise)
            const hasHighNoise = addForm.high_noise_url.trim().length > 0;
            const hasLowNoise = addForm.low_noise_url.trim().length > 0;

            if (!hasHighNoise && !hasLowNoise) {
                toast.error("Please provide at least one LoRA URL (High Noise or Low Noise)");
                return;
            }

            // Validate URLs that are provided
            if (hasHighNoise) {
                const highNoiseValidation = validateHuggingFaceUrl(addForm.high_noise_url);
                if (!highNoiseValidation.isValid) {
                    toast.error(`Invalid High Noise URL: ${highNoiseValidation.message}`);
                    return;
                }
            }
            if (hasLowNoise) {
                const lowNoiseValidation = validateHuggingFaceUrl(addForm.low_noise_url);
                if (!lowNoiseValidation.isValid) {
                    toast.error(`Invalid Low Noise URL: ${lowNoiseValidation.message}`);
                    return;
                }
            }
        } else {
            // For other models, require the single huggingface_url
            const urlValidation = validateHuggingFaceUrl(addForm.huggingface_url);
            if (!urlValidation.isValid) {
                toast.error(`Invalid HuggingFace URL: ${urlValidation.message}`);
                return;
            }
        }

        setIsSubmitting(true);
        
        try {
            // Upload sample generations
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
                ? (editingLora?.metadata.sample_generations || []).filter(s => !deletedExistingSampleUrls.includes(s.url))
                : [];
            const existingImages = isEditMode 
                ? (editingLora?.metadata.Images || []).filter(img => !deletedExistingSampleUrls.includes(img.url))
                : [];
            
            const finalSamples = [...existingSamples, ...uploadedSamples];
            const finalImages = [
                ...existingImages,
                ...uploadedSamples.map(sample => ({
                    url: sample.url,
                    alt_text: sample.alt_text || '',
                    type: sample.type,
                }))
            ];

            // Determine main generation
            let mainGeneration: string | undefined;
            if (uploadedSamples.length > 0 && uploadedSamples[mainGenerationIndex]) {
                mainGeneration = uploadedSamples[mainGenerationIndex].url;
            } else if (isEditMode && editingLora?.metadata.main_generation && !deletedExistingSampleUrls.includes(editingLora.metadata.main_generation)) {
                // Keep existing main generation if it wasn't deleted
                mainGeneration = editingLora.metadata.main_generation;
            } else if (finalSamples.length > 0) {
                // Default to first sample if no main generation set
                mainGeneration = finalSamples[0].url;
            }

            // Generate unique filename - or use existing if editing
            const existingFilenames = getExistingFilenames();
            const uniqueFilename = isEditMode 
                ? (editingLora?.metadata["Model ID"] || editingLora?.metadata.filename || generateUniqueFilename(addForm.name, addForm.base_model, addForm.huggingface_url, existingFilenames))
                : generateUniqueFilename(addForm.name, addForm.base_model, addForm.huggingface_url, existingFilenames);

            // Determine the primary URL for Model Files
            // For multi-stage models, use high_noise_url if available, else low_noise_url
            const primaryUrl = isMultiStageModel
                ? (addForm.high_noise_url.trim() || addForm.low_noise_url.trim())
                : addForm.huggingface_url;

            // Create/Update the LoRA model
            const loraMetadata: LoraModel = {
                "Model ID": uniqueFilename,
                Name: addForm.name,
                Author: addForm.created_by_is_you ? (userName || 'You') : (addForm.created_by_username || 'Unknown'),
                Description: addForm.description || undefined,
                Images: finalImages,
                "Model Files": [{
                    path: uniqueFilename,
                    url: primaryUrl,
                }],
                lora_type: 'Wan 2.1 14b', // Fixed value since we removed the field
                created_by: {
                    is_you: addForm.created_by_is_you,
                    username: addForm.created_by_is_you ? undefined : addForm.created_by_username,
                },
                huggingface_url: isMultiStageModel ? undefined : addForm.huggingface_url, // Only set for single-stage
                filename: uniqueFilename,
                base_model: addForm.base_model,
                sample_generations: finalSamples,
                main_generation: mainGeneration,
                is_public: addForm.is_public,
                "Last Modified": new Date().toISOString(),
                trigger_word: addForm.trigger_word,
                // Multi-stage LoRA fields (only set provided URLs)
                ...(isMultiStageModel && addForm.high_noise_url.trim() ? { high_noise_url: addForm.high_noise_url.trim() } : {}),
                ...(isMultiStageModel && addForm.low_noise_url.trim() ? { low_noise_url: addForm.low_noise_url.trim() } : {}),
            };

            if (isEditMode && editingLora) {
                await updateResource.mutateAsync({ 
                    id: editingLora.id, 
                    type: 'lora', 
                    metadata: loraMetadata as any 
                });
                onClearEdit();
            } else {
                await createResource.mutateAsync({ type: 'lora', metadata: loraMetadata as any });
            }

            // Reset form
            setAddForm({
                name: '',
                description: '',
                created_by_is_you: false,
                created_by_username: '',
                huggingface_url: '',
                base_model: 'Wan 2.2 I2V',
                is_public: defaultIsPublic,
                trigger_word: '',
                high_noise_url: '',
                low_noise_url: '',
            });
            setLoraMode('multi'); // Default to multi for Wan 2.2
            setSampleFiles([]);
            setDeletedExistingSampleUrls([]);
            setMainGenerationIndex(0);
            setFileInputKey(prev => prev + 1); // Reset file input
            
            // Switch to browse tab to show the LoRA
            onSwitchToBrowse();
        } catch (error) {
            console.error(`Error ${isEditMode ? 'updating' : 'adding'} LoRA:`, error);
            toast.error(`Failed to ${isEditMode ? 'update' : 'add'} LoRA: ` + (error instanceof Error ? error.message : String(error)));
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
                      Editing: {editingLora?.metadata.Name}
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
                        created_by_is_you: false,
                        created_by_username: '',
                        huggingface_url: '',
                        base_model: 'Wan 2.2 I2V',
                        is_public: defaultIsPublic,
                        trigger_word: '',
                        high_noise_url: '',
                        low_noise_url: '',
                      });
                      setLoraMode('multi'); // Default to multi for Wan 2.2
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
                    <CardTitle>{isEditMode ? 'Edit LoRA' : 'Add a New LoRA'}</CardTitle>
                    <CardDescription>
                        {isEditMode ? 'Update your LoRA details.' : 'Create and save a new LoRA to your collection.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="lora-name">Name: *</Label>
                            <Input 
                                id="lora-name" 
                                placeholder="My Awesome LoRA" 
                                value={addForm.name} 
                                onChange={e => handleFormChange('name', e.target.value)} 
                                maxLength={30}
                            />
                        </div>
                        
                        <div className="space-y-1">
                            <Label htmlFor="lora-trigger-word">Trigger Word:</Label>
                            <Input 
                                id="lora-trigger-word" 
                                placeholder="e.g., ohwx, sks, xyz style" 
                                value={addForm.trigger_word} 
                                onChange={e => handleFormChange('trigger_word', e.target.value)} 
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <Label htmlFor="lora-description">Description: (optional)</Label>
                        <Textarea 
                            id="lora-description" 
                            placeholder="Describe what this LoRA does..." 
                            value={addForm.description} 
                            onChange={e => handleFormChange('description', e.target.value)} 
                            rows={2}
                            clearable
                            onClear={() => handleFormChange('description', '')}
                            voiceInput
                            voiceContext="This is a description for a LoRA model. Describe what the LoRA does - what style, character, or effect it adds to AI-generated images or videos. Keep it concise and informative."
                            onVoiceResult={(result) => {
                                handleFormChange('description', result.prompt || result.transcription);
                            }}
                        />
                    </div>

                    {/* Base Model - placed before URL fields so user sees the model type first */}
                    <div className="space-y-1">
                        <Label>Base Model:</Label>
                        <div className="flex gap-2">
                            <Select
                                value={addForm.base_model}
                                onValueChange={(value) => handleFormChange('base_model', value)}
                            >
                                <SelectTrigger variant="retro" className={supportsMultiStage ? "flex-1" : "w-full"}>
                                    <SelectValue placeholder="Select Base Model" />
                                </SelectTrigger>
                                <SelectContent variant="retro">
                                    <SelectItem variant="retro" value="Wan 2.2 I2V">Wan 2.2 I2V</SelectItem>
                                    <SelectItem variant="retro" value="Wan 2.2 T2V">Wan 2.2 T2V</SelectItem>
                                    <SelectItem variant="retro" value="Wan 2.1 I2V">Wan 2.1 I2V</SelectItem>
                                    <SelectItem variant="retro" value="Wan 2.1 T2V">Wan 2.1 T2V</SelectItem>
                                    <SelectItem variant="retro" value="Qwen Image">Qwen Image</SelectItem>
                                    <SelectItem variant="retro" value="Qwen Image Edit">Qwen Image Edit</SelectItem>
                                    <SelectItem variant="retro" value="Qwen Image Edit 2509">Qwen Image Edit 2509</SelectItem>
                                    <SelectItem variant="retro" value="Z-Image">Z-Image</SelectItem>
                                </SelectContent>
                            </Select>
                            {supportsMultiStage && (
                                <Select
                                    value={loraMode}
                                    onValueChange={(value: 'single' | 'multi') => setLoraMode(value)}
                                >
                                    <SelectTrigger variant="retro" className="w-[180px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent variant="retro">
                                        <SelectItem variant="retro" value="single">Single LoRA</SelectItem>
                                        <SelectItem variant="retro" value="multi">High + Low Noise</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>

                    {/* URL field(s) - conditional based on whether model is multi-stage */}
                    {isMultiStageModel ? (
                        // Multi-stage mode: Show two URL fields for high_noise and low_noise
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <TooltipProvider>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="lora-high-noise-url">High Noise LoRA URL: *</Label>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                                                  <Info className="h-4 w-4" />
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-md">
                                                <div className="text-xs space-y-1">
                                                    <p><strong>High Noise LoRA:</strong> Applied during early generation phases (high noise levels).</p>
                                                    <p>This is typically the <code>high_noise_model.safetensors</code> file.</p>
                                                </div>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </TooltipProvider>
                                <Input
                                    id="lora-high-noise-url"
                                    placeholder="https://huggingface.co/.../high_noise_model.safetensors"
                                    value={addForm.high_noise_url}
                                    onChange={e => handleFormChange('high_noise_url', e.target.value)}
                                    className={!validateHuggingFaceUrl(addForm.high_noise_url).isValid && addForm.high_noise_url ? 'border-red-500' : ''}
                                />
                                {!validateHuggingFaceUrl(addForm.high_noise_url).isValid && addForm.high_noise_url && (
                                    <p className="text-xs text-red-600">
                                        ⚠️ {validateHuggingFaceUrl(addForm.high_noise_url).message}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <TooltipProvider>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="lora-low-noise-url">Low Noise LoRA URL: *</Label>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                                                  <Info className="h-4 w-4" />
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-md">
                                                <div className="text-xs space-y-1">
                                                    <p><strong>Low Noise LoRA:</strong> Applied during the final generation phase (low noise level).</p>
                                                    <p>This is typically the <code>low_noise_model.safetensors</code> file.</p>
                                                </div>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </TooltipProvider>
                                <Input
                                    id="lora-low-noise-url"
                                    placeholder="https://huggingface.co/.../low_noise_model.safetensors"
                                    value={addForm.low_noise_url}
                                    onChange={e => handleFormChange('low_noise_url', e.target.value)}
                                    className={!validateHuggingFaceUrl(addForm.low_noise_url).isValid && addForm.low_noise_url ? 'border-red-500' : ''}
                                />
                                {!validateHuggingFaceUrl(addForm.low_noise_url).isValid && addForm.low_noise_url && (
                                    <p className="text-xs text-red-600">
                                        ⚠️ {validateHuggingFaceUrl(addForm.low_noise_url).message}
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Single-stage mode: Show single URL field
                        <div className="space-y-1">
                            <TooltipProvider>
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="lora-url">HuggingFace Direct Download URL: *</Label>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                                              <Info className="h-4 w-4" />
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-md">
                                            <div className="text-xs space-y-1">
                                                <p><strong>How to get the correct URL:</strong></p>
                                                <ol className="list-decimal list-inside space-y-1 pl-2">
                                                    <li>Go to the HuggingFace model page</li>
                                                    <li>Click on "Files" tab</li>
                                                    <li>Find the .safetensors file you want</li>
                                                    <li>Right-click the download button (⬇️) and copy link</li>
                                                    <li>The URL should contain "/resolve/" and end with the filename</li>
                                                </ol>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </TooltipProvider>
                            <Input
                                id="lora-url"
                                placeholder="https://huggingface.co/username/model/resolve/main/filename.safetensors"
                                value={addForm.huggingface_url}
                                onChange={e => handleFormChange('huggingface_url', e.target.value)}
                                className={!validateHuggingFaceUrl(addForm.huggingface_url).isValid && addForm.huggingface_url ? 'border-red-500' : ''}
                            />
                            {!validateHuggingFaceUrl(addForm.huggingface_url).isValid && addForm.huggingface_url && (
                                <p className="text-xs text-red-600">
                                    ⚠️ {validateHuggingFaceUrl(addForm.huggingface_url).message}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-1">
                        <Label>Created By:</Label>
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

                    <div className="space-y-2">
                        {/* Display existing samples when editing */}
                        {isEditMode && editingLora?.metadata.sample_generations && editingLora.metadata.sample_generations.length > 0 && (
                            <div className="space-y-2 mb-3">
                                <Label className="text-sm font-light">Existing Samples: ({editingLora.metadata.sample_generations.filter(s => !deletedExistingSampleUrls.includes(s.url)).length})</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {editingLora.metadata.sample_generations
                                        .filter(sample => !deletedExistingSampleUrls.includes(sample.url))
                                        .map((sample, index) => {
                                            const isPrimary = sample.url === editingLora.metadata.main_generation;
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
                                                                    autoplayOnHover={false}
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
                            key={fileInputKey} // Reset component when key changes
                            onFileChange={(newFiles) => {
                                // Append new files to existing ones instead of replacing
                                setSampleFiles(prevFiles => [...prevFiles, ...newFiles]);
                                // Reset the file input after files are added
                                setFileInputKey(prev => prev + 1);
                            }}
                            acceptTypes={['image', 'video']}
                            multiple={true}
                            label={isEditMode ? "Add more sample images/videos (optional)" : "Upload sample images/videos (optional)"}
                        />
                        
                        {/* Display uploaded files */}
                        {sampleFiles.length > 0 && (
                            <div className="space-y-2 mt-3">
                                <Label className="text-sm font-light">Uploaded Files: ({sampleFiles.length})</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {sampleFiles.map((file, index) => (
                                        <div key={index} className="relative group">
                                            <div 
                                                className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                                                    mainGenerationIndex === index 
                                                        ? 'border-blue-500 bg-blue-50' 
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
                                                ) : (
                                                    <video
                                                        src={previewUrls[index] || ''}
                                                        className="w-full h-24 object-cover"
                                                        muted
                                                    />
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
                                                        e.stopPropagation(); // Prevent setting as primary when deleting
                                                        const newFiles = sampleFiles.filter((_, i) => i !== index);
                                                        setSampleFiles(newFiles);
                                                        // Adjust main generation index if needed
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
                                            <p className="text-xs text-gray-600 mt-1 truncate" title={file.name}>
                                                {file.name}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                {sampleFiles.length > 1 && (
                                    <p className="text-xs text-gray-500">
                                        Click on any image to set it as the primary generation. Primary generation will be featured prominently.
                                    </p>
                                )}
                            </div>
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
                        onClick={handleAddLoraFromForm}
                        disabled={
                            isSubmitting ||
                            !addForm.name.trim() ||
                            (isMultiStageModel
                                ? // For multi-stage: at least one valid URL required
                                  !(
                                    (addForm.high_noise_url.trim() && validateHuggingFaceUrl(addForm.high_noise_url).isValid) ||
                                    (addForm.low_noise_url.trim() && validateHuggingFaceUrl(addForm.low_noise_url).isValid)
                                  )
                                : !validateHuggingFaceUrl(addForm.huggingface_url).isValid)
                        }
                    >
                        {isSubmitting 
                            ? (isEditMode ? 'Saving Changes...' : 'Adding LoRA...') 
                            : (isEditMode ? 'Save Changes' : 'Add LoRA')
                        }
                    </Button>
                </ItemCardFooter>
            </Card>
        </div>
    );
};


export const LoraSelectorModal: React.FC<LoraSelectorModalProps> = ({
  isOpen,
  onClose,
  loras,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
  selectedLoras,
  lora_type,
}) => {
  const isMobile = useIsMobile();
  const myLorasResource = useListResources('lora');
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();
  
  // Privacy defaults for new LoRAs
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });
  
  // Tab state management
  const [activeTab, setActiveTab] = useState<string>('browse');
  
  // Edit state management
  const [editingLora, setEditingLora] = useState<(Resource & { metadata: LoraModel }) | null>(null);
  
  // Filter state for footer controls
  const [showMyLorasOnly, setShowMyLorasOnly] = useState(false);
  const [showAddedLorasOnly, setShowAddedLorasOnly] = useState(false);
  const [processedLorasLength, setProcessedLorasLength] = useState(0);

  // Model filter state - initialized from prop mapped to broad category
  const [selectedModelFilter, setSelectedModelFilter] = useState<ModelFilterCategory>(() => getFilterCategory(lora_type));
  // Sub-filter for specific model type within category (default 'all')
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>('all');

  // Reset model filter when prop changes (e.g., when opening from different context)
  React.useEffect(() => {
    setSelectedModelFilter(getFilterCategory(lora_type));
    setSelectedSubFilter('all');
  }, [lora_type]);

  // Reset sub-filter when category changes
  React.useEffect(() => {
    setSelectedSubFilter('all');
  }, [selectedModelFilter]);
  
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
  const handleEdit = (lora: Resource & { metadata: LoraModel }) => {
    setEditingLora(lora);
    setActiveTab('add-new');
  };
  
  // Handle clear edit
  const handleClearEdit = () => {
    setEditingLora(null);
  };
  
  // Modal styling and scroll fade
  const modal = useExtraLargeModal('loraSelector');
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
            <DialogTitle>LoRA Library</DialogTitle>
          </DialogHeader>
        </div>
        <div 
          ref={scrollRef}
          className={modal.scrollClass}
        >
          <div className={`${modal.isMobile ? 'px-2' : 'px-6'} py-2 flex-shrink-0`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsList className="grid w-full grid-cols-2 mb-2">
                  <TabsTrigger value="browse" className="w-full">Browse LoRAs</TabsTrigger>
                  <TabsTrigger value="add-new" className="w-full">Add LoRA</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* Tab Content */}
          <div className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsContent value="browse" className="flex-1 flex flex-col min-h-0">
                <CommunityLorasTab
                    loras={loras}
                    onAddLora={onAddLora}
                    onRemoveLora={onRemoveLora}
                    onUpdateLoraStrength={onUpdateLoraStrength}
                    selectedLoras={selectedLoras}
                    lora_type={selectedModelFilter}
                    myLorasResource={myLorasResource as any}
                    createResource={createResource as any}
                    updateResource={updateResource as any}
                    deleteResource={deleteResource as any}
                    onClose={onClose}
                    onEdit={handleEdit}
                    showMyLorasOnly={showMyLorasOnly}
                    setShowMyLorasOnly={setShowMyLorasOnly}
                    showAddedLorasOnly={showAddedLorasOnly}
                    setShowAddedLorasOnly={setShowAddedLorasOnly}
                    onProcessedLorasLengthChange={setProcessedLorasLength}
                    onPageChange={handlePageChange}
                    selectedModelFilter={selectedModelFilter}
                    setSelectedModelFilter={setSelectedModelFilter}
                    selectedSubFilter={selectedSubFilter}
                    setSelectedSubFilter={setSelectedSubFilter}
                />
              </TabsContent>
              <TabsContent value="add-new" className="flex-1 min-h-0 overflow-auto">
                  <MyLorasTab 
                      myLorasResource={myLorasResource as any}
                      onAddLora={onAddLora}
                      onRemoveLora={onRemoveLora}
                      selectedLoraIds={selectedLoras.map(l => l['Model ID'])}
                      deleteResource={deleteResource as any}
                      createResource={createResource as any}
                      updateResource={updateResource as any}
                      lora_type={lora_type}
                      onSwitchToBrowse={() => {
                        setActiveTab('browse');
                        handleClearEdit();
                      }}
                      editingLora={editingLora}
                      onClearEdit={handleClearEdit}
                      defaultIsPublic={privacyDefaults.resourcesPublic}
                  />
                </TabsContent>
            </Tabs>
          </div>
        </div>
        
        {/* Control Panel Footer - Always sticks to bottom like PromptEditorModal */}
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
                  {/* Added LoRAs Filter */}
                  <Button
                    variant={showAddedLorasOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowAddedLorasOnly(!showAddedLorasOnly)}
                    className="flex items-center gap-2"
                  >
                    <span className={`h-4 w-4 rounded-sm border flex items-center justify-center ${showAddedLorasOnly ? 'bg-primary border-primary' : 'border-input'}`}>
                      {showAddedLorasOnly && <span className="text-xs text-primary-foreground">✓</span>}
                    </span>
                    <span className="hidden sm:inline">Show selected LoRAs</span>
                    <span className="sm:hidden">Selected</span>
                  </Button>

                  {/* My LoRAs Filter */}
                  <Button
                    variant={showMyLorasOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowMyLorasOnly(!showMyLorasOnly)}
                    className="flex items-center gap-2"
                  >
                    <span className={`h-4 w-4 rounded-sm border flex items-center justify-center ${showMyLorasOnly ? 'bg-primary border-primary' : 'border-input'}`}>
                      {showMyLorasOnly && <span className="text-xs text-primary-foreground">✓</span>}
                    </span>
                    <span className="hidden sm:inline">Show my LoRAs</span>
                    <span className="sm:hidden">My LoRAs</span>
                  </Button>

                  {/* Status Text */}
                  <span className="text-sm text-muted-foreground text-center flex-1 sm:flex-none">
                    {showMyLorasOnly && showAddedLorasOnly ? (
                      <>{processedLorasLength} added</>
                    ) : showMyLorasOnly ? (
                      <>{processedLorasLength} yours</>
                    ) : showAddedLorasOnly ? (
                      <>{processedLorasLength} added</>
                    ) : (
                      <>{processedLorasLength} total</>
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
                    variant="retro"
                    size="retro-sm"
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