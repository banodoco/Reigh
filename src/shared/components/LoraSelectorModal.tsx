import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter as ItemCardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useListResources, useCreateResource, useDeleteResource, Resource } from '@/shared/hooks/useResources';
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
import { Info, X } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { Slider } from "@/shared/components/ui/slider";
import { supabase } from '@/integrations/supabase/client';

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
  deleteResource: UseMutationResult<void, Error, { id: string; type: "lora"; }, unknown>;
}

const CommunityLorasTab: React.FC<CommunityLorasTabProps & { onClose: () => void }> = ({ 
  loras, 
  onAddLora, 
  onRemoveLora, 
  onUpdateLoraStrength,
  selectedLoras,
  lora_type, 
  myLorasResource, 
  createResource, 
  deleteResource,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('downloads');
  const [showMyLorasOnly, setShowMyLorasOnly] = useState(false);
  const [showAddedLorasOnly, setShowAddedLorasOnly] = useState(false);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  // Description modal state
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState<{ title: string; description: string }>({ title: '', description: '' });

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
    const communityLoras = loras.filter(l => l.lora_type === lora_type);
    const savedLoras = myLorasResource.data?.map(r => ({
      ...r.metadata,
      _resourceId: r.id, // Add resource ID for deletion
      created_by: r.metadata.created_by || { is_you: true },
    })) || [];
    const localLoras = localWanLoras.filter(l => l.lora_type === lora_type);
    
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
  }, [loras, myLorasResource.data, localWanLoras, lora_type]);

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

  // Reset page when filter/sort changes
  React.useEffect(() => { setPage(0); }, [searchTerm, sortOption, showMyLorasOnly, showAddedLorasOnly]);

  const totalPages = Math.ceil(processedLoras.length / ITEMS_PER_PAGE);
  const paginatedLoras = useMemo(() => processedLoras.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE), [processedLoras, page]);

  const myLorasCount = allLoras.filter(lora => 
    lora.created_by?.is_you || 
    lora.Author === 'You' || 
    lora.Author === 'You (Local)' ||
    myLoraModelIds.includes(lora["Model ID"])
  ).length;

  return (
    <div className="relative flex flex-col h-full min-h-0">

      <div className="flex gap-2 mb-4">
        <Input
          type="text"
          placeholder="Search all LoRA fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-grow"
        />
        <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default Order</SelectItem>
            <SelectItem value="downloads">Downloads</SelectItem>
            <SelectItem value="likes">Likes</SelectItem>
            <SelectItem value="lastModified">Last Modified</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Scrollable content area with floating controls */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-4 relative">
        <div className="space-y-3 p-1 pb-6">
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
                  className={`w-full transition-all duration-200 ${
                    isSelectedOnGenerator 
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/20 shadow-sm' 
                      : 'hover:border-gray-400 hover:shadow-sm'
                  }`}
                >
                  <div className="flex flex-col">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-2">
                            <div className="flex-grow">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CardTitle className="text-xl" title={lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}>
                                      {lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}
                                  </CardTitle>
                                  {isSelectedOnGenerator && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-light bg-green-600 text-white">
                                      Added
                                    </span>
                                  )}
                                  {isMyLora && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-light bg-blue-100 text-blue-800">
                                      {isLocalLora ? 'Local' : 'Mine'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground" title={lora.Author}>By: {lora.Author}</p>
                            </div>
                            <div className="flex flex-col lg:items-end gap-2 flex-shrink-0">
                              <div className="flex gap-2">
                                {isSelectedOnGenerator ? (
                                  <Button
                                    variant="destructive"
                                    size="sm"
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
                                    onClick={() => {
                                      if (lora["Model Files"] && lora["Model Files"].length > 0) {
                                        onAddLora(lora);
                                      }
                                    }}
                                    disabled={!lora["Model Files"] || lora["Model Files"].length === 0}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    Add
                                  </Button>
                                )}
                                {!isMyLora && (
                                  <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => createResource.mutate({ type: 'lora', metadata: lora })}
                                      disabled={isInSavedLoras || createResource.isPending}
                                  >
                                      {isInSavedLoras ? 'Saved' : 'Save'}
                                  </Button>
                                )}
                              </div>
                            </div>
                        </div>
                        {isSelectedOnGenerator && (
                          <div className="w-full lg:w-48 lg:ml-auto space-y-1 mt-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center">
                              <Label htmlFor={`lora-strength-${lora['Model ID']}`} className="text-xs">Strength</Label>
                              <span className="text-xs font-light">{strength?.toFixed(2)}</span>
                            </div>
                            <Slider
                              id={`lora-strength-${lora['Model ID']}`}
                              value={[strength ?? 1]}
                              onValueChange={(value) => onUpdateLoraStrength(lora['Model ID'], value[0])}
                              min={0} max={2} step={0.05}
                              className="w-full"
                            />
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground pt-1">
                          {lora.Downloads && <span>Downloads: {lora.Downloads.toLocaleString()} | </span>}
                          {lora.Likes && <span>Likes: {lora.Likes.toLocaleString()} | </span>}
                          {lora["Last Modified"] && <span>Updated: {new Date(lora["Last Modified"]).toLocaleDateString()}</span>}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {lora.Description && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground max-h-10 overflow-hidden" title={lora.Description}>
                            {lora.Description}
                          </p>
                          {lora.Description.length > 100 && (
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto text-xs"
                              onClick={() => handleShowFullDescription(lora.Name, lora.Description)}
                            >
                              Read all
                            </Button>
                          )}
                        </div>
                      )}
                      {lora.Images && lora.Images.length > 0 ? (
                        <div className="flex space-x-2 overflow-x-auto pb-2 pt-1">
                          {lora.Images.slice(0, 5).map((image, index) => {
                            const isVideo = image.type?.startsWith('video');
                            return isVideo ? (
                              <HoverScrubVideo
                                key={index}
                                src={image.url}
                                className="h-28 w-auto rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                                videoClassName="object-contain"
                                autoplayOnHover
                                preload="metadata"
                                loop
                                muted
                              />
                            ) : (
                              <img
                                key={index}
                                src={image.url}
                                alt={image.alt_text || `${lora.Name} sample ${index + 1}`}
                                className="h-28 w-auto object-contain rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                                title={image.alt_text || image.url}
                                loading="lazy"
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No sample images available.</p>
                      )}
                    </CardContent>
                  </div>
                </Card>
              );
            })
          ) : (
            <p className="text-center text-muted-foreground py-8">No LoRA models match your search criteria.</p>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
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
          )}
        </div>

        {/* Sticky Floating Control Panel - Follows scroll with vintage aesthetic */}
        <div className="sticky bottom-4 left-0 right-0 pointer-events-none z-20 mt-6">
          {/* Vintage fade overlay with film grain effect - covers full panel height */}
          <div className="absolute inset-x-0 -top-12 bottom-0 bg-gradient-to-t from-background/95 via-background/70 to-transparent pointer-events-none" />
          
          {/* Main floating control panel with vintage styling */}
          <div className="wes-vintage-card mx-4 relative overflow-hidden border-2 border-wes-vintage-gold/50 shadow-wes-deep backdrop-blur-xl pointer-events-auto">
            {/* Vintage film overlay pattern */}
            <div className="absolute inset-0 wes-texture opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-r from-wes-cream/90 via-wes-pink/20 to-wes-lavender/30 animate-gradient-shift" />
            
            <div className="relative z-10 p-4">
              <div className="flex flex-col gap-3">
                {/* Top row - Filter controls and status badges */}
                <div className="flex items-center justify-between gap-4">
                  {/* Filter Controls */}
                  <div className="flex items-center gap-3 lg:gap-4">
                    {/* Added LoRAs Filter */}
                    <div 
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 cursor-pointer ${
                        showAddedLorasOnly 
                          ? 'bg-gradient-to-r from-wes-mint to-wes-mint-dark border-2 border-wes-mint-dark text-wes-forest shadow-wes hover:from-wes-mint-dark hover:to-wes-mint' 
                          : 'bg-gradient-to-r from-wes-cream/90 to-wes-pink/30 border-2 border-wes-vintage-gold/30 text-primary hover:from-wes-pink/40 hover:to-wes-lavender/40 hover:border-wes-vintage-gold/60 shadow-sm'
                      }`}
                      onClick={() => setShowAddedLorasOnly(!showAddedLorasOnly)}
                    >
                      <Checkbox 
                        id="show-added-loras-only-sticky" 
                        checked={showAddedLorasOnly}
                        onCheckedChange={(checked) => setShowAddedLorasOnly(!!checked)}
                        className="data-[state=checked]:bg-wes-mint data-[state=checked]:border-wes-mint-dark border-primary/40 pointer-events-none"
                      />
                      <Label htmlFor="show-added-loras-only-sticky" className="text-sm font-medium cursor-pointer select-none tracking-normal pointer-events-none">
                        <span className="hidden sm:inline">Show added LoRAs</span>
                        <span className="sm:hidden">Added</span>
                      </Label>
                    </div>

                    {/* My LoRAs Filter */}
                    <div 
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 cursor-pointer ${
                        showMyLorasOnly 
                          ? 'bg-gradient-to-r from-wes-dusty-blue to-wes-lavender border-2 border-wes-dusty-blue text-primary shadow-wes hover:from-wes-lavender hover:to-wes-dusty-blue' 
                          : 'bg-gradient-to-r from-wes-cream/90 to-wes-pink/30 border-2 border-wes-vintage-gold/30 text-primary hover:from-wes-pink/40 hover:to-wes-lavender/40 hover:border-wes-vintage-gold/60 shadow-sm'
                      }`}
                      onClick={() => setShowMyLorasOnly(!showMyLorasOnly)}
                    >
                      <Checkbox 
                        id="show-my-loras-only-sticky" 
                        checked={showMyLorasOnly}
                        onCheckedChange={(checked) => setShowMyLorasOnly(!!checked)}
                        className="data-[state=checked]:bg-wes-dusty-blue data-[state=checked]:border-primary border-primary/40 pointer-events-none"
                      />
                      <Label htmlFor="show-my-loras-only-sticky" className="text-sm font-medium cursor-pointer select-none tracking-normal pointer-events-none">
                        <span className="hidden sm:inline">Show my LoRAs</span>
                        <span className="sm:hidden">My LoRAs</span>
                      </Label>
                    </div>
                  </div>

                  {/* Status Badges and Close */}
                  <div className="flex items-center gap-2">
                    {/* Status Badges */}
                    {myLorasCount > 0 && (
                      <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-wes-dusty-blue/20 to-wes-lavender/20 border border-wes-dusty-blue/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-wes-dusty-blue animate-pulse" />
                        <span className="text-sm font-medium text-primary">
                          {myLorasCount} saved
                        </span>
                      </div>
                    )}
                    {selectedLoraIds.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-wes-mint/20 to-wes-sage/20 border border-wes-mint/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-wes-mint animate-pulse" />
                        <span className="text-sm font-medium text-wes-forest">
                          {selectedLoraIds.length} active
                        </span>
                      </div>
                    )}
                    
                    {/* Close Button */}
                    <Button 
                      variant="wes-outline" 
                      size="sm"
                      onClick={onClose}
                      className="flex items-center gap-1.5 text-sm font-normal"
                    >
                      <X className="h-4 w-4" />
                      <span className="hidden sm:inline">Close</span>
                    </Button>
                  </div>
                </div>

                {/* Bottom row - Status text with vintage styling */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-wes-cream/80 to-wes-pink/20 border border-wes-vintage-gold/30 shadow-inner-vintage">
                    <div className="w-1.5 h-1.5 rounded-full bg-wes-vintage-gold animate-pulse" />
                    <span className="text-sm font-medium text-primary">
                      {showMyLorasOnly && showAddedLorasOnly ? (
                        <span className="text-wes-burgundy">Showing {processedLoras.length} of your added LoRAs</span>
                      ) : showMyLorasOnly ? (
                        <span className="text-wes-burgundy">Showing {processedLoras.length} of your LoRAs</span>
                      ) : showAddedLorasOnly ? (
                        <span className="text-wes-forest">Showing {processedLoras.length} added LoRAs</span>
                      ) : (
                        <span className="text-muted-foreground">Showing all {processedLoras.length} LoRAs</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Description Modal */}
      <DescriptionModal 
        isOpen={descriptionModalOpen}
        onClose={() => setDescriptionModalOpen(false)}
        title={selectedDescription.title}
        description={selectedDescription.description}
      />
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
  /** The LoRA type currently being viewed/edited */
  lora_type: string;
  /** Callback to switch to the browse tab */
  onSwitchToBrowse: () => void;
}

const MyLorasTab: React.FC<MyLorasTabProps> = ({ myLorasResource, onAddLora, onRemoveLora, selectedLoraIds, deleteResource, createResource, lora_type, onSwitchToBrowse }) => {
    const [addForm, setAddForm] = useState({
        name: '',
        description: '',
        created_by_is_you: false,
        created_by_username: '',
        huggingface_url: '',
        base_model: 'Wan 2.1 T2V',
        is_public: true,
        trigger_word: '', // Add trigger word to form state
    });
    
    const [sampleFiles, setSampleFiles] = useState<File[]>([]);
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
        const savedFilenames = myLorasResource.data?.map(r => r.metadata.filename || r.metadata["Model ID"]) || [];
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
        
        const urlValidation = validateHuggingFaceUrl(addForm.huggingface_url);
        if (!urlValidation.isValid) {
            toast.error(`Invalid HuggingFace URL: ${urlValidation.message}`);
            return;
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

            // Determine main generation
            const mainGeneration = uploadedSamples.length > 0 && uploadedSamples[mainGenerationIndex] 
                ? uploadedSamples[mainGenerationIndex].url 
                : undefined;

            // Generate unique filename
            const existingFilenames = getExistingFilenames();
            const uniqueFilename = generateUniqueFilename(addForm.name, addForm.base_model, addForm.huggingface_url, existingFilenames);

            // Create the LoRA model
            const newLora: LoraModel = {
                "Model ID": uniqueFilename,
                Name: addForm.name,
                Author: addForm.created_by_is_you ? (userName || 'You') : (addForm.created_by_username || 'Unknown'),
                Description: addForm.description || undefined,
                Images: uploadedSamples.map(sample => ({
                    url: sample.url,
                    alt_text: sample.alt_text || '',
                    type: sample.type,
                })),
                "Model Files": [{
                    path: uniqueFilename,
                    url: addForm.huggingface_url,
                }],
                lora_type: 'Wan 2.1 14b', // Fixed value since we removed the field
                created_by: {
                    is_you: addForm.created_by_is_you,
                    username: addForm.created_by_is_you ? undefined : addForm.created_by_username,
                },
                huggingface_url: addForm.huggingface_url,
                filename: uniqueFilename,
                base_model: addForm.base_model,
                sample_generations: uploadedSamples,
                main_generation: mainGeneration,
                is_public: addForm.is_public,
                "Last Modified": new Date().toISOString(),
                trigger_word: addForm.trigger_word,
            };

            await createResource.mutateAsync({ type: 'lora', metadata: newLora as any });

            // Reset form
            setAddForm({
                name: '',
                description: '',
                created_by_is_you: false,
                created_by_username: '',
                huggingface_url: '',
                base_model: 'Wan 2.1 T2V',
                is_public: true,
                trigger_word: '',
            });
            setSampleFiles([]);
            setMainGenerationIndex(0);
            setFileInputKey(prev => prev + 1); // Reset file input

      
            
            // Switch to browse tab to show the newly added LoRA
            onSwitchToBrowse();
        } catch (error) {
            console.error("Error adding LoRA:", error);
            toast.error("Failed to add LoRA: " + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="space-y-4">

            
            <Card>
                <CardHeader>
                    <CardTitle>Add a New LoRA</CardTitle>
                    <CardDescription>Create and save a new LoRA to your collection.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="lora-name">Name *</Label>
                            <Input 
                                id="lora-name" 
                                placeholder="My Awesome LoRA" 
                                value={addForm.name} 
                                onChange={e => handleFormChange('name', e.target.value)} 
                                maxLength={30}
                            />
                        </div>
                        
                        <div className="space-y-1">
                            <Label htmlFor="lora-trigger-word">Trigger Word</Label>
                            <Input 
                                id="lora-trigger-word" 
                                placeholder="e.g., ohwx, sks, xyz style" 
                                value={addForm.trigger_word} 
                                onChange={e => handleFormChange('trigger_word', e.target.value)} 
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <Label htmlFor="lora-description">Description</Label>
                        <Textarea 
                            id="lora-description" 
                            placeholder="Describe what this LoRA does..." 
                            value={addForm.description} 
                            onChange={e => handleFormChange('description', e.target.value)} 
                            rows={2}
                        />
                    </div>

                    <div className="space-y-1">
                        <TooltipProvider>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="lora-url">HuggingFace Direct Download URL *</Label>
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

                    <div className="space-y-1">
                        <Label>Base Model</Label>
                        <Select 
                            value={addForm.base_model} 
                            onValueChange={(value) => handleFormChange('base_model', value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select Base Model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Wan 2.1 T2V">Wan 2.1 T2V</SelectItem>
                                <SelectItem value="Flux.dev">Flux.dev</SelectItem>
                                <SelectItem value="SD 1.5">SD 1.5</SelectItem>
                                <SelectItem value="SDXL">SDXL</SelectItem>
                            </SelectContent>
                        </Select>
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

                    <div className="space-y-2">                        
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
                            label="Upload sample images/videos"
                        />
                        
                        {/* Display uploaded files */}
                        {sampleFiles.length > 0 && (
                            <div className="space-y-2 mt-3">
                                <Label className="text-sm font-light">Uploaded Files ({sampleFiles.length})</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {sampleFiles.map((file, index) => (
                                        <div key={index} className="relative group">
                                            <div 
                                                className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                                                    mainGenerationIndex === index 
                                                        ? 'border-blue-500 bg-blue-50 shadow-md' 
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
                        disabled={isSubmitting || !addForm.name.trim() || !validateHuggingFaceUrl(addForm.huggingface_url).isValid}
                    >
                        {isSubmitting ? 'Adding LoRA...' : 'Add LoRA'}
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
  const deleteResource = useDeleteResource();
  
  // Tab state management
  const [activeTab, setActiveTab] = useState<string>('browse');

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`max-w-4xl flex flex-col max-h-[90vh] overflow-hidden bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 ${
          isMobile ? 'mx-2 my-5 max-h-[calc(100vh-2.5rem)]' : ''
        }`}
      >
        <DialogHeader>
          <DialogTitle>LoRA Library</DialogTitle>
          <DialogDescription>
            Browse all LoRAs, filter by your collection, or add new ones.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
                <TabsTrigger value="browse">Browse All LoRAs</TabsTrigger>
                <TabsTrigger value="add-new">Add New LoRA</TabsTrigger>
            </TabsList>
            <TabsContent value="browse" className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <CommunityLorasTab 
                    loras={loras} 
                    onAddLora={onAddLora} 
                    onRemoveLora={onRemoveLora}
                    onUpdateLoraStrength={onUpdateLoraStrength}
                    selectedLoras={selectedLoras} 
                    lora_type={lora_type}
                    myLorasResource={myLorasResource}
                    createResource={createResource}
                    deleteResource={deleteResource}
                    onClose={onClose}
                />
            </TabsContent>
            <TabsContent value="add-new" className="flex-1 min-h-0 overflow-auto">
                <MyLorasTab 
                    myLorasResource={myLorasResource}
                    onAddLora={onAddLora}
                    onRemoveLora={onRemoveLora}
                    selectedLoraIds={selectedLoras.map(l => l['Model ID'])}
                    deleteResource={deleteResource}
                    createResource={createResource}
                    lora_type={lora_type}
                    onSwitchToBrowse={() => setActiveTab('browse')}
                />
            </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}; 