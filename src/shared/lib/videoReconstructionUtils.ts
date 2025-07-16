import { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { GeneratedImageWithMetadata, DisplayableMetadata } from "@/shared/components/ImageGallery";
import { Json } from "@/integrations/supabase/types";

// Helper function to convert a URL to a Blob URL
export const toBlobURL = async (url: string, mimeType: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

// Helper function to extract audio
export const extractAudio = async (videoFile: File, onProgress: (message: string) => void): Promise<AudioBuffer | null> => {
  onProgress("[ClientSideReconstruction_Audio] Starting audio extraction for: " + videoFile.name);
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (!audioContext) {
    onProgress("Web Audio API not supported in this browser. Video will be reconstructed without audio.");
    console.warn("[ClientSideReconstruction_Audio] Web Audio API not supported.");
    return null;
  }

  try {
    const arrayBuffer = await videoFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    onProgress(`[ClientSideReconstruction_Audio] Audio decoded successfully. Duration: ${audioBuffer.duration}`);
    return audioBuffer;
  } catch (error) {
    console.error("[ClientSideReconstruction_Audio] Error decoding audio data:", error);
    onProgress("Could not extract audio from video. Reconstruction will proceed without audio.");
    return null;
  }
};

// Client-side video reconstruction logic
export const reconstructVideoClientSide = async (
  originalVideoName: string,
  editedFrames: GeneratedImageWithMetadata[],
  videoDurationSeconds: number,
  targetFps: number,
  outputWidth: number,
  outputHeight: number,
  audioBuffer: AudioBuffer | null,
  isCancelled: () => boolean,
  onProgress: (message: string) => void,
): Promise<File | null> => {
  if (editedFrames.length === 0) {
    onProgress("No edited frames available for client-side reconstruction.");
    return null;
  }

  onProgress("Starting client-side video reconstruction...");
  console.log(`[ClientSideReconstruction] Starting with ${editedFrames.length} frames. Video duration: ${videoDurationSeconds}s. Target FPS: ${targetFps}. Output: ${outputWidth}x${outputHeight}`);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    onProgress("Could not get canvas context for reconstruction.");
    return null;
  }

  let mediaStream: MediaStream;
  console.log(`[ClientSideReconstruction] Canvas stream will capture frames when requestFrame() is called. Visual pacing target FPS (for frame delays): ${targetFps.toFixed(2)}`);
  const videoStream = canvas.captureStream(); // No explicit frame rate
  const videoStreamTrack = videoStream.getVideoTracks()[0];
  videoStreamTrack.enabled = true;

  let audioContextInternal: AudioContext | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;
  let audioDestinationNode: MediaStreamAudioDestinationNode | null = null;

  if (audioBuffer) {
    try {
      audioContextInternal = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioSourceNode = audioContextInternal.createBufferSource();
      audioSourceNode.buffer = audioBuffer;
      
      audioDestinationNode = audioContextInternal.createMediaStreamDestination();
      audioSourceNode.connect(audioDestinationNode);
      
      const audioStreamTracks = audioDestinationNode.stream.getAudioTracks();
      if (audioStreamTracks.length > 0) {
        mediaStream = new MediaStream([videoStreamTrack, audioStreamTracks[0]]);
        console.log("[ClientSideReconstruction] Combined video and audio streams.");
      } else {
        mediaStream = new MediaStream([videoStreamTrack]);
        console.warn("[ClientSideReconstruction] Audio stream track not found, proceeding with video only.");
        onProgress("Audio track issue, reconstructing video only.");
      }
    } catch (error) {
      console.error("[ClientSideReconstruction] Error setting up audio stream:", error);
      mediaStream = new MediaStream([videoStreamTrack]);
      onProgress("Error with audio setup, reconstructing video only.");
      // audioBuffer remains as is, to avoid re-assigning parameter
    }
  } else {
    mediaStream = new MediaStream([videoStreamTrack]);
    console.log("[ClientSideReconstruction] Proceeding with video-only stream.");
  }

  const recordedChunks: BlobPart[] = [];
  const mimeTypesToTry = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm'];
  let selectedMimeType = '';
  for (const mimeType of mimeTypesToTry) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          console.log(`[ClientSideReconstruction] Using MIME type: ${selectedMimeType}`);
          break;
      }
  }
  if (!selectedMimeType) {
      selectedMimeType = 'video/webm';
      console.warn(`[ClientSideReconstruction] No preferred MIME type supported, falling back to ${selectedMimeType}`);
  }

  const mediaRecorder = new MediaRecorder(mediaStream, { mimeType: selectedMimeType });

  mediaRecorder.ondataavailable = (event) => {
    console.log(`[ClientSideReconstruction_MediaRecorder] ondataavailable event. data size: ${event.data.size}, data type: ${event.data.type}`);
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
      console.log(`[ClientSideReconstruction_MediaRecorder] Chunk pushed. Total chunks: ${recordedChunks.length}, current chunk size: ${event.data.size}`);
    } else {
      console.warn(`[ClientSideReconstruction_MediaRecorder] ondataavailable event received with 0 size data.`);
    }
  };

  return new Promise(async (resolve, reject) => {
    mediaRecorder.onstop = () => {
      console.log(`[ClientSideReconstruction_MediaRecorder] onstop event. Processing ${recordedChunks.length} chunks.`);
      if (recordedChunks.length === 0) {
          console.warn("[ClientSideReconstruction_MediaRecorder] No data chunks recorded. Output video will likely be empty or invalid.");
      }
      const finalBlob = new Blob(recordedChunks, { type: selectedMimeType });
      const fileExtension = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';
      const reconstructedFile = new File([finalBlob], `reconstructed_client_${originalVideoName.replace(/\.[^/.]+$/, "")}.${fileExtension}`, { type: selectedMimeType });
      
      onProgress("Client-side video reconstruction complete!");
      console.log("[ClientSideReconstruction] Reconstruction success. File:", reconstructedFile.name, "Size:", reconstructedFile.size);
      
      if (audioSourceNode) audioSourceNode.stop();
      if (audioContextInternal && audioContextInternal.state !== 'closed') audioContextInternal.close();
      videoStreamTrack.stop();
      if (audioDestinationNode) audioDestinationNode.stream.getTracks().forEach(t => t.stop());

      resolve(reconstructedFile);
    };

    mediaRecorder.onerror = (event) => {
      console.error("[ClientSideReconstruction] MediaRecorder error:", event);
      const errorMessage = (event as any).error?.message || 'MediaRecorder error';
      
      if (audioSourceNode) audioSourceNode.stop();
      if (audioContextInternal && audioContextInternal.state !== 'closed') audioContextInternal.close();
      videoStreamTrack.stop();
      if (audioDestinationNode) audioDestinationNode.stream.getTracks().forEach(t => t.stop());
      
      reject(new Error(`MediaRecorder error during reconstruction: ${errorMessage}`));
    };

    mediaRecorder.start(100); 
    if (audioSourceNode && audioBuffer) {
      audioSourceNode.start();
    }

    try {
      for (let i = 0; i < editedFrames.length; i++) {
        if (isCancelled()) {
          onProgress("Client-side reconstruction cancelled by user.");
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          } else {
            if (audioSourceNode) audioSourceNode.stop();
            if (audioContextInternal && audioContextInternal.state !== 'closed') audioContextInternal.close();
            videoStreamTrack.stop();
            if (audioDestinationNode) audioDestinationNode.stream.getTracks().forEach(t => t.stop());
            reject(new Error("Client-side reconstruction cancelled by user."));
          }
          return;
        }

        const frame = editedFrames[i];
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        const imageLoadPromise = new Promise<void>((resolveLoad, rejectLoad) => {
          img.onload = () => resolveLoad();
          img.onerror = (err) => {
              onProgress(`Error loading frame ${i + 1} for reconstruction.`);
              rejectLoad(new Error(`Failed to load image ${frame.url} for reconstruction.`));
          };
        });
        
        try {
          img.src = await toBlobURL(frame.url, frame.metadata?.content_type || 'image/jpeg');
          await imageLoadPromise;
        } catch(loadError) {
          if (mediaRecorder.state === "recording") mediaRecorder.stop();
          else {
              if (audioSourceNode) audioSourceNode.stop();
              if (audioContextInternal && audioContextInternal.state !== 'closed') audioContextInternal.close();
              videoStreamTrack.stop();
              if (audioDestinationNode) audioDestinationNode.stream.getTracks().forEach(t => t.stop());
              reject(loadError as Error);
          }
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);

        let durationMs;
        const currentTimestamp = frame.metadata!.original_frame_timestamp!;
        if (i < editedFrames.length - 1) {
          const nextTimestamp = editedFrames[i + 1].metadata!.original_frame_timestamp!;
          durationMs = (nextTimestamp - currentTimestamp) * 1000;
        } else {
          durationMs = (videoDurationSeconds - currentTimestamp) * 1000;
        }
        // Cap duration to prevent long setTimeout violations while maintaining timing accuracy
        const cappedDurationMs = Math.min(Math.max(durationMs, 1000 / (targetFps > 0 ? targetFps : 24)), 200);
        
        onProgress(`Processing frame ${i+1}/${editedFrames.length}...`);
        
        // Use optimized timing for better performance
        if (cappedDurationMs > 50) {
          await new Promise(r => setTimeout(r, cappedDurationMs));
        } else {
          // Use requestAnimationFrame for very short delays
          await new Promise(r => requestAnimationFrame(r));
        }
      } 
  
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
    } catch (error) {
      console.error("[ClientSideReconstruction] Error during frame processing loop:", error);
      onProgress(`Error during frame processing: ${(error as Error).message}`);
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      } else {
        if (audioSourceNode) audioSourceNode.stop();
        if (audioContextInternal && audioContextInternal.state !== 'closed') audioContextInternal.close();
        videoStreamTrack.stop();
        if (audioDestinationNode) audioDestinationNode.stream.getTracks().forEach(t => t.stop());
        reject(error as Error);
      }
    }
  });
};

interface SaveReconstructedVideoParams {
  reconstructedVideoFile: File;
  originalInputFileName: string;
  outputWidth: number;
  outputHeight: number;
  actualVideoDuration: number;
  framesForReconstructionLength: number;
  generationMode: 'kontext' | 'flux' | string;
  supabase: SupabaseClient<any, "public", any>;
  setGeneratedImages: React.Dispatch<React.SetStateAction<GeneratedImageWithMetadata[]>>;
}

export const saveReconstructedVideo = async ({
  reconstructedVideoFile,
  originalInputFileName,
  outputWidth,
  outputHeight,
  actualVideoDuration,
  framesForReconstructionLength,
  generationMode,
  supabase,
  setGeneratedImages,
}: SaveReconstructedVideoParams): Promise<boolean> => {
  let finalVideoUrlForDbAndDisplay = "";
  let videoSupabasePath: string | null = null;
  const toolTypeSuffix = generationMode === 'flux' ? 'Flux' : (generationMode === 'kontext' ? 'Kontext' : 'General');

  try {
    const videoFileExtension = reconstructedVideoFile.name.split('.').pop() || 'webm';
    const videoFileNameForSupabase = `reconstructed_${generationMode}_video_${nanoid(12)}.${videoFileExtension}`;
    videoSupabasePath = `public/${videoFileNameForSupabase}`;

    console.log(`[saveReconstructedVideo] Uploading ${videoFileNameForSupabase} to Supabase. Path: ${videoSupabasePath}, Type: ${reconstructedVideoFile.type}`);
    const { error: uploadError } = await supabase.storage
      .from('image_uploads')
      .upload(videoSupabasePath, reconstructedVideoFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: reconstructedVideoFile.type,
      });
    if (uploadError) {
      console.error(`[saveReconstructedVideo] Supabase upload error for ${generationMode} video:`, uploadError);
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from('image_uploads')
      .getPublicUrl(videoSupabasePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      console.error(`[saveReconstructedVideo] Could not get public URL for uploaded ${generationMode} video from Supabase.`);
      throw new Error(`Could not get public URL for uploaded ${generationMode} video from Supabase.`);
    }
    finalVideoUrlForDbAndDisplay = publicUrlData.publicUrl;
    
    console.log(`[saveReconstructedVideo] ${toolTypeSuffix} video successfully uploaded to Supabase: ${finalVideoUrlForDbAndDisplay}`);

  } catch (storageError: any) {
    console.error(`[saveReconstructedVideo] Failed to upload reconstructed ${generationMode} video to Supabase:`, storageError);
    toast.error(`Storage failed for reconstructed ${toolTypeSuffix} video: ${storageError.message}. Using local blob URL for display.`);
    finalVideoUrlForDbAndDisplay = URL.createObjectURL(reconstructedVideoFile);
  }

  const metadataForDb: DisplayableMetadata = {
    prompt: `Reconstructed ${toolTypeSuffix} video (client-side) from ${framesForReconstructionLength} edits.`,
    tool_type: 'edit-travel-reconstructed-client',
    original_image_filename: originalInputFileName,
    content_type: reconstructedVideoFile.type,
    width: outputWidth,
    height: outputHeight,
    ...(videoSupabasePath && { supabase_storage_path: videoSupabasePath }),
    api_parameters: {
      source_frames: framesForReconstructionLength,
      original_duration: actualVideoDuration,
      reconstruction_mode: generationMode,
    },
  };

  try {
    console.log(`[saveReconstructedVideo] Inserting ${generationMode} video record into 'generations' table.`, metadataForDb);
    const { data: dbData, error: dbError } = await supabase
      .from('generations')
      .insert({
        image_url: finalVideoUrlForDbAndDisplay,
        prompt: metadataForDb.prompt,
        metadata: metadataForDb as Json,
      })
      .select()
      .single();

    if (dbError) {
      console.error(`[saveReconstructedVideo] DB insert error for ${generationMode} video:`, dbError);
      throw dbError;
    }

    if (dbData) {
      const newVideoEntry: GeneratedImageWithMetadata = {
        id: dbData.id,
        url: finalVideoUrlForDbAndDisplay,
        prompt: metadataForDb.prompt,
        metadata: metadataForDb,
        isVideo: true,
      };
      setGeneratedImages((prev) => [newVideoEntry, ...prev]);
      
      console.log(`[saveReconstructedVideo] ${toolTypeSuffix} video record saved to DB and gallery updated.`);
      return true;
    }
    console.warn(`[saveReconstructedVideo] DB insert for ${generationMode} video did not return data.`);
    return false;

  } catch (dbError: any) {
    console.error(`[saveReconstructedVideo] Error saving reconstructed ${generationMode} video to DB:`, dbError);
    toast.error(`DB Save Error for reconstructed ${toolTypeSuffix} video: ${dbError.message}`);
    
    const tempId = nanoid();
    console.warn(`[saveReconstructedVideo] Adding ${generationMode} video to gallery with temporary ID ${tempId} and local URL due to DB save failure.`);
    const newVideoEntry: GeneratedImageWithMetadata = {
      id: tempId, 
      url: finalVideoUrlForDbAndDisplay,
      prompt: metadataForDb.prompt,
      metadata: { ...metadataForDb, error_saving_to_db: true },
      isVideo: true,
    };
    setGeneratedImages((prev) => [newVideoEntry, ...prev]);
    return false;
  }
};