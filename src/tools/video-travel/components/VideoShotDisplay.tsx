import React from 'react';
import { Shot, GenerationRow } from '../../../types/shots';
import { useDeleteShot } from '../../../shared/hooks/useShots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Play } from 'lucide-react';
import { toast } from 'sonner';

interface VideoShotDisplayProps {
  shot: Shot;
  onSelectShot: (shotId: string) => void;
  currentProjectId: string | null;
}

const VideoShotDisplay: React.FC<VideoShotDisplayProps> = ({ shot, onSelectShot, currentProjectId }) => {
  const deleteShotMutation = useDeleteShot();

  const handleDeleteShot = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click event
    if (!currentProjectId) {
      toast.error('Cannot delete shot: Project ID is missing.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete shot "${shot.name}"?`)) {
      try {
        await deleteShotMutation.mutateAsync(
          { shotId: shot.id, projectId: currentProjectId },
          {
            onSuccess: () => toast.success(`Shot "${shot.name}" deleted.`),
            onError: (error) => toast.error(`Failed to delete shot: ${error.message}`),
          }
        );
      } catch (error) {
        console.error("Error during deleteShotMutation call:", error);
      }
    }
  };

  const imagesToShow: GenerationRow[] = shot.images?.slice(0, 3) || [];

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-playfair text-art-voyage-text">{shot.name}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {imagesToShow.map((image, index) => (
          <div 
            key={image.shotImageEntryId || `img-${index}`} 
            className="art-voyage-card cursor-pointer"
            onClick={() => onSelectShot(shot.id)}
          >
            <div className="relative card-content">
              <img 
                src={image.thumbUrl || image.imageUrl || '/placeholder.svg'} 
                alt={`Shot image ${index + 1} for ${shot.name}`}
                className="w-full h-full object-cover rounded-sm"
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <Play className="w-8 h-8 text-white" />
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleDeleteShot} 
                className="art-voyage-icon-button"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        {shot.images && shot.images.length > 3 && (
          <div className="art-voyage-card flex items-center justify-center">
             <div className="card-content text-center">
                <p className="text-lg text-art-voyage-text">+{shot.images.length - 3}</p>
                <p className="text-sm text-muted-foreground">more</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoShotDisplay; 