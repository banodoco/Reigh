import React, { useState } from 'react';
import { Download } from 'lucide-react'; // Import Download icon
import { Button } from "./button"; // Updated
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "./tooltip"; // Updated
import { useToast } from "@/shared/hooks/use-toast"; // Updated
import { usePanes } from "@/shared/contexts/PanesContext"; // Added


interface FullscreenImageModalProps {
  imageUrl: string | null;
  imageAlt?: string; // Optional alt text
  imageId?: string; // Optional image ID for download filename
  onClose: () => void;
}

const FullscreenImageModal: React.FC<FullscreenImageModalProps> = ({ imageUrl, imageAlt, imageId, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false); // State for download button loading
  const { toast } = useToast(); // Initialize useToast
  
  // Get pane state for positioning adjustments
  const { 
    isTasksPaneLocked, 
    tasksPaneWidth, 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();

  if (!imageUrl) return null;

  const downloadFileName = `artful_pane_craft_fullscreen_${imageId || 'image'}_${Date.now()}.png`;

  const handleDownloadClick = async () => {
    if (!imageUrl) return;
    setIsDownloading(true);

    try {
      // Use XMLHttpRequest instead of fetch for better compatibility with Supabase storage URLs
      const xhr = new XMLHttpRequest();
      xhr.open('GET', imageUrl, true);
      xhr.responseType = 'blob';

      xhr.onload = function() {
        if (this.status === 200) {
          const blob = new Blob([this.response], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = downloadFileName;
          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
          // toast({ title: "Download Started", description: downloadFileName });
        } else {
          throw new Error(`Failed to fetch image: ${this.status} ${this.statusText}`);
        }
      };

      xhr.onerror = function() {
        throw new Error('Network request failed');
      };

      xhr.send();
    } catch (error) {
      console.error("Error downloading image:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({ 
        title: "Download Failed", 
        description: `Could not download ${downloadFileName}. ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Calculate positioning adjustments for locked panes
  const modalStyle = {
    left: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    right: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    bottom: isGenerationsPaneLocked ? `${generationsPaneHeight}px` : '0px',
    top: '0px',
    transition: 'left 300ms ease-in-out, right 300ms ease-in-out, bottom 300ms ease-in-out',
  };

  return (
    <TooltipProvider>
      <div
        className="fixed z-50 flex items-center justify-center bg-black bg-opacity-75 transition-opacity duration-300 ease-in-out"
        style={modalStyle}
        onClick={onClose} // Close on backdrop click
      >
        <div
          className="relative p-4 bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-fadeIn"
          onClick={(e) => e.stopPropagation()} // Prevent modal close when clicking on the image/modal content itself
        >
          <img
            src={imageUrl}
            alt={imageAlt || "Fullscreen view"}
            className="w-auto h-auto max-w-full max-h-[calc(85vh-40px)] object-contain rounded mb-2" // Adjusted max-h to make space for buttons
          />
          {/* Buttons container */}
          <div className="flex justify-between items-center mt-auto pt-2">
            {/* Download Button (Bottom Left) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-black/10 hover:bg-black/20 text-black"
                  onClick={handleDownloadClick}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-b-2 border-current"></div>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Download Image</p></TooltipContent>
            </Tooltip>

            {/* Close Button (Bottom Right) */}
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="bg-black/10 hover:bg-black/20 text-black"
              aria-label="Close image view"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default FullscreenImageModal;

// Basic fadeIn animation for the modal
// This should ideally be in your global CSS or a Tailwind plugin
const style = document.createElement('style');
style.innerHTML = `
  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.3s ease-out forwards;
  }
`;
document.head.appendChild(style); 