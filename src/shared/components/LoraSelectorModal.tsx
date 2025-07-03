import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter as ItemCardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { usePaneAwareModalStyle } from '@/shared/hooks/usePaneAwareModalStyle';
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
  selectedLoraIds: string[];
  lora_type: string;
}

interface CommunityLorasTabProps {
  loras: LoraModel[];
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  selectedLoraIds: string[];
  lora_type: string;
  myLorasResource: UseQueryResult<Resource[], Error>;
  createResource: UseMutationResult<Resource, Error, { type: 'lora'; metadata: LoraModel; }, unknown>;
  deleteResource: UseMutationResult<void, Error, { id: string; type: "lora"; }, unknown>;
}

const CommunityLorasTab: React.FC<CommunityLorasTabProps> = ({ loras, onAddLora, onRemoveLora, selectedLoraIds, lora_type, myLorasResource, createResource, deleteResource }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('downloads');
  const [showMyLorasOnly, setShowMyLorasOnly] = useState(false);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  // Confirmation dialog state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [loraToDelete, setLoraToDelete] = useState<{ resourceId: string; name: string } | null>(null);

  const myLoraModelIds = useMemo(() => myLorasResource.data?.map(r => r.metadata["Model ID"]) || [], [myLorasResource.data]);

  // Handle confirmation dialog
  const handleDeleteClick = (resourceId: string, loraName: string) => {
    setLoraToDelete({ resourceId, name: loraName });
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    if (loraToDelete) {
      deleteResource.mutate({ id: loraToDelete.resourceId, type: 'lora' });
    }
    setConfirmDeleteOpen(false);
    setLoraToDelete(null);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteOpen(false);
    setLoraToDelete(null);
  };
  
  // Local Wan LoRAs (files dropped into Headless-Wan2GP/loras)
  const [localWanLoras, setLocalWanLoras] = useState<LoraModel[]>([]);

  useEffect(() => {
    // Fetch local LoRAs
    fetch('/api/local-loras')
      .then(res => res.json())
      .then((data) => {
        if (Array.isArray(data.files)) {
          const parsed: LoraModel[] = data.files.map((filePath: string) => ({
            "Model ID": filePath,
            Name: filePath.split('/').pop() || filePath,
            Author: 'You (Local)',
            Images: [],
            "Model Files": [{ path: filePath, url: filePath }],
            lora_type: 'Wan 2.1 14b',
            created_by: { is_you: true },
            is_public: false,
          }));
          setLocalWanLoras(parsed);
        }
      })
      .catch(err => console.error('Error fetching local LoRAs:', err));
  }, []);

  // Combine all LoRAs (community + saved + local)
  const allLoras = useMemo(() => {
    const communityLoras = loras.filter(l => l.lora_type === lora_type);
    const savedLoras = myLorasResource.data?.map(r => ({
      ...r.metadata,
      _resourceId: r.id, // Add resource ID for deletion
      created_by: r.metadata.created_by || { is_you: true },
    })) || [];
    const localLoras = localWanLoras.filter(l => l.lora_type === lora_type);
    
    return [...communityLoras, ...savedLoras, ...localLoras];
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
  }, [allLoras, searchTerm, sortOption, showMyLorasOnly, myLoraModelIds]);

  // Reset page when filter/sort changes
  React.useEffect(() => { setPage(0); }, [searchTerm, sortOption, showMyLorasOnly]);

  const totalPages = Math.ceil(processedLoras.length / ITEMS_PER_PAGE);
  const paginatedLoras = useMemo(() => processedLoras.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE), [processedLoras, page]);

  const myLorasCount = allLoras.filter(lora => 
    lora.created_by?.is_you || 
    lora.Author === 'You' || 
    lora.Author === 'You (Local)' ||
    myLoraModelIds.includes(lora["Model ID"])
  ).length;

  return (
    <div>
      {/* My LoRAs Filter */}
      <div className="mb-6 p-4 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="show-my-loras-only" 
                checked={showMyLorasOnly}
                onCheckedChange={(checked) => setShowMyLorasOnly(!!checked)}
                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
              />
              <Label htmlFor="show-my-loras-only" className="text-base font-medium text-slate-900 cursor-pointer">
                Show only my LoRAs
              </Label>
            </div>
            {myLorasCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                {myLorasCount} saved
              </span>
            )}
          </div>
          <div className="text-sm text-slate-600 font-medium">
            {showMyLorasOnly ? (
              <span className="text-blue-700">Showing {processedLoras.length} of your LoRAs</span>
            ) : (
              <span>Showing all {processedLoras.length} LoRAs</span>
            )}
          </div>
        </div>
      </div>

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
      <ScrollArea className="flex-grow pr-4 h-[500px]">
        <div className="space-y-3 p-1">
          {paginatedLoras.length > 0 ? (
            paginatedLoras.map((lora) => {
              const isSelectedOnGenerator = selectedLoraIds.includes(lora["Model ID"]);
              const isMyLora = lora.created_by?.is_you || 
                              lora.Author === 'You' || 
                              lora.Author === 'You (Local)' ||
                              myLoraModelIds.includes(lora["Model ID"]);
              const isInSavedLoras = myLoraModelIds.includes(lora["Model ID"]);
              const isLocalLora = lora.Author === 'You (Local)';
              const resourceId = (lora as any)._resourceId;

              return (
                <Card key={lora["Model ID"]} className="w-full">
                  <div className="flex flex-col">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start gap-2">
                            <div className="flex-grow">
                                <div className="flex items-center gap-2">
                                  <CardTitle className="text-lg" title={lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}>
                                      {lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}
                                  </CardTitle>
                                  {isMyLora && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      {isLocalLora ? 'Local' : 'Mine'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground" title={lora.Author}>By: {lora.Author}</p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
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
                              {isMyLora && resourceId && !isLocalLora && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeleteClick(resourceId, lora.Name)}
                                    disabled={deleteResource.isPending}
                                >
                                    Remove
                                </Button>
                              )}
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground pt-1">
                          {lora.Downloads && <span>Downloads: {lora.Downloads.toLocaleString()} | </span>}
                          {lora.Likes && <span>Likes: {lora.Likes.toLocaleString()} | </span>}
                          {lora["Last Modified"] && <span>Updated: {new Date(lora["Last Modified"]).toLocaleDateString()}</span>}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {lora.Description && (
                        <p className="text-xs text-muted-foreground max-h-10 overflow-y-auto" title={lora.Description}>
                          {lora.Description}
                        </p>
                      )}
                      {lora.Images && lora.Images.length > 0 ? (
                        <div className="flex space-x-2 overflow-x-auto pb-2 pt-1">
                          {lora.Images.slice(0, 5).map((image, index) => (
                            <img
                              key={index}
                              src={image.url}
                              alt={image.alt_text || `${lora.Name} sample ${index + 1}`}
                              className="h-28 w-auto object-contain rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                              title={image.alt_text || image.url}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No sample images available.</p>
                      )}
                    </CardContent>
                    <ItemCardFooter className="mt-auto pt-2">
                      <Button
                        variant={isSelectedOnGenerator ? "destructive" : "outline"}
                        size="sm"
                        className=""
                        onClick={() => {
                          if (isSelectedOnGenerator) {
                            onRemoveLora(lora["Model ID"]);
                          } else if (lora["Model Files"] && lora["Model Files"].length > 0) {
                            onAddLora(lora);
                          }
                        }}
                        disabled={!lora["Model Files"] || lora["Model Files"].length === 0}
                      >
                        {isSelectedOnGenerator ? "Remove from Generator" : "Add to Generator"}
                      </Button>
                    </ItemCardFooter>
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
      </ScrollArea>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove LoRA</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{loraToDelete?.name}"? 
              <br /><br />
              <strong>This will remove it for you and everyone else.</strong> This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove for Everyone
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
  lora_type: string;
}

const MyLorasTab: React.FC<MyLorasTabProps> = ({ myLorasResource, onAddLora, onRemoveLora, selectedLoraIds, deleteResource, createResource, lora_type }) => {
    const [addForm, setAddForm] = useState({
        name: '',
        description: '',
        created_by_is_you: true,
        created_by_username: '',
        huggingface_url: '',
        filename: '',
        base_model: 'Wan 2.1 T2V',
        is_public: true,
        lora_type: 'Wan 2.1 14b',
    });
    
    const [sampleFiles, setSampleFiles] = useState<File[]>([]);
    const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);

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
    }, [sampleFiles]);

    useEffect(() => {
        console.log('[LoraSelectorModal] useEffect triggered, lora_type:', lora_type);
        // Always fetch local LoRAs regardless of type
        console.log('[LoraSelectorModal] Fetching local LoRAs...');
        fetch('/api/local-loras')
          .then(res => {
              console.log('[LoraSelectorModal] Fetch response status:', res.status);
              return res.json();
          })
          .then((data) => {
              console.log('[LoraSelectorModal] Fetch response data:', data);
              if (Array.isArray(data.files)) {
                  const parsed: LoraModel[] = data.files.map((filePath: string) => ({
                      "Model ID": filePath,
                      Name: filePath.split('/').pop() || filePath,
                      Author: 'Local',
                      Images: [],
                      "Model Files": [{ path: filePath, url: filePath }],
                      lora_type: 'Wan 2.1 14b',
                  }));
                  console.log('[LoraSelectorModal] Parsed local LoRAs:', parsed);
                  setLocalWanLoras(parsed);
              } else {
                  console.log('[LoraSelectorModal] data.files is not an array:', data.files);
              }
          })
          .catch(err => console.error('[LoraSelectorModal] Error fetching local LoRAs:', err));
    }, []);

    const generateFilename = (name: string, baseModel: string) => {
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const cleanBaseModel = baseModel.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = Date.now();
        return `${cleanName}_${cleanBaseModel}_${timestamp}.safetensors`;
    };

    const handleFormChange = (field: string, value: any) => {
        setAddForm(prev => {
            const updated = { ...prev, [field]: value };
            
            // Auto-generate filename if name or base_model changes
            if ((field === 'name' || field === 'base_model') && updated.name && updated.base_model) {
                updated.filename = generateFilename(updated.name, updated.base_model);
            }
            
            return updated;
        });
    };

    const handleAddLoraFromForm = async () => {
        if (!addForm.name.trim()) {
            toast.error("Name is required");
            return;
        }
        
        if (!addForm.huggingface_url.trim()) {
            toast.error("HuggingFace URL is required");
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

            // Create the LoRA model
            const newLora: LoraModel = {
                "Model ID": addForm.filename || generateFilename(addForm.name, addForm.base_model),
                Name: addForm.name,
                Author: addForm.created_by_is_you ? 'You' : (addForm.created_by_username || 'Unknown'),
                Description: addForm.description || undefined,
                Images: uploadedSamples.map(sample => ({
                    url: sample.url,
                    alt_text: sample.alt_text || '',
                    type: sample.type,
                })),
                "Model Files": [{
                    path: addForm.filename || generateFilename(addForm.name, addForm.base_model),
                    url: addForm.huggingface_url,
                }],
                lora_type: addForm.lora_type,
                created_by: {
                    is_you: addForm.created_by_is_you,
                    username: addForm.created_by_is_you ? undefined : addForm.created_by_username,
                },
                huggingface_url: addForm.huggingface_url,
                filename: addForm.filename || generateFilename(addForm.name, addForm.base_model),
                base_model: addForm.base_model,
                sample_generations: uploadedSamples,
                main_generation: mainGeneration,
                is_public: addForm.is_public,
                "Last Modified": new Date().toISOString(),
            };

            await createResource.mutateAsync({ type: 'lora', metadata: newLora });

            // Reset form
            setAddForm({
                name: '',
                description: '',
                created_by_is_you: true,
                created_by_username: '',
                huggingface_url: '',
                filename: '',
                base_model: 'Wan 2.1 T2V',
                is_public: true,
                lora_type: 'Wan 2.1 14b',
            });
            setSampleFiles([]);
            setMainGenerationIndex(0);

            toast.success("LoRA added successfully!");
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
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="lora-name">Name *</Label>
                            <Input 
                                id="lora-name" 
                                placeholder="My Awesome LoRA" 
                                value={addForm.name} 
                                onChange={e => handleFormChange('name', e.target.value)} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lora-filename">Filename</Label>
                            <Input 
                                id="lora-filename" 
                                placeholder="Auto-generated from name and base model" 
                                value={addForm.filename} 
                                onChange={e => handleFormChange('filename', e.target.value)} 
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="lora-description">Description</Label>
                        <Textarea 
                            id="lora-description" 
                            placeholder="Describe what this LoRA does..." 
                            value={addForm.description} 
                            onChange={e => handleFormChange('description', e.target.value)} 
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="lora-url">HuggingFace URL *</Label>
                        <Input 
                            id="lora-url" 
                            placeholder="https://huggingface.co/..." 
                            value={addForm.huggingface_url} 
                            onChange={e => handleFormChange('huggingface_url', e.target.value)} 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
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
                        <div className="space-y-2">
                            <Label>LoRA Type</Label>
                            <Select 
                                value={addForm.lora_type} 
                                onValueChange={(value) => handleFormChange('lora_type', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select LoRA Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Flux.dev">Flux.dev</SelectItem>
                                    <SelectItem value="Wan 2.1 14b">Wan 2.1 14b</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Created By</Label>
                        <div className="flex items-center space-x-2 mb-2">
                            <Checkbox 
                                id="created-by-you" 
                                checked={addForm.created_by_is_you}
                                onCheckedChange={(checked) => handleFormChange('created_by_is_you', checked)}
                            />
                            <Label htmlFor="created-by-you">This is my creation</Label>
                        </div>
                        {!addForm.created_by_is_you && (
                            <Input 
                                placeholder="Creator's username" 
                                value={addForm.created_by_username} 
                                onChange={e => handleFormChange('created_by_username', e.target.value)} 
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Sample Generations</Label>
                        <FileInput
                            onFileChange={(newFiles) => {
                                // Append new files to existing ones instead of replacing
                                setSampleFiles(prevFiles => [...prevFiles, ...newFiles]);
                            }}
                            acceptTypes={['image', 'video']}
                            multiple={true}
                            label="Upload sample images/videos"
                        />
                        
                        {/* Display uploaded files */}
                        {sampleFiles.length > 0 && (
                            <div className="space-y-3 mt-4">
                                <Label className="text-sm font-medium">Uploaded Files ({sampleFiles.length})</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                        <Label htmlFor="is-public">Available to others/Public</Label>
                    </div>
                </CardContent>
                <ItemCardFooter>
                    <Button 
                        onClick={handleAddLoraFromForm}
                        disabled={isSubmitting || !addForm.name.trim() || !addForm.huggingface_url.trim()}
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
  selectedLoraIds,
  lora_type,
}) => {
  const modalStyle = usePaneAwareModalStyle();
  const myLorasResource = useListResources('lora');
  const createResource = useCreateResource();
  const deleteResource = useDeleteResource();

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        style={modalStyle}
        className="max-w-4xl flex flex-col overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>LoRA Library</DialogTitle>
          <DialogDescription>
            Browse all LoRAs, filter by your collection, or add new ones.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="browse" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="browse">Browse All LoRAs</TabsTrigger>
                <TabsTrigger value="add-new">Add New LoRA</TabsTrigger>
            </TabsList>
            <TabsContent value="browse">
                <CommunityLorasTab 
                    loras={loras} 
                    onAddLora={onAddLora} 
                    onRemoveLora={onRemoveLora}
                    selectedLoraIds={selectedLoraIds} 
                    lora_type={lora_type}
                    myLorasResource={myLorasResource}
                    createResource={createResource}
                    deleteResource={deleteResource}
                />
            </TabsContent>
            <TabsContent value="add-new">
                <MyLorasTab 
                    myLorasResource={myLorasResource}
                    onAddLora={onAddLora}
                    onRemoveLora={onRemoveLora}
                    selectedLoraIds={selectedLoraIds}
                    deleteResource={deleteResource}
                    createResource={createResource}
                    lora_type={lora_type}
                />
            </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}; 