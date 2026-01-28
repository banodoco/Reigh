/**
 * LineageGifModal
 *
 * Modal component that displays a generated GIF showing the lineage
 * progression from oldest ancestor to newest generation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Progress } from '@/shared/components/ui/progress';
import { useLineageChain } from '@/shared/hooks/useLineageChain';
import {
  createLineageGif,
  downloadBlob,
  type CreateGifProgress,
} from '@/shared/utils/createLineageGif';

interface LineageGifModalProps {
  open: boolean;
  onClose: () => void;
  variantId: string | null;
}

type ModalState =
  | { status: 'idle' }
  | { status: 'loading-chain' }
  | { status: 'generating'; progress: CreateGifProgress }
  | { status: 'complete'; gifUrl: string; blob: Blob }
  | { status: 'error'; message: string };

export const LineageGifModal: React.FC<LineageGifModalProps> = ({
  open,
  onClose,
  variantId,
}) => {
  const [state, setState] = useState<ModalState>({ status: 'idle' });
  const gifUrlRef = useRef<string | null>(null);
  const isGeneratingRef = useRef(false);

  // Fetch the lineage chain
  const { chain, isLoading: isChainLoading, hasLineage, error: chainError } = useLineageChain(
    open ? variantId : null
  );

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (gifUrlRef.current) {
        URL.revokeObjectURL(gifUrlRef.current);
        gifUrlRef.current = null;
      }
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setState({ status: 'idle' });
      isGeneratingRef.current = false;
      if (gifUrlRef.current) {
        URL.revokeObjectURL(gifUrlRef.current);
        gifUrlRef.current = null;
      }
    }
  }, [open]);

  // Generate GIF when chain is loaded
  useEffect(() => {
    if (!open) return;

    if (isChainLoading) {
      setState({ status: 'loading-chain' });
      return;
    }

    if (chainError) {
      setState({ status: 'error', message: chainError.message });
      return;
    }

    if (!hasLineage || chain.length < 2) {
      setState({ status: 'error', message: 'No lineage found for this image' });
      return;
    }

    // Prevent duplicate generation
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    // Start generating GIF
    const generateGif = async () => {
      try {
        const imageUrls = chain.map((item) => item.imageUrl);

        const blob = await createLineageGif(imageUrls, { frameDelay: 800 }, (progress) => {
          setState({ status: 'generating', progress });
        });

        // Create object URL for display
        const url = URL.createObjectURL(blob);
        if (gifUrlRef.current) {
          URL.revokeObjectURL(gifUrlRef.current);
        }
        gifUrlRef.current = url;

        setState({ status: 'complete', gifUrl: url, blob });
      } catch (err) {
        console.error('[LineageGifModal] Error generating GIF:', err);
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to generate GIF',
        });
        isGeneratingRef.current = false;
      }
    };

    generateGif();
  }, [open, chain, isChainLoading, chainError, hasLineage]);

  const handleDownload = () => {
    if (state.status === 'complete') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(state.blob, `lineage-${timestamp}.gif`);
    }
  };

  const renderContent = () => {
    switch (state.status) {
      case 'idle':
      case 'loading-chain':
        return (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading lineage...</p>
          </div>
        );

      case 'generating':
        const { progress } = state;
        const percentage =
          progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

        return (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <div className="w-full max-w-xs space-y-2">
              <Progress value={percentage} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{progress.message}</p>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="relative rounded-lg overflow-hidden bg-black/20 border border-border">
              <img
                src={state.gifUrl}
                alt="Lineage progression"
                className="max-w-full max-h-[60vh] object-contain"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {chain.length} images · Showing progression from oldest to newest
            </p>
            <Button onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" />
              Download GIF
            </Button>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">{state.message}</p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Lineage GIF
          </DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};

export default LineageGifModal;
