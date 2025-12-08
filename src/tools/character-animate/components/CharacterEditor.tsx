import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { ChevronLeft, ChevronRight, Upload, Dice5, AlertCircle, Film } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/lib/clientThumbnailGenerator';

interface CharacterEditorProps {
  shot: Shot;
  projectId: string;
  onBack: () => void;
  onPreviousCharacter?: () => void;
  onNextCharacter?: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onUpdateShotName: (newName: string) => void;
  settings: {
    mode: 'replace' | 'animate';
    resolution: '480p' | '720p';
    defaultPrompt: string;
    autoMatchAspectRatio: boolean;
    randomSeed: boolean;
    seed?: number;
  };
  onSettingsChange: (settings: Partial<CharacterEditorProps['settings']>) => void;
}

const CharacterEditor: React.FC<CharacterEditorProps> = ({
  shot,
  projectId,
  onBack,
  onPreviousCharacter,
  onNextCharacter,
  hasPrevious,
  hasNext,
  onUpdateShotName,
  settings,
  onSettingsChange,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Local state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(shot.name);
  const [prompt, setPrompt] = useState(settings.defaultPrompt);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedMotionVideo, setSelectedMotionVideo] = useState<{ url: string; file?: File } | null>(null);
  const characterImageInputRef = useRef<HTMLInputElement>(null);
  const motionVideoInputRef = useRef<HTMLInputElement>(null);

  // Get character image and motion videos from shot
  const characterImage = useMemo(() => {
    return shot.images?.find(img => !img.type?.includes('video'));
  }, [shot.images]);

  const generatedAnimations = useMemo(() => {
    return shot.images?.filter(img => img.type?.includes('video')) || [];
  }, [shot.images]);

  // Generate/regenerate seed
  const generateNewSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 1000000);
    onSettingsChange({ seed: newSeed, randomSeed: false });
  }, [onSettingsChange]);

  // Initialize seed if needed
  useEffect(() => {
    if (settings.randomSeed && !settings.seed) {
      generateNewSeed();
    }
  }, [settings.randomSeed, settings.seed, generateNewSeed]);

  // Handle character image upload
  const handleCharacterImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PNG or JPG image (avoid WEBP)',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      // Generate and upload thumbnail
      let url = '';
      let thumbnailUrl = '';
      
      try {
        // Get current user ID for storage path
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error('User not authenticated');
        }
        const userId = session.user.id;

        // Generate thumbnail client-side
        const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);
        console.log('[CharacterAnimate] Thumbnail generated:', {
          width: thumbnailResult.thumbnailWidth,
          height: thumbnailResult.thumbnailHeight,
          size: thumbnailResult.thumbnailBlob.size
        });
        
        // Upload both main image and thumbnail
        const uploadResult = await uploadImageWithThumbnail(file, thumbnailResult.thumbnailBlob, userId);
        url = uploadResult.imageUrl;
        thumbnailUrl = uploadResult.thumbnailUrl;
        
        console.log('[CharacterAnimate] Upload complete - Image:', url, 'Thumbnail:', thumbnailUrl);
      } catch (thumbnailError) {
        console.warn('[CharacterAnimate] Client-side thumbnail generation failed:', thumbnailError);
        // Fallback to original upload flow without thumbnail
        url = await uploadImageToStorage(file);
        thumbnailUrl = url; // Use main image as fallback
      }

      // Add to shot images
      const { error } = await supabase
        .from('generations')
        .insert({
          shot_id: shot.id,
          project_id: projectId,
          url: url,
          thumbnail_url: thumbnailUrl,
          type: 'upload',
          metadata: {
            filename: file.name,
            size: file.size,
            mimeType: file.type,
          },
        });

      if (error) throw error;

      // Invalidate queries to refresh
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });

      toast({
        title: 'Character image uploaded',
        description: 'Your character image has been added',
      });
    } catch (error) {
      console.error('Error uploading character image:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload character image',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (characterImageInputRef.current) {
        characterImageInputRef.current.value = '';
      }
    }
  };

  // Handle motion video selection
  const handleMotionVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return;
    }

    // Create preview URL
    const url = URL.createObjectURL(file);
    setSelectedMotionVideo({ url, file });
  };

  // Generate animation mutation
  const generateAnimationMutation = useMutation({
    mutationFn: async () => {
      if (!characterImage) {
        throw new Error('No character image selected');
      }
      if (!selectedMotionVideo) {
        throw new Error('No motion video selected');
      }

      // TODO: Implement actual API call to Wan2.2-Animate
      // For now, this is a placeholder structure
      const response = await fetch('/api/generate-character-animation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterImageUrl: characterImage.url,
          motionVideoUrl: selectedMotionVideo.url,
          prompt: prompt || settings.defaultPrompt,
          mode: settings.mode,
          resolution: settings.resolution,
          seed: settings.seed,
        }),
      });

      if (!response.ok) {
        throw new Error('Generation failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate and refetch shots
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      
      toast({
        title: 'Animation generated',
        description: 'Your character animation is ready',
      });

      // If random seed is enabled, generate a new one for next generation
      if (settings.randomSeed) {
        generateNewSeed();
      }
    },
    onError: (error) => {
      console.error('Error generating animation:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to generate animation',
        variant: 'destructive',
      });
    },
  });

  const handleGenerate = () => {
    if (!characterImage) {
      toast({
        title: 'Missing character image',
        description: 'Please upload a character image first',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedMotionVideo) {
      toast({
        title: 'Missing motion video',
        description: 'Please select a motion video',
        variant: 'destructive',
      });
      return;
    }

    generateAnimationMutation.mutate();
  };

  const handleNameSave = () => {
    if (editedName.trim() && editedName !== shot.name) {
      onUpdateShotName(editedName.trim());
    }
    setIsEditingName(false);
  };

  // Check if aspect ratios match (simplified check)
  const aspectRatiosMatch = useMemo(() => {
    // This is a placeholder - would need actual dimension checking
    return true;
  }, [characterImage, selectedMotionVideo]);

  return (
    <div className="flex flex-col space-y-6 pb-4 px-4 max-w-7xl mx-auto">
      {/* Header with navigation */}
      <div className="flex items-center justify-between py-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Characters
        </Button>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPreviousCharacter}
            disabled={!hasPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {isEditingName ? (
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') {
                  setEditedName(shot.name);
                  setIsEditingName(false);
                }
              }}
              className="text-xl font-semibold text-center max-w-xs"
              autoFocus
            />
          ) : (
            <h1
              className="text-xl font-semibold cursor-pointer hover:text-primary transition-colors"
              onClick={() => setIsEditingName(true)}
            >
              {shot.name}
            </h1>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onNextCharacter}
            disabled={!hasNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-32" /> {/* Spacer for balance */}
      </div>

      {/* Input Image | Input Video */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Character Image */}
        <div className="space-y-3">
          <Label className="text-lg font-medium">Input Image</Label>
          <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
            {characterImage ? (
              <img
                src={characterImage.url}
                alt="Character"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-6">
                <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No input image</p>
                <Button
                  onClick={() => characterImageInputRef.current?.click()}
                  disabled={isUploading}
                  size="sm"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Image
                </Button>
              </div>
            )}
          </div>
          <input
            ref={characterImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="hidden"
            onChange={handleCharacterImageUpload}
          />
          {characterImage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => characterImageInputRef.current?.click()}
              disabled={isUploading}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Replace Image
            </Button>
          )}
        </div>

        {/* Motion Video */}
        <div className="space-y-3">
          <Label className="text-lg font-medium">Input Video</Label>
          <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
            {selectedMotionVideo ? (
              <video
                src={selectedMotionVideo.url}
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-6">
                <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No input video</p>
                <Button
                  onClick={() => motionVideoInputRef.current?.click()}
                  size="sm"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Video
                </Button>
              </div>
            )}
          </div>
          <input
            ref={motionVideoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleMotionVideoSelect}
          />
          {selectedMotionVideo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => motionVideoInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Replace Video
            </Button>
          )}
        </div>
      </div>

      {/* Aspect ratio warning */}
      {!aspectRatiosMatch && characterImage && selectedMotionVideo && (
        <div className="flex items-start space-x-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-600">Aspect ratios don't match</p>
            <p className="text-yellow-600/80 mt-1">
              Using the same aspect ratio for the input image and video produces best results.
            </p>
          </div>
        </div>
      )}

      {/* Settings Section */}
      <div className="space-y-5">
        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt (Optional)</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Brief rules, e.g., preserve outfit; natural expression; no background changes"
            rows={2}
            className="resize-none"
            clearable
            onClear={() => setPrompt('')}
            voiceInput
            voiceContext="This is a prompt for character animation. Provide brief rules or guidance like 'preserve outfit', 'natural expression', 'no background changes'. Keep it concise."
            onVoiceResult={(result) => {
              setPrompt(result.prompt || result.transcription);
            }}
          />
        </div>

        {/* Mode & Resolution in one row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Mode Selection */}
          <div className="space-y-2">
            <Label>Mode</Label>
            <div className="flex space-x-2">
              <Button
                variant={settings.mode === 'replace' ? 'default' : 'outline'}
                onClick={() => onSettingsChange({ mode: 'replace' })}
                className="flex-1"
              >
                Replace
              </Button>
              <Button
                variant={settings.mode === 'animate' ? 'default' : 'outline'}
                onClick={() => onSettingsChange({ mode: 'animate' })}
                className="flex-1"
              >
                Animate
              </Button>
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-2">
            <Label>Resolution</Label>
            <div className="flex space-x-2">
              <Button
                variant={settings.resolution === '480p' ? 'default' : 'outline'}
                onClick={() => onSettingsChange({ resolution: '480p' })}
                className="flex-1"
              >
                480p
              </Button>
              <Button
                variant={settings.resolution === '720p' ? 'default' : 'outline'}
                onClick={() => onSettingsChange({ resolution: '720p' })}
                className="flex-1"
              >
                720p
              </Button>
            </div>
          </div>
        </div>

        {/* Seed Control */}
        <div className="space-y-2">
          <Label htmlFor="seed">Seed</Label>
          <div className="flex items-center space-x-2">
            <Input
              id="seed"
              type="number"
              value={settings.seed || ''}
              onChange={(e) => onSettingsChange({ seed: parseInt(e.target.value) || undefined, randomSeed: false })}
              placeholder="Random"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={generateNewSeed}
              title="Generate new random seed"
            >
              <Dice5 className="h-4 w-4" />
            </Button>
            <div className="flex items-center space-x-2 pl-2">
              <input
                type="checkbox"
                id="randomSeed"
                checked={settings.randomSeed}
                onChange={(e) => onSettingsChange({ randomSeed: e.target.checked })}
                className="rounded border-border"
              />
              <Label htmlFor="randomSeed" className="text-sm font-normal cursor-pointer whitespace-nowrap">
                Random each time
              </Label>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={!characterImage || !selectedMotionVideo || generateAnimationMutation.isPending}
        className="w-full"
        size="lg"
      >
        {generateAnimationMutation.isPending ? 'Generating...' : 'Generate'}
      </Button>

      {/* Results Gallery */}
      {generatedAnimations.length > 0 && (
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-medium">
            Results ({generatedAnimations.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {generatedAnimations.map((animation) => (
              <div key={animation.id} className="border border-border rounded-lg overflow-hidden bg-card hover:border-primary transition-colors">
                <video
                  src={animation.url}
                  controls
                  className="w-full aspect-video object-cover bg-black"
                />
                <div className="p-3 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {animation.metadata?.seed && `Seed: ${animation.metadata.seed}`}
                  </p>
                  {animation.created_at && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(animation.created_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterEditor;

