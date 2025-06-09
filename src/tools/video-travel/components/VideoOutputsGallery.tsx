import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { GenerationRow } from "@/types/shots";
import VideoLightbox from "./VideoLightbox.tsx";
import { VideoOutputItem } from './VideoOutputItem';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/shared/components/ui/pagination";
import { Skeleton } from '@/shared/components/ui/skeleton';

interface VideoOutputsGalleryProps {
  videoOutputs: GenerationRow[];
  onDelete: (generationId: string) => void;
  deletingVideoId: string | null;
}

const VideoOutputsGallery: React.FC<VideoOutputsGalleryProps> = ({ videoOutputs, onDelete, deletingVideoId }) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [animatedVideoOutputs, setAnimatedVideoOutputs] = useState<GenerationRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const videosPerPage = 9;

  // Pagination logic
  const pageCount = Math.ceil(videoOutputs.length / videosPerPage);
  const paginatedVideos = useMemo(() => {
    const startIndex = (currentPage - 1) * videosPerPage;
    const endIndex = startIndex + videosPerPage;
    return videoOutputs.slice(startIndex, endIndex);
  }, [videoOutputs, currentPage]);

  useEffect(() => {
    // This effect handles the sequential fade-in of video items.
    // When the list of videos changes, it resets and re-runs the animation.
    setAnimatedVideoOutputs([]);

    const timeouts = paginatedVideos.map((video, index) => {
        return setTimeout(() => {
            setAnimatedVideoOutputs(prev => [...prev, video]);
        }, index * 150); // Stagger by 150ms
    });

    // Cleanup timeouts on unmount or if videoOutputs changes again
    return () => {
        timeouts.forEach(clearTimeout);
    };
  }, [paginatedVideos]);

  if (videoOutputs.length === 0) {
    return null;
  }

  return (
    <>
      {lightboxIndex !== null && videoOutputs[lightboxIndex] && (
        <VideoLightbox
          video={videoOutputs[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Output Videos</CardTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Generated videos for this shot.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedVideos.map((video) => {
              const isVisible = animatedVideoOutputs.some(v => v.id === video.id);
              if (!isVisible) {
                return (
                  <Skeleton
                    key={video.id}
                    className="w-full aspect-video rounded-lg bg-muted/40"
                  />
                );
              }
              return (
                <div key={video.id} className="animate-in fade-in zoom-in-95 duration-500 ease-out">
                  <VideoOutputItem
                    video={video}
                    onDoubleClick={() => {
                      const originalIndex = videoOutputs.findIndex(v => v.id === video.id);
                      setLightboxIndex(originalIndex);
                    }}
                    onDelete={onDelete}
                    isDeleting={deletingVideoId === video.id}
                  />
                </div>
              );
            })}
          </div>
          {pageCount > 1 && (
            <Pagination className="mt-8">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    href="#" 
                    onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(p - 1, 1)); }} 
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                    size="default"
                  />
                </PaginationItem>
                
                <PaginationItem>
                  <PaginationLink href="#" isActive size="default">
                    Page {currentPage} of {pageCount}
                  </PaginationLink>
                </PaginationItem>

                <PaginationItem>
                  <PaginationNext 
                    href="#" 
                    onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(p + 1, pageCount)); }}
                    className={currentPage === pageCount ? "pointer-events-none opacity-50" : undefined}
                    size="default"
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default VideoOutputsGallery; 