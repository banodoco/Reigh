import React, { useState, useEffect } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Image, LayoutGrid, Upload } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { InlineEditView } from '../components/InlineEditView';
import { useGenerations } from '@/shared/hooks/useGenerations';
import ImageGallery from '@/shared/components/ImageGallery';
import { useListShots } from '@/shared/hooks/useShots';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';

export default function EditImagesPage() {
  const { selectedProjectId } = useProject();
  const [selectedMedia, setSelectedMedia] = useState<GenerationRow | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isMobile = useIsMobile();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!selectedProjectId) {
      toast.error("Please select a project first");
      return;
    }

    setIsUploading(true);
    try {
      const file = files[0];
      const publicUrl = await uploadImageToStorage(file, 3);

      const { data: generation, error: dbError } = await supabase
        .from('generations')
        .insert({
          project_id: selectedProjectId,
          location: publicUrl,
          type: 'image',
          params: {
            prompt: 'Uploaded image',
            status: 'completed',
            is_uploaded: true,
            width: 1024,
            height: 1024,
            model: 'upload'
          }
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setSelectedMedia(generation as any);
      // Toast removed as per user request

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col">
      {!selectedMedia ? (
        <div className="w-full h-full flex flex-col md:flex-row bg-transparent">
          {/* Left Panel - Placeholder */}
          <div 
            className="relative flex items-center justify-center bg-zinc-900/50 w-full h-[40%] md:w-[60%] md:h-full md:flex-1 rounded-b-xl md:rounded-b-none md:rounded-l-xl overflow-hidden"
          >
             <div className="flex flex-col items-center justify-center space-y-6 p-8">
                <div className="text-center space-y-2 max-w-md">
                  <h1 className="text-3xl font-light tracking-tight text-white">Edit Images</h1>
                  <p className="text-white/90">
                    Select an image from the right or upload a new one to start editing.
                  </p>
                </div>

                <div className="relative w-full max-w-xs">
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                  <Button variant="outline" size="lg" className="w-full gap-2 bg-black/50 text-white border-white/20 hover:bg-white/10" disabled={isUploading}>
                    <Upload className="w-4 h-4" />
                    {isUploading ? "Uploading..." : "Upload Image"}
                  </Button>
                </div>
             </div>
          </div>

          {/* Right Panel - Selection UI */}
          <div 
            className={cn(
              "bg-background border-t md:border-t-0 md:border-l border-border overflow-hidden relative z-[60] flex flex-col w-full h-[60%] md:w-[40%] md:h-full rounded-t-xl md:rounded-none md:rounded-r-xl"
            )}
          >
             <ImageSelectionModal 
               onSelect={(media) => setSelectedMedia(media)} 
             />
          </div>
        </div>
      ) : (
        <div className="flex-1 relative flex flex-col overflow-hidden">
          <div className="flex-1 relative overflow-hidden bg-transparent">
             <InlineEditView 
               media={selectedMedia} 
               onClose={() => setSelectedMedia(null)}
               onImageSaved={async (newUrl, createNew) => {
                  console.log("Image saved:", newUrl, createNew);
               }}
               onNavigateToGeneration={async (generationId) => {
                  try {
                    const { data, error } = await supabase
                      .from('generations')
                      .select('*')
                      .eq('id', generationId)
                      .single();
                    
                    if (data && !error) {
                      setSelectedMedia(data as any);
                    }
                  } catch (e) {
                    console.error("Failed to navigate to generation", e);
                  }
               }}
             />
          </div>
        </div>
      )}
    </div>
  );
}

function ImageSelectionModal({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  const { selectedProjectId } = useProject();
  const [activeTab, setActiveTab] = useState("gallery");
  const [shotFilter, setShotFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: shots } = useListShots(selectedProjectId);
  const isMobile = useIsMobile();
  const itemsPerPage = 15;
  
  const {
    data: generationsData,
    isLoading: isGalleryLoading,
  } = useGenerations(
    selectedProjectId || null,
    currentPage,
    itemsPerPage,
    true,
    {
      shotId: shotFilter === 'all' ? undefined : shotFilter,
      searchTerm: searchTerm.trim() || undefined
    } 
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [shotFilter, searchTerm]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-2 border-b">
        <TabsList className="w-full justify-start bg-transparent p-0 h-auto gap-6">
          <TabsTrigger 
            value="gallery" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3"
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            All Images
          </TabsTrigger>
          <TabsTrigger 
            value="shots" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3"
          >
            <Image className="w-4 h-4 mr-2" />
            Shots
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="gallery" className="flex-1 overflow-y-auto p-0 m-0 h-full relative pt-4">
         <ImageGallery 
            images={generationsData?.items || []}
            isLoading={isGalleryLoading}
            onImageClick={(media) => onSelect(media as any)}
            allShots={shots || []}
            showShotFilter={true}
            initialShotFilter={shotFilter}
            onShotFilterChange={setShotFilter}
            showSearch={true}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            itemsPerPage={itemsPerPage}
            offset={(currentPage - 1) * itemsPerPage}
            totalCount={generationsData?.total || 0}
            onServerPageChange={setCurrentPage}
            serverPage={currentPage}
            showDelete={false}
            showDownload={false}
            showShare={false}
            showEdit={false}
            showStar={false}
            showAddToShot={false}
            enableSingleClick={true}
            hideBottomPagination={true}
         />
      </TabsContent>

      <TabsContent value="shots" className="flex-1 overflow-y-auto p-4 m-0">
        <ShotsView onSelect={onSelect} />
      </TabsContent>
    </Tabs>
  );
}

function ShotsView({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading } = useListShots(selectedProjectId);
  
  if (isLoading) return <ReighLoading />;

  return (
    <div className="space-y-8">
      {shots?.map((shot) => (
        <div key={shot.id} className="space-y-3">
           <h3 className="font-medium text-lg flex items-center gap-2">
             {shot.name}
             <span className="text-xs text-muted-foreground font-normal">({shot.images?.length || 0} items)</span>
           </h3>
           <ShotImagesRow images={shot.images} onSelect={onSelect} />
        </div>
      ))}
      {(!shots || shots.length === 0) && (
         <div className="text-center py-10 text-muted-foreground">No shots found.</div>
      )}
    </div>
  );
}

function ShotImagesRow({ images, onSelect }: { images: any[], onSelect: (media: GenerationRow) => void }) {
  if (!images || images.length === 0) return <div className="text-xs text-muted-foreground italic pl-2">No images in shot</div>;

  return (
      <div className="flex gap-3 overflow-x-auto pb-4">
          {images.map(img => (
              <div 
                key={img.id} 
                className="w-32 h-32 flex-shrink-0 relative cursor-pointer rounded overflow-hidden border border-border/50 hover:border-primary"
                onClick={() => onSelect(img)}
              >
                  <img src={img.imageUrl || img.url || img.location} className="w-full h-full object-cover" alt="" />
              </div>
          ))}
      </div>
  );
}
