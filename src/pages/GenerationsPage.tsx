import React, { useState } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useListGenerations } from '@/tools/image-generation/hooks/useGenerations';
import ImageGallery from '@/shared/components/ImageGallery';
import { useListShots, useAddImageToShot } from '@/shared/hooks/useShots';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { Button } from '@/shared/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const GENERATIONS_PER_PAGE = 48; // Show more on the full page

const GenerationsPage: React.FC = () => {
  const { selectedProjectId } = useProject();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, isPlaceholderData } = useListGenerations(selectedProjectId, page, GENERATIONS_PER_PAGE);
  const { data: shotsData } = useListShots(selectedProjectId);
  const { lastAffectedShotId } = useLastAffectedShot();
  const queryClient = useQueryClient();
  const addImageToShotMutation = useAddImageToShot();

  const handleDeleteGeneration = (id: string) => {
    // Placeholder for delete mutation
    console.log(`TODO: Implement delete for generation ${id}`);
    toast.info("Delete functionality is not yet implemented.", {
      description: `Attempted to delete generation: ${id}`,
    });
    // In a real implementation:
    // deleteGenerationMutation.mutate(id, {
    //   onSuccess: () => {
    //     queryClient.invalidateQueries(['generations', selectedProjectId]);
    //     toast.success("Generation deleted.");
    //   },
    //   onError: (err) => {
    //     toast.error(`Failed to delete generation: ${err.message}`);
    //   }
    // });
  };

  const handleAddToShot = (generationId: string, imageUrl?: string) => {
    if (!lastAffectedShotId) {
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      addImageToShotMutation.mutate({
        shot_id: lastAffectedShotId,
        generation_id: generationId,
        project_id: selectedProjectId!,
      }, {
        onSuccess: () => {
          toast.success("Image added to shot");
          resolve(true);
        },
        onError: (error) => {
          toast.error("Failed to add image to shot", {
            description: error.message,
          });
          resolve(false);
        }
      });
    });
  };

  const constructImageUrl = (url: string | undefined | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';
    return `${baseUrl}${url}`;
  };

  const handleNextPage = () => {
    if (!isPlaceholderData && data?.totalPages && page < data.totalPages) {
      setPage(page + 1);
    }
  };

  const handlePrevPage = () => {
    setPage(Math.max(1, page - 1));
  };

  if (!selectedProjectId) {
    return <div className="container mx-auto p-4 text-center">Please select a project to view generations.</div>;
  }

  return (
    <div className="container mx-auto p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">All Generations</h1>
        {/* Pagination Controls */}
        <div className="flex items-center space-x-2">
            <span className="text-sm text-zinc-600">
                Page {data?.page || 1} of {data?.totalPages || 1}
            </span>
            <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
                Previous
            </Button>
            <Button variant="outline" size="sm" onClick={handleNextPage} disabled={isPlaceholderData || !data?.totalPages || page >= data.totalPages}>
                Next
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
      </div>
      
      {isLoading && <div className="text-center py-10">Loading generations...</div>}
      {isError && <div className="text-center py-10 text-red-500">Error loading generations: {error?.message}</div>}
      
      {data && data.items.length > 0 ? (
        <div className="flex-grow">
          <ImageGallery
            images={data.items.map(gen => ({ 
              ...gen, 
              url: constructImageUrl(gen.location), 
              isVideo: gen.type?.includes('video') 
            }))}
            onDelete={handleDeleteGeneration}
            allShots={shotsData || []}
            lastShotId={lastAffectedShotId || undefined}
            onAddToLastShot={handleAddToShot}
          />
        </div>
      ) : (
        !isLoading && <div className="text-center py-10 text-zinc-500">No generations found for this project.</div>
      )}
    </div>
  );
};

export default GenerationsPage; 