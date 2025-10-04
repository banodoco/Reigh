import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Upload, Dice5, AlertCircle, Film } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { CharacterAnimateSettings } from '../settings';
import { PageFadeIn } from '@/shared/components/transitions';

const CharacterAnimatePage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  
  // Local state for inputs
  const [characterImage, setCharacterImage] = useState<{ url: string; file?: File } | null>(null);
  const [motionVideo, setMotionVideo] = useState<{ url: string; file?: File } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<any[]>([]);
  
  const characterImageInputRef = useRef<HTMLInputElement>(null);
  const motionVideoInputRef = useRef<HTMLInputElement>(null);
  
  // Load settings
  const { settings, update: updateSettings } = useToolSettings<CharacterAnimateSettings>(
    'character-animate',
    { projectId: selectedProjectId || null, enabled: !!selectedProjectId }
  );
  
  // Initialize prompt from settings
  useEffect(() => {
    if (settings?.defaultPrompt) {
      setPrompt(settings.defaultPrompt);
    }
  }, [settings?.defaultPrompt]);
  
  // Load saved input image and video from settings
  useEffect(() => {
    if (settings?.inputImageUrl && !characterImage) {
      setCharacterImage({ url: settings.inputImageUrl });
    }
    if (settings?.inputVideoUrl && !motionVideo) {
      setMotionVideo({ url: settings.inputVideoUrl });
    }
  }, [settings?.inputImageUrl, settings?.inputVideoUrl]);
  
  // Generate new seed
  const generateNewSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 1000000);
    if (selectedProjectId) {
      updateSettings('project', { ...settings, seed: newSeed, randomSeed: false });
    }
  }, [selectedProjectId, settings, updateSettings]);
  
  // Initialize seed if needed
  useEffect(() => {
    if (settings?.randomSeed && !settings?.seed && selectedProjectId) {
      generateNewSeed();
    }
  }, [settings?.randomSeed, settings?.seed, selectedProjectId, generateNewSeed]);
  
  // Handle character image upload
  const handleCharacterImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
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
      // Upload to Supabase storage
      const uploadedUrl = await uploadImageToStorage(file);
      
      setCharacterImage({ url: uploadedUrl, file });
      
      // Save URL to project settings for persistence
      if (selectedProjectId) {
        updateSettings('project', { ...settings, inputImageUrl: uploadedUrl });
      }
      
      toast({
        title: 'Image uploaded',
        description: 'Your character image has been saved',
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle motion video selection
  const handleMotionVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    try {
      // Upload video to Supabase storage
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `character-animate/${selectedProjectId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('image_uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) throw error;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(fileName);
      
      setMotionVideo({ url: publicUrl, file });
      
      // Save URL to project settings for persistence
      if (selectedProjectId) {
        updateSettings('project', { ...settings, inputVideoUrl: publicUrl });
      }
      
      toast({
        title: 'Video uploaded',
        description: 'Your motion video has been saved',
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload video',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Generate animation mutation
  const generateAnimationMutation = useMutation({
    mutationFn: async () => {
      if (!characterImage) throw new Error('No character image');
      if (!motionVideo) throw new Error('No motion video');
      
      // TODO: Implement actual API call to Wan2.2-Animate
      const response = await fetch('/api/generate-character-animation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterImageUrl: characterImage.url,
          motionVideoUrl: motionVideo.url,
          prompt: prompt || settings?.defaultPrompt,
          mode: settings?.mode || 'animate',
          resolution: settings?.resolution || '720p',
          seed: settings?.seed,
        }),
      });
      
      if (!response.ok) throw new Error('Generation failed');
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedResults(prev => [...prev, data]);
      toast({
        title: 'Animation generated',
        description: 'Your character animation is ready',
      });
      
      if (settings?.randomSeed) {
        generateNewSeed();
      }
    },
    onError: (error) => {
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
    
    if (!motionVideo) {
      toast({
        title: 'Missing motion video',
        description: 'Please select a motion video',
        variant: 'destructive',
      });
      return;
    }
    
    generateAnimationMutation.mutate();
  };
  
  if (!selectedProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a project first.</p>
      </div>
    );
  }

  return (
    <PageFadeIn>
      <div className="flex flex-col space-y-6 pb-16 px-4 max-w-7xl mx-auto pt-6">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Character Animate</h1>
        
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
              {motionVideo ? (
                <video
                  src={motionVideo.url}
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
            {motionVideo && (
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
            />
          </div>

          {/* Mode & Resolution in one row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mode Selection */}
            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="flex space-x-2">
                <Button
                  variant={settings?.mode === 'replace' ? 'default' : 'outline'}
                  onClick={() => updateSettings('project', { ...settings, mode: 'replace' })}
                  className="flex-1"
                >
                  Replace
                </Button>
                <Button
                  variant={settings?.mode === 'animate' ? 'default' : 'outline'}
                  onClick={() => updateSettings('project', { ...settings, mode: 'animate' })}
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
                  variant={settings?.resolution === '480p' ? 'default' : 'outline'}
                  onClick={() => updateSettings('project', { ...settings, resolution: '480p' })}
                  className="flex-1"
                >
                  480p
                </Button>
                <Button
                  variant={settings?.resolution === '720p' ? 'default' : 'outline'}
                  onClick={() => updateSettings('project', { ...settings, resolution: '720p' })}
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
                value={settings?.seed || ''}
                onChange={(e) => updateSettings('project', { ...settings, seed: parseInt(e.target.value) || undefined, randomSeed: false })}
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
                  checked={settings?.randomSeed || false}
                  onChange={(e) => updateSettings('project', { ...settings, randomSeed: e.target.checked })}
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
          disabled={!characterImage || !motionVideo || generateAnimationMutation.isPending}
          className="w-full"
          size="lg"
        >
          {generateAnimationMutation.isPending ? 'Generating...' : 'Generate'}
        </Button>

        {/* Results Gallery */}
        {generatedResults.length > 0 && (
          <div className="space-y-4 pt-4">
            <h2 className="text-xl font-medium">
              Results ({generatedResults.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {generatedResults.map((result, index) => (
                <div key={index} className="border border-border rounded-lg overflow-hidden bg-card hover:border-primary transition-colors">
                  <video
                    src={result.url}
                    controls
                    className="w-full aspect-video object-cover bg-black"
                  />
                  <div className="p-3 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {result.seed && `Seed: ${result.seed}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date().toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageFadeIn>
  );
};

export default CharacterAnimatePage;

