/**
 * Edge Function: trim-video
 * 
 * Trims a video using Replicate's lucataco/trim-video model and uploads to Supabase storage.
 * Converts WebM to MP4 with proper duration metadata.
 * Note: Thumbnail extraction is done client-side after this function returns.
 * 
 * POST /functions/v1/trim-video
 * Body: {
 *   video_url: string,      // URL of the source video
 *   start_time: number,     // Start time in seconds
 *   end_time: number,       // End time in seconds  
 *   project_id: string,     // For storage path
 *   user_id: string,        // For storage path
 *   generation_id?: string, // Optional: to update variant record
 *   variant_id?: string     // Optional: to update variant record
 * }
 * 
 * Returns:
 * - 200 OK with { video_url, duration, format }
 * - 400 Bad Request if missing required fields
 * - 500 Internal Server Error
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { storagePaths, MEDIA_BUCKET } from '../_shared/storagePaths.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REPLICATE_TRIM_MODEL = "lucataco/trim-video:a58ed80215326cba0a80c77a11dd0d0968c567388228891b3c5c67de2a8d10cb";

interface TrimRequest {
  video_url: string;
  start_time: number;
  end_time: number;
  project_id: string;
  user_id: string;
  generation_id?: string;
  variant_id?: string;
  test_mode?: boolean;
}

/**
 * Convert seconds to MM:SS.ms format for Replicate trim-video model
 * Includes milliseconds for sub-second precision
 */
function secondsToTimeString(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  // Format as MM:SS.ms (e.g., "00:02.5" for 2.5 seconds)
  const secsStr = secs < 10 ? `0${secs.toFixed(1)}` : secs.toFixed(1);
  return `${mins.toString().padStart(2, '0')}:${secsStr}`;
}

/**
 * Wait for Replicate prediction to complete
 */
async function waitForPrediction(
  predictionId: string, 
  apiToken: string,
  maxWaitMs: number = 300000 // 5 minutes max
): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: { 
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to check prediction status: ${response.status}`);
    }
    
    const prediction = await response.json();
    console.log(`[TRIM-VIDEO] Prediction status: ${prediction.status}`);
    
    if (prediction.status === 'succeeded') {
      return prediction;
    }
    
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Prediction ${prediction.status}: ${prediction.error || 'Unknown error'}`);
    }
    
    // Wait 2 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Prediction timeout - took too long to process');
}

/**
 * Call Replicate's trim-video model
 * The model uses start_time and end_time in MM:SS format
 */
async function trimWithReplicate(
  videoUrl: string,
  startTime: number,
  endTime: number,
  apiToken: string
): Promise<string> {
  console.log(`[TRIM-VIDEO] Calling Replicate trim-video model`);
  console.log(`[TRIM-VIDEO] Input: ${videoUrl.substring(0, 80)}...`);
  console.log(`[TRIM-VIDEO] Trim: ${startTime}s (${secondsToTimeString(startTime)}) to ${endTime}s (${secondsToTimeString(endTime)})`);
  
  // The model takes start_time and end_time in MM:SS format
  const input: Record<string, string> = {
    video: videoUrl,
    start_time: secondsToTimeString(startTime),
    end_time: secondsToTimeString(endTime),
  };
  
  console.log(`[TRIM-VIDEO] Input:`, JSON.stringify(input));
  
  // Create prediction
  const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: REPLICATE_TRIM_MODEL.split(':')[1],
      input,
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error(`[TRIM-VIDEO] Replicate API error: ${errorText}`);
    throw new Error(`Replicate API error: ${createResponse.status} - ${errorText}`);
  }

  const prediction = await createResponse.json();
  console.log(`[TRIM-VIDEO] Prediction created: ${prediction.id}`);

  // Wait for completion
  const result = await waitForPrediction(prediction.id, apiToken);
  
  // Get the output URL
  const outputUrl = result.output;
  if (!outputUrl) {
    throw new Error('No output URL in prediction result');
  }
  
  console.log(`[TRIM-VIDEO] Replicate output: ${outputUrl}`);
  return outputUrl;
}

/**
 * Download video from URL
 */
async function downloadVideo(url: string): Promise<ArrayBuffer> {
  console.log(`[TRIM-VIDEO] Downloading from: ${url.substring(0, 80)}...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  console.log(`[TRIM-VIDEO] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  
  return buffer;
}

/**
 * Upload video to Supabase Storage
 * Note: projectId param kept for backwards compatibility but no longer used in path
 */
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  videoBuffer: ArrayBuffer,
  userId: string,
  projectId: string,
  contentType: string = 'video/mp4'
): Promise<string> {
  // Generate storage path using centralized utilities
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const extension = contentType.includes('mp4') ? 'mp4' : 'webm';
  const filename = `trimmed_${timestamp}_${randomStr}.${extension}`;
  const uploadPath = storagePaths.upload(userId, filename);

  console.log(`[TRIM-VIDEO] Uploading to storage: ${uploadPath}`);
  console.log(`[TRIM-VIDEO] Size: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(uploadPath, videoBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(uploadPath);

  console.log(`[TRIM-VIDEO] Uploaded: ${urlData.publicUrl}`);
  return urlData.publicUrl;
}


/**
 * Update variant record with new video URL
 */
async function updateVariantRecord(
  supabase: ReturnType<typeof createClient>,
  variantId: string,
  videoUrl: string,
  thumbnailUrl: string | null,
  duration: number
): Promise<void> {
  console.log(`[TRIM-VIDEO] Updating variant ${variantId.substring(0, 8)}...`);
  
  const { error } = await supabase
    .from('generation_variants')
    .update({
      location: videoUrl,
      thumbnail_url: thumbnailUrl,
      params: {
        duration_seconds: duration,
        processed_at: new Date().toISOString(),
        format: 'mp4',
      },
    })
    .eq('id', variantId);

  if (error) {
    console.error(`[TRIM-VIDEO] Failed to update variant: ${error.message}`);
    // Don't throw - the video was still processed successfully
  } else {
    console.log(`[TRIM-VIDEO] Variant updated successfully`);
  }
}

/**
 * Main handler
 */
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  const startProcessTime = Date.now();

  try {
    // Parse request
    const body: TrimRequest = await req.json();
    const {
      video_url,
      start_time,
      end_time,
      project_id,
      user_id,
      generation_id,
      variant_id,
      test_mode = false,
    } = body;

    console.log(`[TRIM-VIDEO] ========================================`);
    console.log(`[TRIM-VIDEO] Starting video trim request`);
    console.log(`[TRIM-VIDEO] ========================================`);
    console.log(`[TRIM-VIDEO] Video: ${video_url?.substring(0, 80)}...`);
    console.log(`[TRIM-VIDEO] Trim: ${start_time}s to ${end_time}s (duration: ${end_time - start_time}s)`);
    console.log(`[TRIM-VIDEO] Project: ${project_id?.substring(0, 8)}...`);
    console.log(`[TRIM-VIDEO] User: ${user_id?.substring(0, 8)}...`);

    // Validate required fields
    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof start_time !== 'number' || typeof end_time !== 'number') {
      return new Response(
        JSON.stringify({ error: 'start_time and end_time must be numbers', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (start_time >= end_time) {
      console.error(`[TRIM-VIDEO] Invalid times: start=${start_time}, end=${end_time}`);
      return new Response(
        JSON.stringify({ 
          error: `start_time (${start_time}) must be less than end_time (${end_time})`, 
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure minimum duration of 0.1 seconds
    if (end_time - start_time < 0.1) {
      return new Response(
        JSON.stringify({ 
          error: `Trimmed video must be at least 0.1 seconds (got ${(end_time - start_time).toFixed(2)}s)`, 
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!project_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'project_id and user_id are required', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API tokens
    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');
    if (!replicateToken) {
      return new Response(
        JSON.stringify({ error: 'REPLICATE_API_TOKEN not configured', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Test mode - validate and return mock response
    if (test_mode) {
      console.log(`[TRIM-VIDEO] Test mode - returning mock response`);
      return new Response(
        JSON.stringify({
          success: true,
          test_mode: true,
          message: 'Test mode - validation passed, no processing performed',
          input: { video_url, start_time, end_time, project_id, user_id },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Call Replicate to trim the video
    console.log(`[TRIM-VIDEO] Step 1: Processing with Replicate...`);
    const replicateOutputUrl = await trimWithReplicate(
      video_url,
      start_time,
      end_time,
      replicateToken
    );

    // Step 2: Download the processed video from Replicate
    console.log(`[TRIM-VIDEO] Step 2: Downloading processed video...`);
    const videoBuffer = await downloadVideo(replicateOutputUrl);

    // Step 3: Upload to Supabase storage
    console.log(`[TRIM-VIDEO] Step 3: Uploading to Supabase storage...`);
    const finalVideoUrl = await uploadToStorage(
      supabase,
      videoBuffer,
      user_id,
      project_id,
      'video/mp4'
    );

    // Step 4: Update variant record if provided (thumbnail is extracted client-side)
    const duration = end_time - start_time;
    if (variant_id) {
      await updateVariantRecord(supabase, variant_id, finalVideoUrl, null, duration);
    }

    const processingTime = Date.now() - startProcessTime;
    console.log(`[TRIM-VIDEO] ========================================`);
    console.log(`[TRIM-VIDEO] Completed in ${processingTime}ms`);
    console.log(`[TRIM-VIDEO] Output: ${finalVideoUrl}`);
    console.log(`[TRIM-VIDEO] ========================================`);

    return new Response(
      JSON.stringify({
        success: true,
        video_url: finalVideoUrl,
        thumbnail_url: null, // Thumbnail extracted client-side
        duration,
        format: 'mp4',
        file_size: videoBuffer.byteLength,
        processing_time_ms: processingTime,
        replicate_output_url: replicateOutputUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startProcessTime;
    console.error(`[TRIM-VIDEO] ========================================`);
    console.error(`[TRIM-VIDEO] Error after ${processingTime}ms:`, error);
    console.error(`[TRIM-VIDEO] ========================================`);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false,
        processing_time_ms: processingTime,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
