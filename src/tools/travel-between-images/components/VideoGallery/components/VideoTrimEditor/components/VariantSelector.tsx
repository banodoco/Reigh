/**
 * VariantSelector Component
 * 
 * Displays a grid of clickable variant thumbnails to switch between variants.
 * Shows which variant is primary and which is currently active.
 * Shows variant relationships (what it's based on / what's based on it).
 * Allows filtering by relationship and making the current variant primary.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Check, Scissors, Sparkles, Film, Star, Loader2, ArrowDown, ArrowUp, X, ChevronLeft, ChevronRight, ImagePlus, Download, Trash2, GitBranch } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { usePrefetchTaskData, usePrefetchTaskById } from '@/shared/hooks/useUnifiedGenerations';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { SharedTaskDetails } from '@/tools/travel-between-images/components/SharedTaskDetails';
import { LineageGifModal } from '@/shared/components/LineageGifModal';
import { getLineageDepth } from '@/shared/hooks/useLineageChain';
import type { VariantSelectorProps, GenerationVariant } from '../types';

const ITEMS_PER_PAGE = 20;

// Get icon for variant type
const getVariantIcon = (variantType: string | null) => {
  switch (variantType) {
    case 'trimmed':
      return Scissors;
    case 'upscaled':
      return Sparkles;
    case 'magic_edit':
      return Sparkles;
    case 'original':
    default:
      return Film;
  }
};

// Get label for variant type
const getVariantLabel = (variant: GenerationVariant): string => {
  if (variant.variant_type === 'trimmed') {
    const params = variant.params as any;
    if (params?.trimmed_duration) {
      return `Trimmed (${params.trimmed_duration.toFixed(1)}s)`;
    }
    return 'Trimmed';
  }
  if (variant.variant_type === 'upscaled') {
    return 'Upscaled';
  }
  if (variant.variant_type === 'original') {
    return 'Original';
  }
  if (variant.variant_type === 'magic_edit') {
    return 'Magic Edit';
  }
  return variant.variant_type || 'Variant';
};

type RelationshipFilter = 'all' | 'parents' | 'children';

// Check if variant is "new" (hasn't been viewed yet)
// For currently active variant, always return false for instant feedback
const isNewVariant = (variant: GenerationVariant, activeVariantId: string | null): boolean => {
  // Active variant is being viewed right now, so not "new"
  if (variant.id === activeVariantId) return false;
  // Variant is new if it hasn't been viewed (viewed_at is null)
  return variant.viewed_at === null;
};

// Get human-readable time ago string
const getTimeAgo = (createdAt: string): string => {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = now - created;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoading = false,
  onPromoteToGeneration,
  isPromoting = false,
  onLoadVariantSettings,
  onDeleteVariant,
  readOnly = false,
}) => {
  const [isMakingPrimary, setIsMakingPrimary] = useState(false);
  const [localIsPromoting, setLocalIsPromoting] = useState(false);
  const [promoteSuccess, setPromoteSuccess] = useState(false);
  const [relationshipFilter, setRelationshipFilter] = useState<RelationshipFilter>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [loadedSettingsVariantId, setLoadedSettingsVariantId] = useState<string | null>(null);
  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);
  const [copiedVariantId, setCopiedVariantId] = useState<string | null>(null);
  const [lineageGifVariantId, setLineageGifVariantId] = useState<string | null>(null);
  // Store lineage depth for each variant (only show GIF button when depth >= 5)
  const [variantLineageDepth, setVariantLineageDepth] = useState<Record<string, number>>({});
  const isMobile = useIsMobile();
  const { data: availableLoras } = usePublicLoras();

  // Track which variant IDs we've already checked for lineage depth
  // Lineage depth is checked lazily on hover (see handleVariantMouseEnter)
  const checkedLineageIdsRef = React.useRef<Set<string>>(new Set());

  // Prefetch task data on hover (desktop only)
  // For variants, we need to prefetch the source_task_id directly (if available)
  // since that's what MediaLightbox will look up when viewing the variant
  const prefetchTaskData = usePrefetchTaskData();
  const prefetchTaskById = usePrefetchTaskById();

  // Check lineage depth lazily on hover (only for variants not yet checked)
  const checkLineageDepthOnHover = useCallback(async (variantId: string) => {
    // Skip if already checked or currently being checked
    if (checkedLineageIdsRef.current.has(variantId)) return;
    checkedLineageIdsRef.current.add(variantId);

    try {
      const depth = await getLineageDepth(variantId);
      setVariantLineageDepth(prev => ({ ...prev, [variantId]: depth }));
    } catch {
      setVariantLineageDepth(prev => ({ ...prev, [variantId]: 0 }));
    }
  }, []);

  const handleVariantMouseEnter = useCallback((variant: GenerationVariant) => {
    if (isMobile) return;

    // Check lineage depth lazily when hovering
    checkLineageDepthOnHover(variant.id);

    const variantParams = variant.params as Record<string, any> | undefined;
    const sourceTaskId = variantParams?.source_task_id ||
                         variantParams?.orchestrator_task_id ||
                         variantParams?.task_id;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validSourceTaskId = sourceTaskId && uuidRegex.test(sourceTaskId) ? sourceTaskId : null;

    if (validSourceTaskId) {
      // Variant has a source_task_id - prefetch that task directly
      console.log('[VariantPrefetch] Prefetching source task:', validSourceTaskId.substring(0, 8), 'for variant:', variant.id.substring(0, 8));
      prefetchTaskById(validSourceTaskId);
    } else {
      // No source_task_id - prefetch via generation ID as fallback
      console.log('[VariantPrefetch] No source_task_id, prefetching via generation:', variant.generation_id.substring(0, 8));
      prefetchTaskData(variant.generation_id);
    }
  }, [isMobile, prefetchTaskData, prefetchTaskById, checkLineageDepthOnHover]);

  // Calculate variant relationships based on source_variant_id in params
  const { parentVariants, childVariants, relationshipMap } = useMemo(() => {
    console.log('[VariantRelationship] Computing relationships:');
    console.log('[VariantRelationship] variantsCount:', variants.length);
    console.log('[VariantRelationship] activeVariantId:', activeVariantId);
    
    const parents = new Set<string>();
    const children = new Set<string>();
    const relMap: Record<string, { isParent: boolean; isChild: boolean }> = {};

    // Initialize all variants with no relationship
    variants.forEach(v => {
      relMap[v.id] = { isParent: false, isChild: false };
    });

    // Find the active variant
    const activeVar = variants.find(v => v.id === activeVariantId);
    if (!activeVar) {
      console.log('[VariantRelationship] No active variant found');
      return { parentVariants: parents, childVariants: children, relationshipMap: relMap };
    }

    console.log('[VariantRelationship] Active variant:');
    console.log('[VariantRelationship] - id:', activeVar.id);
    console.log('[VariantRelationship] - variant_type:', activeVar.variant_type);
    console.log('[VariantRelationship] - params:', JSON.stringify(activeVar.params));

    // Find parents: variants that the active variant is based on
    const activeSourceVariantId = (activeVar.params as any)?.source_variant_id;
    console.log('[VariantRelationship] Active variant source_variant_id:', activeSourceVariantId);
    
    if (activeSourceVariantId) {
      const parentVariant = variants.find(v => v.id === activeSourceVariantId);
      if (parentVariant) {
        console.log('[VariantRelationship] Found parent variant:', parentVariant.id);
        parents.add(parentVariant.id);
        relMap[parentVariant.id].isParent = true;
      } else {
        console.log('[VariantRelationship] Parent variant not in variants list');
      }
    }

    // Find children: variants that are based on the active variant
    variants.forEach(variant => {
      const sourceId = (variant.params as any)?.source_variant_id;
      if (sourceId) {
        console.log('[VariantRelationship] Variant', variant.id.substring(0, 8), 'has source_variant_id:', sourceId);
      }
      if (sourceId === activeVariantId) {
        console.log('[VariantRelationship] Found child variant:', variant.id);
        children.add(variant.id);
        relMap[variant.id].isChild = true;
      }
    });

    console.log('[VariantRelationship] Result:');
    console.log('[VariantRelationship] - parentCount:', parents.size);
    console.log('[VariantRelationship] - childCount:', children.size);

    return { parentVariants: parents, childVariants: children, relationshipMap: relMap };
  }, [variants, activeVariantId]);

  // Sort variants with primary first, then filter based on relationship filter
  const sortedVariants = useMemo(() => {
    return [...variants].sort((a, b) => {
      // Primary variant first
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    });
  }, [variants]);

  // Filter variants based on relationship filter
  const filteredVariants = useMemo(() => {
    if (relationshipFilter === 'all') return sortedVariants;
    if (relationshipFilter === 'parents') {
      return sortedVariants.filter(v => parentVariants.has(v.id) || v.id === activeVariantId);
    }
    if (relationshipFilter === 'children') {
      return sortedVariants.filter(v => childVariants.has(v.id) || v.id === activeVariantId);
    }
    return sortedVariants;
  }, [sortedVariants, relationshipFilter, parentVariants, childVariants, activeVariantId]);

  // Pagination
  const totalPages = Math.ceil(filteredVariants.length / ITEMS_PER_PAGE);
  const paginatedVariants = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE;
    return filteredVariants.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredVariants, currentPage]);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(0);
  }, [relationshipFilter]);

  const hasRelationships = parentVariants.size > 0 || childVariants.size > 0;

  // Don't show if no variants at all
  if (!isLoading && variants.length === 0) {
    return null;
  }

  // Check if current active variant is NOT the primary
  const activeVariant = variants.find(v => v.id === activeVariantId);
  const isViewingNonPrimary = activeVariant && !activeVariant.is_primary;

  const handleMakePrimary = async () => {
    if (!activeVariantId || !onMakePrimary) return;
    setIsMakingPrimary(true);
    try {
      await onMakePrimary(activeVariantId);
    } finally {
      setIsMakingPrimary(false);
    }
  };

  const handlePromoteToGeneration = async () => {
    if (!activeVariantId || !onPromoteToGeneration) return;
    setLocalIsPromoting(true);
    setPromoteSuccess(false);
    try {
      await onPromoteToGeneration(activeVariantId);
      setPromoteSuccess(true);
      // Reset success state after a short delay
      setTimeout(() => setPromoteSuccess(false), 2000);
    } finally {
      setLocalIsPromoting(false);
    }
  };

  if (isLoading) {
    // Show single skeleton when loading since we don't know variant count yet
    return (
      <div className="flex flex-wrap gap-2 p-2 bg-background/80 backdrop-blur-sm rounded-lg">
        <Skeleton className="w-16 h-10 rounded" />
      </div>
    );
  }

  return (
    <>
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2 p-2 bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg overflow-hidden">
        {/* Header section - stacks on mobile, single row on desktop */}
        <div className={cn("flex gap-2", isMobile ? "flex-col" : "items-center justify-between")}>
          {/* Row 1: Label + Action buttons */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">Variants ({variants.length})</span>
            {/* Action buttons - hidden in readOnly mode */}
            {!readOnly && (
            <div className="flex items-center gap-1">
              {/* Make new image button */}
              {onPromoteToGeneration && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePromoteToGeneration}
                      disabled={localIsPromoting || isPromoting}
                      className={cn(
                        "h-auto min-h-6 text-xs px-2 py-1 gap-1 whitespace-normal text-left",
                        promoteSuccess && "bg-green-500/20 border-green-500/50 text-green-400"
                      )}
                    >
                      {localIsPromoting || isPromoting ? (
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                      ) : promoteSuccess ? (
                        <Check className="w-3 h-3 shrink-0" />
                      ) : (
                        <ImagePlus className="w-3 h-3 shrink-0" />
                      )}
                      {promoteSuccess ? 'Created!' : 'New image'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[100001]">
                    <p>Create a standalone image from this variant</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Make main button */}
              {isViewingNonPrimary && onMakePrimary ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleMakePrimary}
                      disabled={isMakingPrimary}
                      className="h-auto min-h-6 text-xs px-2 py-1 gap-1 whitespace-normal text-left"
                    >
                      {isMakingPrimary ? (
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                      ) : (
                        <Star className="w-3 h-3 shrink-0" />
                      )}
                      Make main
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[100001]">
                    <p>Set this variant as the primary display version</p>
                  </TooltipContent>
                </Tooltip>
              ) : activeVariant?.is_primary ? (
                <div className="flex items-center gap-1 h-6 text-xs px-2 text-green-500">
                  <Star className="w-3 h-3 fill-current" />
                  <span>Main variant</span>
                </div>
              ) : null}
            </div>
            )}
          </div>

          {/* Row 2 (mobile) / same row (desktop): Relationship filter buttons */}
          {hasRelationships && (
            <div className="flex items-center gap-1 justify-start">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setRelationshipFilter(relationshipFilter === 'parents' ? 'all' : 'parents')}
                    className={cn(
                      'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                      relationshipFilter === 'parents'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                      parentVariants.size === 0 && 'opacity-50 cursor-not-allowed'
                    )}
                    disabled={parentVariants.size === 0}
                  >
                    <ArrowUp className="w-2.5 h-2.5" />
                    <span>Based on ({parentVariants.size})</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[100001]">
                  <p>Show variants this is based on</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setRelationshipFilter(relationshipFilter === 'children' ? 'all' : 'children')}
                    className={cn(
                      'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                      relationshipFilter === 'children'
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                      childVariants.size === 0 && 'opacity-50 cursor-not-allowed'
                    )}
                    disabled={childVariants.size === 0}
                  >
                    <ArrowDown className="w-2.5 h-2.5" />
                    <span>Based on this ({childVariants.size})</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[100001]">
                  <p>Show variants based on this one</p>
                </TooltipContent>
              </Tooltip>

              {relationshipFilter !== 'all' && (
                <button
                  onClick={() => setRelationshipFilter('all')}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pagination info - at top */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pb-1 border-b border-border/30">
            <span className="text-[10px] text-muted-foreground">
              {currentPage * ITEMS_PER_PAGE + 1}-{Math.min((currentPage + 1) * ITEMS_PER_PAGE, filteredVariants.length)} of {filteredVariants.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className={cn(
                  'p-0.5 rounded hover:bg-muted transition-colors',
                  currentPage === 0 && 'opacity-30 cursor-not-allowed'
                )}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-muted-foreground min-w-[3ch] text-center">
                {currentPage + 1}/{totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className={cn(
                  'p-0.5 rounded hover:bg-muted transition-colors',
                  currentPage >= totalPages - 1 && 'opacity-30 cursor-not-allowed'
                )}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Variants grid - responsive columns, no internal scroll (parent handles scrolling) */}
        {/* p-0.5 ensures ring-2 on selected variant isn't clipped on any side */}
        {/* items-start prevents grid items from stretching vertically */}
        <div className={cn(
          "grid gap-1 w-full p-0.5 items-start",
          isMobile ? "grid-cols-3" : "grid-cols-4"
        )}>
          {paginatedVariants.map((variant) => {
            const isActive = variant.id === activeVariantId;
            const isPrimary = variant.is_primary;
            const isParent = relationshipMap[variant.id]?.isParent || false;
            const isChild = relationshipMap[variant.id]?.isChild || false;
            const Icon = getVariantIcon(variant.variant_type);
            const label = getVariantLabel(variant);
            
            // Find the parent variant (what this variant is based on)
            const sourceVariantId = (variant.params as any)?.source_variant_id;
            const parentVariant = sourceVariantId ? variants.find(v => v.id === sourceVariantId) : null;

            // Create the button content separately to avoid duplication
            const buttonContent = (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[VariantTapDebug] Variant button clicked:', {
                    variantId: variant.id.substring(0, 8),
                    isMobile,
                  });
                  onVariantSelect(variant.id);
                }}
                onTouchEnd={(e) => {
                  // On mobile, handle touch end to ensure tap works
                  if (isMobile) {
                    e.stopPropagation();
                    console.log('[VariantTapDebug] Variant button touchEnd:', {
                      variantId: variant.id.substring(0, 8),
                    });
                    onVariantSelect(variant.id);
                  }
                }}
                onMouseEnter={() => handleVariantMouseEnter(variant)}
                className={cn(
                  'relative block p-0.5 rounded transition-all w-full touch-manipulation',
                  'hover:bg-muted/80',
                  // Primary (main) variant gets green ring
                  isPrimary && !isActive && 'ring-2 ring-green-500 bg-green-500/10',
                  // Active variant gets orange ring (takes precedence over green)
                  isActive
                    ? 'ring-2 ring-orange-500 bg-orange-500/10'
                    : 'opacity-70 hover:opacity-100',
                  // Add relationship highlighting (only when not active or primary)
                  isParent && !isActive && !isPrimary && 'ring-1 ring-blue-500/50',
                  isChild && !isActive && !isPrimary && 'ring-1 ring-purple-500/50'
                )}
              >
                {/* Thumbnail - use padding-based aspect ratio for reliable 16:9 sizing */}
                <div className="relative w-full rounded overflow-hidden bg-muted" style={{ paddingBottom: '56.25%' }}>
                  {(variant.thumbnail_url || variant.location) ? (
                    <img
                      src={variant.thumbnail_url || variant.location}
                      alt={label}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Primary badge */}
                  {isPrimary && (
                    <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full p-0.5 pointer-events-none">
                      <Check className="w-2 h-2 text-white" />
                    </div>
                  )}

                  {/* Relationship badge - parent (this is what current is based on) */}
                  {isParent && !isActive && (
                    <div className="absolute top-0.5 left-0.5 bg-blue-500 rounded-full p-0.5 pointer-events-none" title="Current is based on this">
                      <ArrowUp className="w-2 h-2 text-white" />
                    </div>
                  )}

                  {/* Relationship badge - child (based on current) */}
                  {isChild && !isActive && (
                    <div className="absolute top-0.5 left-0.5 bg-purple-500 rounded-full p-0.5 pointer-events-none" title="Based on current">
                      <ArrowDown className="w-2 h-2 text-white" />
                    </div>
                  )}

                  {/* NEW badge or time ago for variants */}
                  {isNewVariant(variant, activeVariantId) ? (
                    <div className="absolute bottom-0.5 left-0.5 bg-yellow-500 text-black text-[8px] font-bold px-1 rounded pointer-events-none">
                      NEW
                    </div>
                  ) : (
                    <div className="absolute bottom-0.5 left-0.5 bg-black/70 text-white text-[8px] px-1 rounded pointer-events-none">
                      {getTimeAgo(variant.created_at)}
                    </div>
                  )}
                </div>
              </button>
            );

            // On mobile, render without Tooltip wrapper to avoid touch event interference
            if (isMobile) {
              return <React.Fragment key={variant.id}>{buttonContent}</React.Fragment>;
            }

            // On desktop, use Tooltip for hover info
            return (
              <Tooltip key={variant.id}>
                <TooltipTrigger asChild>
                  {buttonContent}
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[100001] max-w-md p-0">
                  <div className="p-2 space-y-2">
                    {/* Header with label, status badges, id copy, delete button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{label}</p>
                        {/* Status badges */}
                        {isPrimary && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                            Primary
                          </span>
                        )}
                        {isActive && !isPrimary && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            Viewing
                          </span>
                        )}
                        {isParent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            Parent of current
                          </span>
                        )}
                        {isChild && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            Child of current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {/* Copy ID button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(variant.id).catch(() => {});
                                setCopiedVariantId(variant.id);
                                setTimeout(() => setCopiedVariantId(null), 2000);
                              }}
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] transition-all duration-150",
                                copiedVariantId === variant.id
                                  ? "text-green-400 bg-green-400/10"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95"
                              )}
                            >
                              {copiedVariantId === variant.id ? 'copied' : 'id'}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            Copy ID
                          </TooltipContent>
                        </Tooltip>
                        {/* Lineage GIF button - appears with subtle animation when depth >= 5 */}
                        {(variantLineageDepth[variant.id] || 0) >= 5 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLineageGifVariantId(variant.id);
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all duration-150 active:scale-95 animate-in fade-in slide-in-from-left-1 duration-300"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                              View evolution ({variantLineageDepth[variant.id]} generations)
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* Delete button - non-primary variants only */}
                        {!readOnly && onDeleteVariant && !isPrimary && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingVariantId(variant.id);
                                  onDeleteVariant(variant.id).finally(() => setDeletingVariantId(null));
                                }}
                                disabled={deletingVariantId === variant.id}
                                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 active:scale-95 disabled:opacity-50"
                              >
                                {deletingVariantId === variant.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                              Delete
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {/* Full task details using SharedTaskDetails */}
                    {variant.params && (
                      <div className="border-t border-border/50 pt-2">
                        <SharedTaskDetails
                          task={{
                            taskType: (variant.params as any)?.task_type || 'video_generation',
                            params: variant.params,
                          }}
                          inputImages={[]}
                          variant="hover"
                          isMobile={false}
                          availableLoras={availableLoras}
                          showCopyButtons={true}
                        />
                      </div>
                    )}

                    {/* Parent variant thumbnail */}
                    {parentVariant && (
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/50">
                        <span className="text-xs text-muted-foreground">Based on:</span>
                        <div className="w-8 h-5 rounded overflow-hidden bg-muted flex-shrink-0">
                          <img
                            src={parentVariant.thumbnail_url || parentVariant.location}
                            alt="Parent variant"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    )}

                    {/* Action buttons row - Make Primary and/or Load Settings - hidden in readOnly mode */}
                    {!readOnly && ((!isPrimary && onMakePrimary) || (onLoadVariantSettings && variant.params)) && (
                      <div className="flex gap-1.5">
                        {/* Make Primary button - only for non-primary variants */}
                        {!isPrimary && onMakePrimary && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onVariantSelect(variant.id);
                              setTimeout(() => onMakePrimary(variant.id), 50);
                            }}
                            className={cn(
                              "h-6 text-xs gap-1",
                              onLoadVariantSettings && variant.params ? "flex-1" : "w-full"
                            )}
                          >
                            <Star className="w-3 h-3" />
                            Make Primary
                          </Button>
                        )}
                        {/* Load Settings button */}
                        {onLoadVariantSettings && variant.params && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadVariantSettings(variant.params as Record<string, any>);
                              setLoadedSettingsVariantId(variant.id);
                              setTimeout(() => setLoadedSettingsVariantId(null), 2000);
                            }}
                            className={cn(
                              "h-6 text-xs gap-1",
                              !isPrimary && onMakePrimary ? "flex-1" : "w-full",
                              loadedSettingsVariantId === variant.id && "bg-green-500/20 border-green-500/50 text-green-400"
                            )}
                          >
                            {loadedSettingsVariantId === variant.id ? (
                              <>
                                <Check className="w-3 h-3" />
                                Loaded!
                              </>
                            ) : (
                              <>
                                <Download className="w-3 h-3" />
                                Load Settings
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Empty state when filtering */}
        {filteredVariants.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-2">
            No variants match this filter
          </div>
        )}
      </div>
    </TooltipProvider>

    {/* Lineage GIF Modal - outside TooltipProvider to avoid z-index issues */}
    <LineageGifModal
      open={!!lineageGifVariantId}
      onClose={() => setLineageGifVariantId(null)}
      variantId={lineageGifVariantId}
    />
    </>
  );
};

export default VariantSelector;

