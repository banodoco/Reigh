import React, { useState, useEffect, useMemo } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import ShotGroup from './ShotGroup';
import NewGroupDropZone from './NewGroupDropZone';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useProject } from "@/shared/contexts/ProjectContext";
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { VideoTravelSettings } from '@/tools/travel-between-images/settings';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ArrowDown, Search, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePanes } from '@/shared/contexts/PanesContext';
import CreateShotModal from '@/shared/components/CreateShotModal';
import { useCreateShot, useHandleExternalImageDrop } from '@/shared/hooks/useShots';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useBottomOffset } from '@/shared/hooks/useBottomOffset';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';

const ShotsPaneComponent: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { shots, isLoading, error } = useShots();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const location = useLocation();
  // Pagination state
  const pageSize = 5;
  const [currentPage, setCurrentPage] = useState(1);
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch project-level settings for defaults when creating new shots
  const { settings: projectSettings } = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { projectId: selectedProjectId, enabled: !!selectedProjectId }
  );

  // Fetch project-level UI settings for defaults
  const { settings: projectUISettings } = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', { 
    projectId: selectedProjectId, 
    enabled: !!selectedProjectId 
  });

  // Fetch and manage shots pane UI settings with sort order
  const { settings: shotsPaneSettings, update: updateShotsPaneSettings } = useToolSettings<{
    sortOrder?: 'oldest' | 'newest';
  }>('shots-pane-ui-state', { 
    projectId: selectedProjectId, 
    enabled: !!selectedProjectId 
  });

  // Get sort order from settings, default to 'newest'
  const sortOrder = shotsPaneSettings?.sortOrder || 'newest';

  const handleSortOrderChange = (newSortOrder: 'oldest' | 'newest') => {
    if (!selectedProjectId) return;
    updateShotsPaneSettings('project', { sortOrder: newSortOrder });
    // Jump to page 1 when sort order changes
    setCurrentPage(1);
  };

  // Search handlers
  const handleSearchToggle = () => {
    setIsSearchOpen(!isSearchOpen);
    if (isSearchOpen) {
      // Clear search when closing
      setSearchQuery('');
    }
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  useRenderLogger('ShotsPane', { shotsCount: shots?.length, currentPage });
  
  // Filter and sort shots
  const filteredShots = useMemo(() => {
    // [VideoLoadSpeedIssue] Track ShotsPane data availability
    console.log('[VideoLoadSpeedIssue] ShotsPane shots data:', {
      shotsCount: shots?.length || 0,
      isLoading,
      timestamp: Date.now(),
      firstShotPreview: shots?.[0] ? {
        id: shots[0].id,
        imagesCount: shots[0].images?.length || 0
      } : null
    });
    
    if (!shots) {
      return [];
    }
    
    const filtered = shots.map(shot => {
      // Note: shot.images now contains all images from ShotsContext (unlimited)
      // Filter to show only positioned images in the intended sequence
      const filteredImages = (shot.images || [])
        // Keep only images that have a valid position value
        .filter(img => {
          const hasPosition = (img as any).position !== null && (img as any).position !== undefined;
          return hasPosition;
        })
        // Order the images by their position so they appear in the intended sequence
        .sort((a, b) => {
          const posA = (a as any).position as number;
          const posB = (b as any).position as number;
          return posA - posB;
        });
      
      return {
        ...shot,
        images: filteredImages
      };
    });
    
    // Apply search filter if search is active
    let searchFiltered = filtered;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      
      // First, try to match shot names
      const nameMatches = filtered.filter(shot => 
        shot.name.toLowerCase().includes(query)
      );
      
      // If no shot name matches, search through generation parameters
      if (nameMatches.length === 0) {
        searchFiltered = filtered.filter(shot => {
          return shot.images?.some(image => {
            // Search in metadata
            if (image.metadata) {
              const metadataStr = JSON.stringify(image.metadata).toLowerCase();
              if (metadataStr.includes(query)) return true;
            }
            
            // Search in params (if available via metadata or other fields)
            if ((image as any).params) {
              const paramsStr = JSON.stringify((image as any).params).toLowerCase();
              if (paramsStr.includes(query)) return true;
            }
            
            // Search in type field
            if (image.type && image.type.toLowerCase().includes(query)) {
              return true;
            }
            
            // Search in location field
            if (image.location && image.location.toLowerCase().includes(query)) {
              return true;
            }
            
            return false;
          });
        });
      } else {
        searchFiltered = nameMatches;
      }
    }
    
    // Sort shots by creation date
    return searchFiltered.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      
      if (sortOrder === 'oldest') {
        return dateA - dateB; // Oldest first
      } else {
        return dateB - dateA; // Newest first
      }
    });
  }, [shots, sortOrder, searchQuery]);
  
  // Adjust currentPage if shots length changes (e.g., after create/delete)
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((filteredShots?.length ?? 0) / pageSize));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredShots?.length]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);
  
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const navigate = useNavigate();
  const { setCurrentShotId } = useCurrentShot();
  const isMobile = useIsMobile();
  const { navigateToShotEditor, navigateToShot } = useShotNavigation();

  // Check if we're currently on the travel-between-images page
  const isOnTravelBetweenImagesPage = location.pathname === '/tools/travel-between-images';
  
  // Check if we're viewing a specific shot (has hash with shot ID)
  const isViewingSpecificShot = !!location.hash?.replace('#', '');
  
  // Show the button if we're NOT on the travel page, OR if we're on the travel page but viewing a specific shot
  const shouldShowTravelButton = !isOnTravelBetweenImagesPage || isViewingSpecificShot;

  const {
    isGenerationsPaneLocked,
    isGenerationsPaneOpen,
    generationsPaneHeight,
    isShotsPaneLocked,
    setIsShotsPaneLocked,
    shotsPaneWidth,
  } = usePanes();

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave } = useSlidingPane({
    side: 'left',
    isLocked: isShotsPaneLocked,
    onToggleLock: () => setIsShotsPaneLocked(!isShotsPaneLocked),
  });

  const handleCreateShot = async (shotName: string, files: File[]) => {
    if (!selectedProjectId) {
      alert("Please select a project first.");
      return;
    }

    let createdShot: any = null;

    if (files.length > 0) {
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: files,
        targetShotId: null,
        currentProjectQueryKey: selectedProjectId,
        currentShotCount: shots?.length ?? 0
      });
      const createdShotId = result?.shotId || null;
      // For file uploads, we need to find the shot after the mutation completes
      if (createdShotId) {
        // The shot should be available in the cache after the mutation
        const updatedShots = shots?.concat() || [];
        createdShot = updatedShots.find(shot => shot.id === createdShotId) || { id: createdShotId, name: shotName };
      }
    } else {
      const newShotResult = await createShotMutation.mutateAsync({ name: shotName, projectId: selectedProjectId });
      createdShot = newShotResult?.shot || null;
    }

    // Apply project defaults to the newly created shot if available
    if (createdShot?.id && (projectSettings || projectUISettings)) {
      const defaultsToApply = {
        ...(projectSettings || {}),
        // Include UI settings in a special key that will be handled separately
        _uiSettings: projectUISettings || {}
      };
      // Store the new shot ID to apply defaults when settings load
      sessionStorage.setItem(`apply-project-defaults-${createdShot.id}`, JSON.stringify(defaultsToApply));
      console.log('[ShotsPane] Marked shot for project defaults application:', createdShot.id);
    }

    // Navigate to the newly created shot
    if (createdShot) {
      navigateToShot(createdShot, { closeMobilePanes: true });
    }
  };

  return (
    <>
      <PaneControlTab
        side="left"
        isLocked={isLocked}
        isOpen={isOpen}
        toggleLock={toggleLock}
        openPane={openPane}
        paneDimension={shotsPaneWidth}
        bottomOffset={useBottomOffset()}
        handlePaneEnter={handlePaneEnter}
        handlePaneLeave={handlePaneLeave}
        thirdButton={shouldShowTravelButton ? {
          onClick: () => {
            setIsShotsPaneLocked(false); // Unlock and close the pane immediately
            navigateToShotEditor({ closeMobilePanes: true });
          },
          ariaLabel: "Open Travel Between Images tool"
        } : undefined}
      />
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${shotsPaneWidth}px`,
          zIndex: 60,
        }}
      >
        <div
          {...paneProps}
          className={cn(
            `pointer-events-auto absolute top-0 left-0 h-full w-full border-2 border-r shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col bg-zinc-900/95 border-zinc-700`,
            transformClass
          )}
        >
          <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-light text-zinc-200 ml-2">Shots</h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 active:bg-zinc-600/60 p-1"
                onClick={handleSearchToggle}
                title={isSearchOpen ? "Close search" : "Search shots"}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 active:bg-zinc-600/60"
              onClick={() => handleSortOrderChange(sortOrder === 'oldest' ? 'newest' : 'oldest')}
              title={`Currently showing ${sortOrder} first. Click to show ${sortOrder === 'oldest' ? 'newest' : 'oldest'} first.`}
            >
              <ArrowDown className="h-4 w-4" />
              {sortOrder === 'oldest' ? 'Oldest' : 'Newest'}
            </Button>
          </div>
          <div className="flex flex-col gap-4 px-3 py-4 flex-grow overflow-y-auto scrollbar-hide">
            {isSearchOpen ? (
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search shot..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-zinc-800 border-zinc-600 text-zinc-200 placeholder-zinc-400 pr-8 !text-zinc-200 !placeholder-zinc-400"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-zinc-400 hover:text-zinc-100"
                  onClick={handleSearchClear}
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <NewGroupDropZone onZoneClick={() => setIsCreateModalOpen(true)} />
            )}
            {isLoading && (
              Array.from({ length: pageSize }).map((_, idx) => (
                <Skeleton key={idx} className="h-24 rounded-lg bg-zinc-700/60" />
              ))
            )}
            {error && <p className="text-red-500">Error loading shots: {error.message}</p>}
            {/* Show no results message when searching but no matches found */}
            {searchQuery.trim() && filteredShots && filteredShots.length === 0 && !isLoading && (
              <div className="text-center py-12 text-zinc-400">
                <p className="mb-2">No shots or parameters match your search.</p>
                <Button variant="ghost" size="sm" onClick={handleSearchClear} className="text-zinc-300 hover:text-zinc-100">
                  Clear search
                </Button>
              </div>
            )}
            {filteredShots && filteredShots
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map(shot => <ShotGroup key={shot.id} shot={shot} />)}
          </div>
          {/* Pagination Controls */}
          {filteredShots && filteredShots.length > pageSize && (
            <div className="p-2 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 active:bg-zinc-600/60"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-zinc-400 text-sm">
                Page {currentPage} of {Math.ceil(filteredShots.length / pageSize)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 active:bg-zinc-600/60"
                disabled={currentPage === Math.ceil(filteredShots.length / pageSize)}
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredShots.length / pageSize), p + 1))}
              >
                Next
              </Button>
            </div>
          )}
          <CreateShotModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSubmit={handleCreateShot}
            isLoading={createShotMutation.isPending || handleExternalImageDropMutation.isPending}
            defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
          />
        </div>
      </div>
    </>
  );
};

// Memoize ShotsPane - it has no props so a simple memo is sufficient
export const ShotsPane = React.memo(ShotsPaneComponent);

export default ShotsPane; 