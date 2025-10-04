import React, { useMemo } from 'react';
import { Shot } from '@/types/shots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Film } from 'lucide-react';

interface CharacterListProps {
  onSelectCharacter: (shot: Shot) => void;
  onCreateNewCharacter: () => void;
  shots?: Shot[];
  sortMode?: 'ordered' | 'newest' | 'oldest';
}

const CharacterList: React.FC<CharacterListProps> = ({
  onSelectCharacter,
  onCreateNewCharacter,
  shots: propShots,
  sortMode = 'ordered',
}) => {
  // Get shots from context if not provided via props
  const { shots: contextShots, isLoading } = useShots();
  const shots = propShots || contextShots;

  // Sort shots based on sort mode
  const sortedShots = useMemo(() => {
    if (!shots) return [];
    
    const shotsCopy = [...shots];
    
    switch (sortMode) {
      case 'newest':
        return shotsCopy.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        });
      case 'oldest':
        return shotsCopy.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateA - dateB;
        });
      case 'ordered':
      default:
        return shotsCopy.sort((a, b) => (a.position || 0) - (b.position || 0));
    }
  }, [shots, sortMode]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-64 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!sortedShots || sortedShots.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 px-4">
        <div className="text-center">
          <Film className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No characters yet</p>
          <button
            onClick={onCreateNewCharacter}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Create First Character
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4">
      {sortedShots.map((shot) => {
        // Get the first image from the shot as the character reference
        const characterImage = shot.images?.[0];
        const animationCount = shot.images?.filter(img => img.type?.includes('video'))?.length || 0;

        return (
          <div
            key={shot.id}
            onClick={() => onSelectCharacter(shot)}
            className="group relative cursor-pointer rounded-lg border border-border bg-card hover:border-primary transition-all duration-200 overflow-hidden"
          >
            {/* Character Image */}
            <div className="aspect-[3/4] bg-muted relative">
              {characterImage ? (
                <img
                  src={characterImage.url}
                  alt={shot.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
              
              {/* Animation count badge */}
              {animationCount > 0 && (
                <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs font-medium">
                  {animationCount} {animationCount === 1 ? 'animation' : 'animations'}
                </div>
              )}
            </div>

            {/* Character Info */}
            <div className="p-4">
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                {shot.name}
              </h3>
              {shot.created_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Created {new Date(shot.created_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CharacterList;

