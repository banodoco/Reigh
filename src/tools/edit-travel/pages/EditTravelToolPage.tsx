import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import FileInput from "@/shared/components/FileInput";
import ImageGallery, { GeneratedImageWithMetadata, DisplayableMetadata } from "@/shared/components/ImageGallery";
import SettingsModal from "@/shared/components/SettingsModal";
import { PromptEntry } from "@/tools/image-generation/components/ImageGenerationForm";
import PromptEditorModal from "@/shared/components/PromptEditorModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ShotsPane from "@/shared/components/ShotsPane/ShotsPane";
import { useListShots, useAddImageToShot } from "@/shared/hooks/useShots";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { nanoid } from "nanoid";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { AlertTriangle, Wand2 } from "lucide-react";
import { fileToDataURL, dataURLtoFile } from "@/shared/lib/utils";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { useFalImageGeneration, FalImageGenerationParams, initializeGlobalFalClient as initializeHookFalClient } from "@/shared/hooks/useFalImageGeneration";
import { Slider } from "@/shared/components/ui/slider";
import { saveReconstructedVideo, reconstructVideoClientSide, extractAudio } from "@/shared/lib/videoReconstructionUtils"; // <-- MODIFIED IMPORT
import { useProject } from "@/shared/contexts/ProjectContext"; // Import useProject
import { uploadImageToStorage } from '@/shared/lib/imageUploader'; // For input file
import { useQueryClient } from "@tanstack/react-query"; // <-- ADDED IMPORT

// Local definition for Json type to remove dependency on supabase client types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Helper function for aspect ratio calculation
const gcd = (a: number, b: number): number => {
  if (b === 0) {
    return a;
  }
  return gcd(b, a % b);
};

const EDIT_TRAVEL_INPUT_FILE_KEY = 'editTravelInputFile';
const EDIT_TRAVEL_PROMPTS_KEY = 'editTravelPrompts';
const EDIT_TRAVEL_IMAGES_PER_PROMPT_KEY = 'editTravelImagesPerPrompt';
const EDIT_TRAVEL_GENERATION_MODE_KEY = 'editTravelGenerationMode';
const MAX_LOCAL_STORAGE_ITEM_LENGTH = 4 * 1024 * 1024; // Approx 4MB in characters

const EDIT_TRAVEL_FLUX_SOFT_EDGE_STRENGTH_KEY = 'editTravelFluxSoftEdgeStrength';
const EDIT_TRAVEL_FLUX_DEPTH_STRENGTH_KEY = 'editTravelFluxDepthStrength';
const EDIT_TRAVEL_RECONSTRUCT_VIDEO_KEY = 'editTravelReconstructVideo';

const VALID_ASPECT_RATIOS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];

// Helper function to parse "W:H" string to a numerical ratio W/H
const parseRatio = (ratioStr: string): number => {
  const parts = ratioStr.split(':');
  if (parts.length === 2) {
    const w = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    if (!isNaN(w) && !isNaN(h) && h !== 0) {
      return w / h;
    }
  }
  return NaN; // Return NaN for invalid formats or division by zero
};

const EditTravelToolPage = () => {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);
  
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [inputFilePreviewUrl, setInputFilePreviewUrl] = useState<string | null>(null);
  
  const [imagesPerPrompt, setImagesPerPrompt] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");

  const [generatedImages, setGeneratedImages] = useState<GeneratedImageWithMetadata[]>([]);
  const [isKontextGenerating, setIsKontextGenerating] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState(true);
  
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [reconstructVideo, setReconstructVideo] = useState<boolean>(true);
  
  const [falApiKey, setFalApiKey] = useState<string | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('');
  
  const [isClientSideReconstructing, setIsClientSideReconstructing] = useState(false);
  const [generationMode, setGenerationMode] = useState<'kontext' | 'flux'>('kontext');

  // New state for Flux mode strengths
  const [fluxSoftEdgeStrength, setFluxSoftEdgeStrength] = useState<number>(0.2);
  const [fluxDepthStrength, setFluxDepthStrength] = useState<number>(0.6);
  
  const kontextCancelGenerationRef = useRef(false);
  const kontextCurrentSubscriptionRef = useRef<any>(null);
  const reconstructionCancelRef = useRef(false); // <-- ADDED REF
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const { selectedProjectId } = useProject(); // Get selected project ID
  const queryClient = useQueryClient(); // <-- ADDED INSTANCE

  const { data: shots, isLoading: isLoadingShots, error: shotsError } = useListShots(selectedProjectId);
  const addImageToShotMutation = useAddImageToShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();

  const generatePromptId = useCallback(() => nanoid(), []);

  // Remove usage of useFalImageGeneration for the primary flow, as handleGenerate now creates tasks directly.
  // const { 
  //   isGenerating: isFluxGenerating, 
  //   generateImages: generateFluxImages, 
  //   cancelGeneration: cancelFluxGeneration 
  // } = useFalImageGeneration();

  // isOverallGenerating should now rely on isCreatingTask (for kontext-like behavior) or a similar state for flux if needed.
  // For simplicity, we can assume isCreatingTask now covers both when handleGenerate is active.
  // const isOverallGenerating = isKontextGenerating || isFluxGenerating;
  const isOverallGenerating = isCreatingTask; // Simplified: handleGenerate sets isCreatingTask
  // isKontextGenerating might also be replaced by isCreatingTask if appropriate

  const lorasForFlux = [
    { path: "Shakker-Labs/FLUX.1-dev-LoRA-add-details", scale: "0.78" },
    { path: "Shakker-Labs/FLUX.1-dev-LoRA-AntiBlur", scale: "0.43" },
    { path: "strangerzonehf/Flux-Super-Realism-LoRA", scale: "0.40" },
    { path: "kudzueye/boreal-flux-dev-v2", scale: "0.06" }
  ];

  useEffect(() => {
    const localFalApiKey = localStorage.getItem('fal_api_key');
    setFalApiKey(localFalApiKey);
    // initializeHookFalClient(); // REMOVE - Hook no longer uses/needs this global FAL client init
    const storedOpenaiKey = localStorage.getItem('openai_api_key') || "";
    setOpenaiApiKey(storedOpenaiKey);
    fetchGeneratedEdits(); // This will be updated

    // Load input file
    const savedFileRaw = localStorage.getItem(EDIT_TRAVEL_INPUT_FILE_KEY);
    if (savedFileRaw) {
      try {
        const savedFileData = JSON.parse(savedFileRaw);
        if (savedFileData && savedFileData.dataUrl && savedFileData.name && savedFileData.type &&
            (savedFileData.type.startsWith('image/') || savedFileData.type.startsWith('video/'))) {
          const restoredFile = dataURLtoFile(savedFileData.dataUrl, savedFileData.name, savedFileData.type);
          if (restoredFile) {
            setInputFile(restoredFile); 
          }
        } else if (savedFileData && savedFileData.type) {
            console.warn(`[EditTravelToolPage] Found incompatible saved file type '${savedFileData.type}' in localStorage. Removing.`);
            localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
        }
      } catch (error) {
        console.error("Error loading input file from localStorage:", error);
        localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
      }
    }

    // Load prompts
    const savedPromptsRaw = localStorage.getItem(EDIT_TRAVEL_PROMPTS_KEY);
    if (savedPromptsRaw) {
      try {
        const savedPrompts = JSON.parse(savedPromptsRaw);
        if (Array.isArray(savedPrompts)) {
          setPrompts(savedPrompts);
        }
      } catch (error) {
        console.error("Error loading prompts from localStorage:", error);
        localStorage.removeItem(EDIT_TRAVEL_PROMPTS_KEY);
      }
    }

    // Load images per prompt
    const savedImagesPerPrompt = localStorage.getItem(EDIT_TRAVEL_IMAGES_PER_PROMPT_KEY);
    if (savedImagesPerPrompt) {
      const num = parseInt(savedImagesPerPrompt, 10);
      if (!isNaN(num) && num >= 1) {
        setImagesPerPrompt(num);
      }
    }

    // Load generation mode
    const savedGenerationMode = localStorage.getItem(EDIT_TRAVEL_GENERATION_MODE_KEY);
    if (savedGenerationMode === 'kontext' || savedGenerationMode === 'flux') {
      setGenerationMode(savedGenerationMode);
    }

    // Load Flux strengths
    const savedFluxSoftEdgeStrength = localStorage.getItem(EDIT_TRAVEL_FLUX_SOFT_EDGE_STRENGTH_KEY);
    if (savedFluxSoftEdgeStrength) {
      const num = parseFloat(savedFluxSoftEdgeStrength);
      if (!isNaN(num) && num >= 0 && num <= 1) {
        setFluxSoftEdgeStrength(num);
      }
    }
    const savedFluxDepthStrength = localStorage.getItem(EDIT_TRAVEL_FLUX_DEPTH_STRENGTH_KEY);
    if (savedFluxDepthStrength) {
      const num = parseFloat(savedFluxDepthStrength);
      if (!isNaN(num) && num >= 0 && num <= 1) {
        setFluxDepthStrength(num);
      }
    }

    // Load Reconstruct Video setting
    const savedReconstructVideo = localStorage.getItem(EDIT_TRAVEL_RECONSTRUCT_VIDEO_KEY);
    if (savedReconstructVideo) {
      setReconstructVideo(savedReconstructVideo === 'true');
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]); // Add selectedProjectId to re-fetch edits when project changes

  useEffect(() => {
    let previewObjectUrl: string | null = null;
    if (inputFile) {
      previewObjectUrl = URL.createObjectURL(inputFile);
      setInputFilePreviewUrl(previewObjectUrl);
      setVideoDuration(null);
      // setReconstructVideo(false); // THIS LINE SHOULD BE COMMENTED OUT

      if (inputFile.type.startsWith('image/')) {
        const img = new Image();
        const imageLoadUrl = URL.createObjectURL(inputFile);
        img.onload = () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            const commonDivisor = gcd(img.naturalWidth, img.naturalHeight);
            const newAspectRatio = `${img.naturalWidth / commonDivisor}:${img.naturalHeight / commonDivisor}`;
            setAspectRatio(newAspectRatio);
            console.log(`[EditTravelToolPage_AspectRatio] Image aspect ratio set to: ${newAspectRatio}`);
          } else {
            console.warn("[EditTravelToolPage_AspectRatio] Image loaded but dimensions are zero, using previous or default aspect ratio.");
          }
          URL.revokeObjectURL(imageLoadUrl);
        };
        img.onerror = () => {
          console.error("[EditTravelToolPage_AspectRatio] Error loading image to determine aspect ratio.");
          toast.warning("Could not determine image aspect ratio. Using previous or default.");
          URL.revokeObjectURL(imageLoadUrl);
        };
        img.src = imageLoadUrl;
      } else if (inputFile.type.startsWith('video/')) {
        const video = document.createElement('video');
        const videoLoadUrl = URL.createObjectURL(inputFile);
        video.onloadedmetadata = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            const commonDivisor = gcd(video.videoWidth, video.videoHeight);
            const newAspectRatio = `${video.videoWidth / commonDivisor}:${video.videoHeight / commonDivisor}`;
            setAspectRatio(newAspectRatio);
            console.log(`[EditTravelToolPage_AspectRatio] Video aspect ratio set to: ${newAspectRatio}`);
            setVideoDuration(video.duration);
            console.log(`[EditTravelToolPage_VideoInfo] Video duration set to: ${video.duration}s`);
          } else {
            console.warn("[EditTravelToolPage_AspectRatio] Video metadata loaded but dimensions are zero, using previous or default aspect ratio.");
            setVideoDuration(null);
          }
          URL.revokeObjectURL(videoLoadUrl);
        };
        video.onerror = () => {
          console.error("[EditTravelToolPage_AspectRatio] Error loading video to determine aspect ratio and duration.");
          toast.warning("Could not determine video aspect ratio or duration. Using previous or default.");
          setVideoDuration(null);
          URL.revokeObjectURL(videoLoadUrl);
        };
        video.preload = 'metadata';
        video.src = videoLoadUrl;
      }
    } else {
      setInputFilePreviewUrl(null);
      setAspectRatio("1:1"); 
      setVideoDuration(null);
      // setReconstructVideo(false); // THIS LINE SHOULD BE COMMENTED OUT
      console.log("[EditTravelToolPage] inputFile is null. Resetting related states.");
    }

    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  }, [inputFile]);

  const fetchGeneratedEdits = async () => {
    if (!selectedProjectId) {
      // console.log("[EditTravelToolPage] No project selected, skipping fetch of generated edits."); // [VideoLoadSpeedIssue]
      setGeneratedImages([]); // Clear or set to placeholders
      setShowPlaceholders(true);
      return;
    }
    // console.log(`[EditTravelToolPage] Fetching edits for project: ${selectedProjectId}`); // [VideoLoadSpeedIssue]
    try {
      const { data, error } = await supabase
        .from('generations' as any) // Ensure 'as any' for problematic tables
        .select('id, image_url, prompt, seed, metadata, project_id, created_at') 
        .eq('project_id', selectedProjectId) 
        // Add a filter for toolType if you want to distinguish edit_travel generations
        // .eq('metadata->>toolType', 'edit_travel_kontext') // Or 'edit_travel_flux' or a general 'edit_travel'
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error fetching edits:', error); // [VideoLoadSpeedIssue]
        toast.error("Failed to load previously generated edits.");
        setGeneratedImages([]);
        setShowPlaceholders(true);
        return;
      }
      
      if (data && data.length > 0) {
        const dbImages: GeneratedImageWithMetadata[] = (data as any[]).map(record => {
          const metadata = (record.metadata || {}) as DisplayableMetadata;
          // Ensure toolType is part of metadata if needed for filtering/display
          return {
            id: record.id as string,
            url: record.image_url as string,
            prompt: record.prompt as string || metadata.prompt,
            seed: typeof record.seed === 'number' ? record.seed : (typeof metadata.seed === 'number' ? metadata.seed : undefined),
            metadata: { ...metadata, toolType: metadata.toolType || (generationMode === 'flux' ? 'edit_travel_flux' : 'edit_travel_kontext') },
            createdAt: record.created_at,
          };
        });
        setGeneratedImages(dbImages);
        setShowPlaceholders(false);
      } else {
        setGeneratedImages([]);
        setShowPlaceholders(true);
      }
    } catch (error) {
      console.error('Error fetching edits:', error); // [VideoLoadSpeedIssue]
      toast.error("An error occurred while fetching edits.");
        setGeneratedImages([]);
      setShowPlaceholders(true);
      }
  };
  
  const handleSaveApiKeys = (newFalApiKey: string, newOpenaiApiKey: string, _newReplicateApiKey: string) => {
    localStorage.setItem('fal_api_key', newFalApiKey);
    localStorage.setItem('openai_api_key', newOpenaiApiKey);
    // initializeHookFalClient(); // REMOVE - Hook no longer uses/needs this global FAL client init
    setFalApiKey(newFalApiKey);
    setOpenaiApiKey(newOpenaiApiKey);
    toast.success("API keys updated successfully");
  };

  const handleFileChange = (files: File[]) => {
    const file = files && files.length > 0 ? files[0] : null;
    setInputFile(file);
    if (file) {
      if (file.type.startsWith('image/')) {
        fileToDataURL(file)
          .then(dataUrl => {
            const itemToStore = { dataUrl, name: file.name, type: file.type };
            const itemString = JSON.stringify(itemToStore);
            if (itemString.length < MAX_LOCAL_STORAGE_ITEM_LENGTH) {
              localStorage.setItem(EDIT_TRAVEL_INPUT_FILE_KEY, itemString);
            } else {
              localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
              toast.info(`Image is too large (~${(itemString.length / (1024*1024)).toFixed(1)}MB) to be saved locally and won't persist.`);
            }
          })
          .catch(error => {
            console.error("Error saving input image to localStorage:", error);
            toast.error("Could not save input image locally.");
            localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
          });
      } else if (file.type.startsWith('video/')) {
        fileToDataURL(file)
          .then(dataUrl => {
            const itemToStore = { dataUrl, name: file.name, type: file.type };
            const itemString = JSON.stringify(itemToStore);
            const itemLength = itemString.length;

            if (itemLength < MAX_LOCAL_STORAGE_ITEM_LENGTH) {
              localStorage.setItem(EDIT_TRAVEL_INPUT_FILE_KEY, itemString);
              toast.info(`Video (~${(itemLength / (1024*1024)).toFixed(1)}MB) selected and saved locally. It should persist.`);
            } else {
              localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
              toast.info(`Video is too large (~${(itemLength / (1024*1024)).toFixed(1)}MB) to be saved locally and won't persist.`);
            }
          })
          .catch(error => {
            console.error("Error processing video for localStorage:", error);
            toast.error("Could not process video for local saving.");
            localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
          });
      }
    } else {
      localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
    }
  };

  const handleFileRemove = () => { 
    setInputFile(null); 
    localStorage.removeItem(EDIT_TRAVEL_INPUT_FILE_KEY);
  };

  const handleSavePrompts = (updatedPrompts: PromptEntry[]) => {
    setPrompts(updatedPrompts);
    // Persist to localStorage on explicit save from the modal
    try {
        const promptsString = JSON.stringify(updatedPrompts);
        if (promptsString.length < MAX_LOCAL_STORAGE_ITEM_LENGTH) {
            localStorage.setItem(EDIT_TRAVEL_PROMPTS_KEY, promptsString);
        } else {
            toast.info("Prompts are too large to be saved locally and won't persist.");
        }
    } catch (error) {
        console.error("Error saving prompts to localStorage from modal save:", error);
        toast.error("Could not save prompts locally.");
    }
  };
  
  const handleAutoSavePrompts = (updatedPrompts: PromptEntry[]) => {
    setPrompts(updatedPrompts);
    // Also persist to localStorage on auto-save from the modal
    try {
        const promptsString = JSON.stringify(updatedPrompts);
        if (promptsString.length < MAX_LOCAL_STORAGE_ITEM_LENGTH) {
            localStorage.setItem(EDIT_TRAVEL_PROMPTS_KEY, promptsString);
        } else {
            toast.info("Prompts are too large to be saved locally and may not persist fully.");
            // Potentially save a truncated version or handle differently
        }
    } catch (error) {
        console.error("Error auto-saving prompts to localStorage:", error);
        toast.error("Could not auto-save prompts locally.");
    }
  };

  useEffect(() => {
    if (imagesPerPrompt !== undefined && imagesPerPrompt >= 1) { // Check for initial undefined state
        try {
            localStorage.setItem(EDIT_TRAVEL_IMAGES_PER_PROMPT_KEY, imagesPerPrompt.toString());
        } catch (error) {
            console.error("Error saving imagesPerPrompt to localStorage:", error);
            toast.error("Could not save 'images per prompt' setting locally.");
        }
    }
  }, [imagesPerPrompt]);

  useEffect(() => {
    try {
        localStorage.setItem(EDIT_TRAVEL_GENERATION_MODE_KEY, generationMode);
    } catch (error) {
        console.error("Error saving generationMode to localStorage:", error);
        toast.error("Could not save 'generation mode' setting locally.");
    }
  }, [generationMode]);

  useEffect(() => {
    if (fluxSoftEdgeStrength !== undefined) {
        try {
            localStorage.setItem(EDIT_TRAVEL_FLUX_SOFT_EDGE_STRENGTH_KEY, fluxSoftEdgeStrength.toString());
        } catch (error) {
            console.error("Error saving fluxSoftEdgeStrength to localStorage:", error);
            toast.error("Could not save 'Flux Soft Edge Strength' setting locally.");
        }
    }
  }, [fluxSoftEdgeStrength]);

  useEffect(() => {
    if (fluxDepthStrength !== undefined) {
        try {
            localStorage.setItem(EDIT_TRAVEL_FLUX_DEPTH_STRENGTH_KEY, fluxDepthStrength.toString());
        } catch (error) {
            console.error("Error saving fluxDepthStrength to localStorage:", error);
            toast.error("Could not save 'Flux Depth Strength' setting locally.");
        }
    }
  }, [fluxDepthStrength]);

  useEffect(() => {
    if (reconstructVideo !== undefined) { // Check to avoid saving initial undefined state if any
        try {
            localStorage.setItem(EDIT_TRAVEL_RECONSTRUCT_VIDEO_KEY, reconstructVideo.toString());
        } catch (error) {
            console.error("Error saving reconstructVideo to localStorage:", error);
            toast.error("Could not save 'Reconstruct as video' setting locally.");
        }
    }
    // Explicitly return undefined to satisfy linter if it's confused
    return undefined;
  }, [reconstructVideo]);
  
  const handleGenerate = async () => {
    if (!selectedProjectId) {
      toast.error("No project selected. Please select a project first.");
      return;
    }
    if (!inputFile) {
      toast.error("Please select an input image or video.");
      return;
    }
    if (prompts.filter(p => p.fullPrompt.trim() !== "").length === 0) {
      toast.error("Please enter at least one prompt.");
      return;
    }
    // FAL API key check for 'kontext' mode - uses falApiKey state which is now set from localStorage
    if (generationMode === 'kontext' && !falApiKey) { 
        toast.error("FAL API Key is not set for Kontext. Please set it in the settings (top right gear icon).");
        setIsCreatingTask(false); // Reset creating task state
        return;
    }
    // Check for 'flux' mode FAL API key (though not directly calling FAL client here anymore for generation)
     if (generationMode === 'flux' && !localStorage.getItem('fal_api_key')) {
        toast.error("FAL API Key is not set for Flux. Please set it in the settings.");
        setIsCreatingTask(false); // Reset creating task state
        return;
    }

    // setIsKontextGenerating(true); // This was specific. isCreatingTask is now general.
    setIsCreatingTask(true); // Moved this to be set before API key checks for early exit
    kontextCancelGenerationRef.current = false;
    reconstructionCancelRef.current = false;

    let uploadedInputUrl: string | null = null;
    try {
      toast.info("Uploading input file...");
      uploadedInputUrl = await uploadImageToStorage(inputFile);
      if (!uploadedInputUrl) {
        toast.error("Input file upload failed. Please try again.");
        setIsCreatingTask(false);
        return;
      }
      toast.success("Input file uploaded!");
    } catch (uploadError: any) {
      console.error("[EditTravelToolPage] Error uploading input file:", uploadError); // [VideoLoadSpeedIssue]
      toast.error(`Failed to upload input file: ${uploadError.message || 'Unknown error'}`);
      setIsCreatingTask(false);
      return;
    }

    const activePrompts = prompts.filter(p => p.fullPrompt.trim() !== "");
    const commonTaskParams = {
      input_file_url: uploadedInputUrl,
      original_input_filename: inputFile.name,
      prompts: activePrompts.map(p => ({ id: p.id, fullPrompt: p.fullPrompt, shortPrompt: p.shortPrompt })),
      images_per_prompt: imagesPerPrompt,
      aspect_ratio: aspectRatio, // For Kontext or as a hint for Flux
      reconstruct_video: inputFile.type.startsWith('video/') && reconstructVideo, // Add video reconstruction flag
      // Fal specific (can be defaults or from form)
      // num_inference_steps, guidance_scale, etc.
    };

    let taskType: string;
    let specificParams: any;

    if (generationMode === 'kontext') {
      taskType = 'edit_travel_kontext';
      specificParams = {
        ...commonTaskParams,
        // Kontext specific params (if any beyond common ones)
        // e.g., model_id: "fal-ai/anydiffusion" (or similar if Kontext uses a specific one)
        // seed: // if kontext supports it directly in API
      };
    } else { // 'flux' mode
      taskType = 'edit_travel_flux';
      specificParams = {
        ...commonTaskParams,
        toolType: 'edit_travel_flux', // Match what useFalImageGeneration might have used for metadata
        imageSize: aspectRatio, // The hook maps this, worker should too
        loras: lorasForFlux, // Predefined LoRAs for Flux mode in this tool
                  depthStrength: fluxDepthStrength,
                  softEdgeStrength: fluxSoftEdgeStrength,
        // Add other FalImageGenerationParams if needed and available from form
        // falModelId: "fal-ai/flux-general",
      };
    }
    
    toast.info(`Creating '${generationMode}' generation task via API...`);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: selectedProjectId,
          task_type: taskType, 
          params: specificParams,
          status: 'Pending',
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const newTask = await response.json();

      if (newTask && newTask.id) {
        console.log(`[EditTravelToolPage] ${generationMode} task created via API:`, newTask);
        toast.success(`${generationMode.charAt(0).toUpperCase() + generationMode.slice(1)} task created (ID: ${(newTask.id as string).substring(0,8)}...).`);
        if (showPlaceholders && activePrompts.length * imagesPerPrompt > 0) {
          setGeneratedImages([]);
          setShowPlaceholders(false);
        }
        queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] }); // <-- ADDED INVALIDATION
      } else {
         console.warn(`[EditTravelToolPage] ${generationMode} task creation via API no ID returned or error in response data.`);
         toast.info(`${generationMode.charAt(0).toUpperCase() + generationMode.slice(1)} task creation registered, but no confirmation ID from API.`);
      }
    } catch (err: any) {
      console.error(`[EditTravelToolPage] Exception creating ${generationMode} task via API:`, err);
      toast.error(`An unexpected error occurred while creating the ${generationMode} task via API: ${err.message || 'Unknown API error'}`);
    } finally {
      setIsCreatingTask(false);
    }
  };
  
  const handleCancelGeneration = () => {
    // if (generationMode === 'flux') {
    //     cancelFluxGeneration(); // From old hook, not applicable to tasks here
    // } else {
    //     // Kontext cancellation might need to be re-evaluated for tasks
    //     kontextCancelGenerationRef.current = true;
    //     if (kontextCurrentSubscriptionRef.current && typeof kontextCurrentSubscriptionRef.current.unsubscribe === 'function') {
    //         kontextCurrentSubscriptionRef.current.unsubscribe();
    //     }
    //     kontextCurrentSubscriptionRef.current = null;
    //     setIsKontextGenerating(false);
    // }
    // For now, a general approach to signal UI cancellation:
    if (isCreatingTask) {
        toast.info("Attempting to cancel task creation/generation process...");
        // Actual task cancellation in DB would be an async operation to update task status
        // For client-side, we can reset the creating state.
        setIsCreatingTask(false); 
        // Reset kontext specific refs if they were only for direct fal calls
        kontextCancelGenerationRef.current = true; // If this flag is used by other effects
        if (kontextCurrentSubscriptionRef.current && typeof kontextCurrentSubscriptionRef.current.unsubscribe === 'function') {
             kontextCurrentSubscriptionRef.current.unsubscribe(); // This was for direct fal.subscribe
        }
        kontextCurrentSubscriptionRef.current = null; 
    }
    
    reconstructionCancelRef.current = true; 
    setIsClientSideReconstructing(false); 
  };

  const handleDeleteEdit = async (id: string) => {
     try {
      const { error } = await supabase.from('generations').delete().eq('id', id);
      if (error) { toast.error("Failed to delete image from DB: " + error.message); return; }
      setGeneratedImages(prevImages => prevImages.filter(image => image.id !== id));
      toast.success("Image deleted successfully from DB.");
    } catch (error: any) { 
        console.error('[EditTravelToolPage] Error deleting image:', error); 
        toast.error("Failed to delete image from DB: " + error.message);
    }
  };
  
  const handleAddImageToTargetShot = async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    const targetShot = lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : undefined);
    if (!targetShot) {
      toast.error("No target shot available. Create or select a shot.");
      return false;
    }
    if (!generationId) { toast.error("Image has no ID."); return false; }
    if (!selectedProjectId) { // Added check for selectedProjectId
        toast.error("No project selected. Cannot add image to shot.");
        return false;
    }
    try {
      await addImageToShotMutation.mutateAsync({ 
        shot_id: targetShot, 
        generation_id: generationId, 
        imageUrl, 
        thumbUrl, 
        project_id: selectedProjectId // Added project_id
      });
      setLastAffectedShotId(targetShot);
      return true;
    } catch (error: any) { 
        toast.error("Failed to add image to shot: " + error.message); 
        return false; 
    }
  };

  const hasValidFalApiKey = !!falApiKey && falApiKey.trim() !== '';

  const effectiveFps = videoDuration && prompts.length > 1 && videoDuration > 0 
    ? (prompts.length -1) / videoDuration 
    : 0;
  
  const showReconstructionSpinner = isClientSideReconstructing || (isOverallGenerating && reconstructVideo && inputFile && typeof inputFile.type === 'string' && inputFile.type.startsWith("video/"));

  if (typeof window !== 'undefined') {
    console.log('[EditTravelToolPage_ImageGalleryInput]', JSON.parse(JSON.stringify(generatedImages)));
  }

  const MemoizedShotsPane = React.memo(ShotsPane);

  const canGenerate = !!selectedProjectId && !!inputFile && prompts.filter(p => p.fullPrompt.trim() !== "").length > 0 && !isCreatingTask && 
                      ( (generationMode === 'kontext' && !!falApiKey) || 
                        (generationMode === 'flux' && !!localStorage.getItem('fal_api_key')) ); // Flux check might still need API key for worker to use

  return (
    <div className="container mx-auto p-4 relative">
      <header className="flex justify-between items-center mb-6 sticky top-0 bg-background/90 backdrop-blur-md py-4 z-10">
        <h1 className="text-3xl font-bold">Edit Travel Tool</h1>
        <SettingsModal 
            currentFalApiKey={falApiKey || ''}
            onSaveApiKeys={handleSaveApiKeys}
        />
      </header>

      {!hasValidFalApiKey && (
         <div className="mb-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
            <span>FAL API Key is not set. Please add it in Settings to enable generation.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Prompts</CardTitle>
            <CardDescription>Add or edit prompts for the image editing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setIsPromptEditorOpen(true)} 
              className="w-full mb-4" 
              disabled={!(openaiApiKey || falApiKey)}
            >
              <Wand2 className="mr-2 h-4 w-4" /> Manage Prompts ({prompts.length})
            </Button>
            <ScrollArea className="h-[200px] border rounded-md p-2">
              {prompts.length === 0 && <p className="text-sm text-muted-foreground">No prompts added yet.</p>}
              {prompts.map(p => (
                <div key={p.id} className="text-sm p-1 border-b truncate" title={p.fullPrompt}>
                  {p.shortPrompt || p.fullPrompt}
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Input Image & Settings</CardTitle>
            <CardDescription>Upload an image and configure generation settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileInput
                onFileChange={handleFileChange}
                onFileRemove={handleFileRemove}
                acceptTypes={['image', 'video']}
                label="Input Image or Video"
                currentFilePreviewUrl={inputFilePreviewUrl}
                currentFileName={inputFile?.name}
                disabled={isOverallGenerating}
              />
             {inputFile && inputFile.type.startsWith('video/') && videoDuration && prompts.length > 0 && (
                <div className="text-sm text-muted-foreground mt-1">
                  {`Generating ${prompts.length} frame${prompts.length === 1 ? '' : 's'} from this ${videoDuration.toFixed(1)}s video`}
                  {prompts.length > 1 && effectiveFps > 0 && 
                    ` (~${effectiveFps.toFixed(1)} FPS).`
                  }
                  {prompts.length === 1 && ` (using first available frame).`}
                  {prompts.length > 1 && videoDuration === 0 && ` (video duration is 0s, cannot determine FPS, will use first frame for all prompts).`}
                  {prompts.length > 1 && effectiveFps === 0 && videoDuration > 0 && ` (effective FPS is 0, likely too short or too few prompts for >0 FPS).`}
                </div>
            )}
            {inputFile && inputFile.type.startsWith('video/') && (
              <div className="flex items-center space-x-2 mt-3">
                <Checkbox 
                  id="reconstruct-video" 
                  checked={reconstructVideo} 
                  onCheckedChange={(checked) => setReconstructVideo(checked as boolean)}
                  disabled={isOverallGenerating || !inputFile || !inputFile.type.startsWith('video/') || isClientSideReconstructing}
                />
                <Label 
                    htmlFor="reconstruct-video" 
                    className={`text-sm font-medium ${isOverallGenerating || !inputFile || !inputFile.type.startsWith('video/') || isClientSideReconstructing ? 'text-muted-foreground' : ''}`}
                >
                  Reconstruct as video (Beta)
                </Label>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 pt-4">
                <div>
                    <Label htmlFor="images-per-prompt" className={isOverallGenerating ? 'text-muted-foreground' : ''}>Images per Prompt</Label>
                    <Input 
                    id="images-per-prompt" 
                    type="number" 
                    value={imagesPerPrompt} 
                    onChange={(e) => setImagesPerPrompt(Math.max(1, parseInt(e.target.value) || 1))} 
                    min="1"
                    disabled={isOverallGenerating}
                    />
                </div>
            </div>

            <div className="pt-4">
              <Label className="text-sm font-medium">Generation Mode</Label>
              <RadioGroup 
                defaultValue="kontext" 
                value={generationMode} 
                onValueChange={(value: string) => setGenerationMode(value as 'kontext' | 'flux')}
                className="flex items-center space-x-4 mt-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="kontext" id="mode-kontext" disabled={isOverallGenerating} />
                  <Label htmlFor="mode-kontext" className={`font-normal ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>Kontext (Creative Edit)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="flux" id="mode-flux" disabled={isOverallGenerating} />
                  <Label htmlFor="mode-flux" className={`font-normal ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>Flux Control (Retain Structure)</Label>
                </div>
              </RadioGroup>

              {/* Conditionally rendered Sliders for Flux mode */}
              {generationMode === 'flux' && (
                <>
                  <div className="pt-3">
                    <Label htmlFor="flux-soft-edge-strength" className={`text-sm font-medium ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>
                      Soft Edge Strength: {Math.round(fluxSoftEdgeStrength * 100)}%
                    </Label>
                    <Slider
                      id="flux-soft-edge-strength"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[fluxSoftEdgeStrength]}
                      onValueChange={(value) => setFluxSoftEdgeStrength(value[0])}
                      className="mt-1"
                      disabled={isOverallGenerating}
                    />
                  </div>
                  <div className="pt-3">
                    <Label htmlFor="flux-depth-strength" className={`text-sm font-medium ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>
                      Depth Strength: {Math.round(fluxDepthStrength * 100)}%
                    </Label>
                    <Slider
                      id="flux-depth-strength"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[fluxDepthStrength]}
                      onValueChange={(value) => setFluxDepthStrength(value[0])}
                      className="mt-1"
                      disabled={isOverallGenerating}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="mb-8 text-center">
        <Button 
          onClick={handleGenerate} 
          disabled={!canGenerate} 
          size="lg"
        >
          {isCreatingTask ? "Creating Task..." : 
           isOverallGenerating ? "Generating..." : 
           `Generate Edits (${generationMode === 'flux' ? 'Flux' : 'Kontext'})`}
        </Button>
      </div>

      {(isOverallGenerating || isClientSideReconstructing) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
             onClick={(e) => { 
               if (e.target === e.currentTarget && !isClientSideReconstructing) {
                 handleCancelGeneration(); 
               }
             }}>
            <div className="bg-background p-8 rounded-lg shadow-2xl w-full max-w-md text-center" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-semibold mb-4">
                {isClientSideReconstructing ? "Reconstructing Video (Client)..." : 
                 isOverallGenerating ? "Generating..." : "Editing Media (Kontext Mode)..."}
              </h2>
              <p className="mb-4">
                {isClientSideReconstructing 
                    ? "Combining edited frames and audio client-side. This may take some time." 
                    : "Processing your request. This may take a moment."}
              </p>
              <div className="w-full bg-muted rounded-full h-2.5 mb-6 relative overflow-hidden">
                <div 
                  className="bg-primary h-2.5 rounded-full absolute animate-ping"
                  style={{ width: `100%`, animationDuration: '1.5s'}}
                ></div>
              </div>
              <Button variant="destructive" 
                onClick={handleCancelGeneration}
              >Cancel Generation</Button>
            </div>
          </div>
      )}
      
      <ImageGallery 
        images={showPlaceholders && generatedImages.length === 0 ? Array(4).fill(null).map((_,idx) => ({id: `ph-${idx}`, url: "/placeholder.svg", prompt: "Placeholder"})) : [...generatedImages].reverse()}
        onDelete={handleDeleteEdit} 
        onAddToLastShot={handleAddImageToTargetShot}
        allShots={shots || []}
        lastShotId={lastAffectedShotId}
        currentToolType="edit-travel" 
        initialFilterState={true}
      />
      
      <MemoizedShotsPane />

      {isPromptEditorOpen && (
        <PromptEditorModal
          isOpen={isPromptEditorOpen}
          onClose={() => setIsPromptEditorOpen(false)}
          prompts={prompts}
          onSave={handleSavePrompts}
          onAutoSavePrompts={handleAutoSavePrompts}
          generatePromptId={generatePromptId}
          apiKey={openaiApiKey || falApiKey || undefined}
        />
      )}
    </div>
  );
};

export default EditTravelToolPage; 
