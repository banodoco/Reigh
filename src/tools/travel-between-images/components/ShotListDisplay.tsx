import React from 'react';
import { Shot } from '@/types/shots';
import VideoShotDisplay from './VideoShotDisplay'; // Assuming it's in the same directory

interface ShotListDisplayProps {
  shots: Shot[] | undefined | null;
  onSelectShot: (shot: Shot) => void;
  currentProjectId: string | null;
}

const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  shots,
  onSelectShot,
  currentProjectId,
}) => {
  if (!shots || shots.length === 0) {
    return <p>No shots available for this project. You can create one using the button above.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {shots.map((shot) => (
        <VideoShotDisplay
          key={shot.id}
          shot={shot}
          onSelectShot={() => onSelectShot(shot)}
          currentProjectId={currentProjectId}
        />
      ))}
    </div>
  );
};

export default ShotListDisplay; 