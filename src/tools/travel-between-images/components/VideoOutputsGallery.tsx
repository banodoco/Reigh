import React, { useState, useMemo } from "react";
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

interface VideoOutputsGalleryProps {
  videoOutputs: GenerationRow[];
  onDelete: (generationId: string) => void;
  deletingVideoId: string | null;
  onApplySettings?: (settings: {
    prompt?: string;
    prompts?: string[];
    negativePrompt?: string;
    negativePrompts?: string[];
    steps?: number;
    frame?: number;
    frames?: number[];
    context?: number;
    contexts?: number[];
    width?: number;
    height?: number;
    replaceImages?: boolean;
    inputImages?: string[];
  }) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onImageSaved?: (newImageUrl: string) => void;
}

const VideoOutputsGallery: React.FC<VideoOutputsGalleryProps> = ({ videoOutputs, onDelete, deletingVideoId, onApplySettings, onApplySettingsFromTask, onImageSaved }) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const videosPerPage = 6;

  /**
   * NOTE: We previously used a map of setTimeout callbacks (one per video
   * output) to create a staggered fade-in effect. Chrome surfaced this as
   * '[Violation] "setTimeout" handler took <N> ms' warnings because mounting
   * each <VideoOutputItem/>—especially when videos are heavy—can take 50 ms+
   * of main-thread time, and running that work inside a timer blocks the event
   * loop.
   *
   * The animation is now fully delegated to CSS.  We still want the items to
   * fade & zoom in sequentially, so we pass `animationDelay` based on the
   * list index.  No JavaScript timers are needed and the main thread remains
   * free, eliminating the warning.
   */
  // Removed animatedVideoOutputs state – we now render everything immediately.

  // Helper to get a comparable timestamp from the GenerationRow.
  // Accepts both camelCase (createdAt) and snake_case (created_at).
  const getCreatedTime = (g: GenerationRow & { created_at?: string }) => {
    const dateStr = g.createdAt ?? g.created_at;
    return dateStr ? new Date(dateStr).getTime() : 0;
  };

  // Sort videos by creation date (newest first). We fall back gracefully when
  // the timestamp is missing so the array order remains stable.
  const sortedVideoOutputs = useMemo(() => {
    return [...videoOutputs].sort((a, b) => getCreatedTime(b) - getCreatedTime(a));
  }, [videoOutputs]);

  // Pagination logic
  const pageCount = Math.ceil(sortedVideoOutputs.length / videosPerPage);
  const paginatedVideos = useMemo(() => {
    const startIndex = (currentPage - 1) * videosPerPage;
    const endIndex = startIndex + videosPerPage;
    return sortedVideoOutputs.slice(startIndex, endIndex);
  }, [sortedVideoOutputs, currentPage]);

  if (sortedVideoOutputs.length === 0) {
    return null;
  }

  return (
    <>
      {lightboxIndex !== null && sortedVideoOutputs[lightboxIndex] && (
        <VideoLightbox
          video={sortedVideoOutputs[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onImageSaved={onImageSaved}
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
            {paginatedVideos.map((video, index) => (
              <div
                key={video.id}
                className="animate-in fade-in duration-300 ease-out"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <VideoOutputItem
                  video={video}
                  onDoubleClick={() => {
                    const originalIndex = sortedVideoOutputs.findIndex(v => v.id === video.id);
                    setLightboxIndex(originalIndex);
                  }}
                  onDelete={onDelete}
                  isDeleting={deletingVideoId === video.id}
                  onApplySettings={onApplySettings}
                  onApplySettingsFromTask={onApplySettingsFromTask}
                />
              </div>
            ))}
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