import React, { useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ChevronLeft, ChevronRight, Star, Paintbrush, Wand2, PenTool, Edit3 } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import { DerivedItem } from '@/shared/hooks/useGenerations';
import { formatDistanceToNow } from 'date-fns';

export interface DerivedGenerationsGridProps {
  /** All derived items (generations + variants) - use this for new code */
  derivedItems?: DerivedItem[];
  /** Paginated derived items for display */
  paginatedDerived: DerivedItem[];
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  /** Navigate to a generation (for generation items) */
  onNavigate: (derivedId: string, derivedContext: string[]) => Promise<void>;
  /** Switch to a variant (for variant items) */
  onVariantSelect?: (variantId: string) => void;
  currentMediaId: string;
  currentShotId?: string; // To check if items are positioned in current shot
  /** Currently active variant ID - used to hide NEW badge on selected variant */
  activeVariantId?: string | null;
  variant?: 'desktop' | 'mobile';
  title?: string;
  showTopBorder?: boolean; // Whether to show the top border (when task details are present above)

  /** @deprecated Use derivedItems instead */
  derivedGenerations?: GenerationRow[];
}

/**
 * Helper to check if an item is a DerivedItem (has itemType) vs legacy GenerationRow
 */
function isDerivedItem(item: DerivedItem | GenerationRow): item is DerivedItem {
  return 'itemType' in item;
}

// Get icon for variant type
const getVariantTypeIcon = (variantType: string | undefined) => {
  switch (variantType) {
    case 'inpaint':
      return Paintbrush;
    case 'magic_edit':
      return Wand2;
    case 'annotated_edit':
      return PenTool;
    default:
      return Edit3;
  }
};

// Get label for variant type
const getVariantTypeLabel = (variantType: string | undefined) => {
  switch (variantType) {
    case 'inpaint':
      return 'Inpaint';
    case 'magic_edit':
      return 'Magic Edit';
    case 'annotated_edit':
      return 'Annotated';
    case 'edit':
      return 'Edit';
    default:
      return variantType || 'Edit';
  }
};

/**
 * DerivedGenerationsGrid Component
 * Displays a paginated grid of derived items (generations + variants)
 */
export const DerivedGenerationsGrid: React.FC<DerivedGenerationsGridProps> = ({
  derivedItems,
  derivedGenerations, // Legacy prop, ignored if derivedItems is provided
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  onSetDerivedPage,
  onNavigate,
  onVariantSelect,
  currentMediaId,
  currentShotId,
  activeVariantId,
  variant = 'desktop',
  title,
  showTopBorder = true,
}) => {
  const isMobile = variant === 'mobile';

  // [VariantClickDebug] Log component mount/update with all relevant props
  console.log('[VariantClickDebug] DerivedGenerationsGrid render:', {
    hasDerivedItems: !!derivedItems,
    derivedItemsCount: derivedItems?.length || 0,
    hasDerivedGenerations: !!derivedGenerations,
    derivedGenerationsCount: derivedGenerations?.length || 0,
    paginatedDerivedCount: paginatedDerived?.length || 0,
    hasOnVariantSelect: !!onVariantSelect,
    currentMediaId: currentMediaId?.substring(0, 8),
    title,
  });
  
  // Log item types in the list
  if (paginatedDerived && paginatedDerived.length > 0) {
    console.log('[VariantClickDebug] Items in grid:', paginatedDerived.map(item => ({
      id: item.id?.substring(0, 8),
      itemType: isDerivedItem(item) ? item.itemType : 'legacy-generation',
      variantType: isDerivedItem(item) && item.itemType === 'variant' ? item.variantType : null,
    })));
  }
  const gridCols = 'grid-cols-3';
  const gap = isMobile ? 'gap-1.5' : 'gap-2';
  const starSize = isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const starPosition = isMobile ? 'top-0.5 right-0.5' : 'top-1 right-1';
  const buttonSize = isMobile ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = isMobile ? 'text-sm' : 'text-lg';

  // Use derivedItems if provided, otherwise fall back to legacy derivedGenerations
  const allDerivedItems = derivedItems || derivedGenerations;
  const totalCount = allDerivedItems?.length || 0;
  
  // Sort derived items: starred first, then in-shot (generations only), then others
  const sortedDerived = useMemo(() => {
    if (!paginatedDerived) return [];
    
    return [...paginatedDerived].sort((a, b) => {
      // Starred items first (only generations have starred)
      const aStarred = isDerivedItem(a) ? a.starred : (a as GenerationRow).starred;
      const bStarred = isDerivedItem(b) ? b.starred : (b as GenerationRow).starred;
      if (aStarred && !bStarred) return -1;
      if (!aStarred && bStarred) return 1;
      
      // Then items in current shot (with timeline_frame - must be positioned, only for generations)
      const aIsGen = isDerivedItem(a) ? a.itemType === 'generation' : true;
      const bIsGen = isDerivedItem(b) ? b.itemType === 'generation' : true;
      
      if (currentShotId && aIsGen && bIsGen) {
        const aAssocs = isDerivedItem(a) ? a.all_shot_associations : (a as any).all_shot_associations;
        const bAssocs = isDerivedItem(b) ? b.all_shot_associations : (b as any).all_shot_associations;
        
        const aInShot = Array.isArray(aAssocs) && 
          aAssocs.some((assoc: any) => 
            assoc.shot_id === currentShotId && assoc.timeline_frame !== null && assoc.timeline_frame !== undefined
          );
        const bInShot = Array.isArray(bAssocs) && 
          bAssocs.some((assoc: any) => 
            assoc.shot_id === currentShotId && assoc.timeline_frame !== null && assoc.timeline_frame !== undefined
          );
        
        if (aInShot && !bInShot) return -1;
        if (!aInShot && bInShot) return 1;
      }
      
      // Then by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [paginatedDerived, currentShotId]);

  return (
    <div className={showTopBorder ? "border-t border-border pt-4 mt-4" : "pt-4"}>
      <div className={`mb-${isMobile ? '2' : '3'} flex items-${isMobile ? 'center' : 'start'} justify-between`}>
        <div>
          <h3 className={`${textSize} font-${isMobile ? 'medium' : 'light'}`}>
            {title || `Edits of this image (${totalCount})`}
          </h3>
        </div>
        
        {/* Pagination controls */}
        {derivedTotalPages > 1 && (
          <div className={`flex items-center gap-${isMobile ? '1' : '2'}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDerivedPage(p => Math.max(1, p - 1))}
              disabled={derivedPage === 1}
              className={`${buttonSize} p-0`}
            >
              <ChevronLeft className={iconSize} />
            </Button>
            <span className="text-xs text-muted-foreground">
              {derivedPage}{isMobile ? '/' : ' / '}{derivedTotalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDerivedPage(p => Math.min(derivedTotalPages, p + 1))}
              disabled={derivedPage === derivedTotalPages}
              className={`${buttonSize} p-0`}
            >
              <ChevronRight className={iconSize} />
            </Button>
          </div>
        )}
      </div>
      
      <div className={`grid ${gridCols} ${gap}`}>
        {sortedDerived.map((derived) => {
          // Determine if this is a variant or generation
          const isNewFormat = isDerivedItem(derived);
          const isVariant = isNewFormat && derived.itemType === 'variant';
          const isGeneration = !isVariant; // Either new format generation or legacy GenerationRow
          
          // Get fields with proper type handling
          const itemId = derived.id;
          const thumbUrl = isNewFormat ? derived.thumbUrl : (derived as GenerationRow).thumbUrl;
          const createdAt = derived.createdAt;
          const starred = isNewFormat ? derived.starred : (derived as GenerationRow).starred;
          const derivedCount = isNewFormat ? derived.derivedCount : (derived as GenerationRow).derivedCount;
          const variantType = isNewFormat && isVariant ? derived.variantType : undefined;
          const allShotAssocs = isNewFormat ? derived.all_shot_associations : (derived as any).all_shot_associations;
          
          // Check if item is in current shot with timeline position (only for generations)
          const isInShot = isGeneration && currentShotId && 
            Array.isArray(allShotAssocs) && 
            allShotAssocs.some((assoc: any) => 
              assoc.shot_id === currentShotId && assoc.timeline_frame !== null && assoc.timeline_frame !== undefined
            );
          
          // Check if item is new:
          // - For variants: NEW if not yet viewed (viewedAt is null) AND not currently selected
          // - For generations: NEW if created in last 2 minutes (legacy behavior)
          const viewedAt = isNewFormat && isVariant ? derived.viewedAt : undefined;
          const isCurrentlySelected = isVariant && activeVariantId === itemId;
          const isNew = isVariant
            ? !viewedAt && !isCurrentlySelected // Variant is NEW if not viewed and not currently selected
            : (createdAt && (Date.now() - new Date(createdAt).getTime()) < 2 * 60 * 1000);

          // Get variant icon if it's a variant
          const VariantIcon = isVariant ? getVariantTypeIcon(variantType) : null;
          
          // Handler for both click and touch
          const handleItemSelect = async () => {
            console.log('[VariantClickDebug] 🖼️ Item clicked:', {
              itemId: itemId.substring(0, 8),
              isVariant,
              isGeneration,
              variantType,
              isNewFormat,
              hasOnVariantSelect: !!onVariantSelect,
              currentMediaId: currentMediaId.substring(0, 8),
            });
            
            if (isVariant && onVariantSelect) {
              // For variants: switch to that variant (stay on same generation)
              console.log('[VariantClickDebug] 🎯 Calling onVariantSelect for variant:', itemId.substring(0, 8));
              onVariantSelect(itemId);
              console.log('[VariantClickDebug] ✅ onVariantSelect completed');
            } else if (isVariant && !onVariantSelect) {
              // Variant but no handler!
              console.warn('[VariantClickDebug] ⚠️ Variant clicked but onVariantSelect is not provided!');
              console.log('[VariantClickDebug] 🔄 Falling back to onNavigate for variant');
              // Fall back to navigating - this won't work ideally but at least logs the issue
              await onNavigate(itemId, []);
            } else {
              // For generations: navigate to that generation
              console.log('[VariantClickDebug] 🎯 Navigating to generation:', itemId.substring(0, 8));
              // Only pass generation IDs in the context (not variant IDs)
              const generationIds = (allDerivedItems || [])
                .filter(d => isDerivedItem(d) ? d.itemType === 'generation' : true)
                .map(d => d.id);
              await onNavigate(itemId, generationIds);
              console.log('[VariantClickDebug] ✅ onNavigate completed');
            }
          };
          
          return (
          <div
            key={itemId}
            className={`relative aspect-square group overflow-hidden rounded border transition-colors cursor-pointer ${
              isVariant 
                ? 'border-purple-500/50 hover:border-purple-400' 
                : 'border-border hover:border-primary'
            }`}
            onClick={handleItemSelect}
            // On touch devices, use onTouchEnd for immediate response (single tap)
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleItemSelect();
            }}
          >
            <img
              src={thumbUrl}
              alt={isVariant ? `${getVariantTypeLabel(variantType)} variant` : "Derived generation"}
              className="w-full h-full object-contain bg-black/20"
            />
            
            {/* Simple hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />
            
            {/* Variant type badge - top left for variants */}
            {isVariant && VariantIcon && (
              <div className={`absolute ${isMobile ? 'top-0.5 left-0.5' : 'top-1 left-1'} pointer-events-none flex items-center gap-1`}>
                <span className={`${isMobile ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'} bg-purple-600/90 text-white rounded flex items-center gap-0.5`}>
                  <VariantIcon className={isMobile ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
                  {getVariantTypeLabel(variantType)}
                </span>
                {isNew && (
                  <span className={`${isMobile ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'} bg-green-500 text-white rounded font-semibold`}>
                    NEW
                  </span>
                )}
              </div>
            )}
            
            {/* Timestamp and NEW badge - top left for generations */}
            {isGeneration && createdAt && (
              <div className={`absolute ${isMobile ? 'top-0.5 left-0.5' : 'top-1 left-1'} pointer-events-none flex items-center gap-1`}>
                <span className={`${isMobile ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'} bg-black/70 text-white rounded`}>
                  {(() => {
                    const formatted = formatDistanceToNow(new Date(createdAt), { addSuffix: true });
                    if (formatted.includes('less than')) return 'Just now';
                    return formatted
                      .replace('about ', '')
                      .replace(' minutes', 'm')
                      .replace(' minute', 'm')
                      .replace(' hours', 'h')
                      .replace(' hour', 'h')
                      .replace(' days', 'd')
                      .replace(' day', 'd')
                      .replace(' months', 'mo')
                      .replace(' month', 'mo')
                      .replace(' years', 'y')
                      .replace(' year', 'y')
                      .replace(' ago', '');
                  })()}
                </span>
                {isNew && (
                  <span className={`${isMobile ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'} bg-green-500 text-white rounded font-semibold`}>
                    NEW
                  </span>
                )}
              </div>
            )}
            
            {/* Star - top right (only for generations) */}
            {isGeneration && starred && (
              <div className={`absolute ${starPosition} pointer-events-none`}>
                <Star className={`${starSize} fill-yellow-500 text-yellow-500`} />
              </div>
            )}
            
            {/* Derived count - bottom left (only for generations) */}
            {isGeneration && derivedCount !== undefined && derivedCount > 0 && (
              <div className={`absolute ${isMobile ? 'bottom-0.5 left-0.5' : 'bottom-1 left-1'} pointer-events-none`}>
                <span className={`${isMobile ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'} bg-black/70 text-white rounded`}>
                  {derivedCount} based on this
                </span>
              </div>
            )}
            
            {/* In shot badge - bottom right (only for generations) */}
            {isInShot && (
              <div className={`absolute ${isMobile ? 'bottom-0.5 right-0.5' : 'bottom-1 right-1'} pointer-events-none`}>
                <span className={`${isMobile ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'} bg-black/70 text-white rounded`}>
                  In shot
                </span>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
};

