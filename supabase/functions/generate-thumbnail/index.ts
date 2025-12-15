import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { storagePaths, generateThumbnailFilename, MEDIA_BUCKET } from '../_shared/storagePaths.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Edge function: generate-thumbnail
 * 
 * Automatically generates thumbnails from main images using Canvas API
 * - Resizes images to 1/3 of original size
 * - Stores both mainUrl and thumbnailUrl in generation record
 * - Called automatically by the task completion trigger
 * 
 * POST /functions/v1/generate-thumbnail
 * Headers: Authorization: Bearer <service-role-key>
 * Body: { 
 *   generation_id: "uuid",
 *   main_image_url: "https://...",
 *   user_id: "uuid" 
 * }
 * 
 * Returns:
 * - 200 OK with { thumbnailUrl: "https://..." }
 * - 400 Bad Request if missing required fields
 * - 500 Internal Server Error
 */

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    // Parse request body
    const { generation_id, main_image_url, user_id } = await req.json()

    if (!generation_id || !main_image_url || !user_id) {
      return new Response('Missing required fields: generation_id, main_image_url, user_id', {
        status: 400,
        headers: corsHeaders
      })
    }

    console.log(`[GENERATE-THUMBNAIL] Processing thumbnail for generation ${generation_id}`)

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the main image
    console.log(`[GENERATE-THUMBNAIL] Fetching main image: ${main_image_url}`)
    const imageResponse = await fetch(main_image_url)
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch main image: ${imageResponse.statusText}`)
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const imageBlob = new Blob([imageBuffer])
    
    // Create an image bitmap for resizing
    const imageBitmap = await createImageBitmap(imageBlob)
    const originalWidth = imageBitmap.width
    const originalHeight = imageBitmap.height

    // Calculate thumbnail dimensions (1/3 of original size)
    const thumbnailWidth = Math.round(originalWidth / 3)
    const thumbnailHeight = Math.round(originalHeight / 3)

    console.log(`[GENERATE-THUMBNAIL] Resizing from ${originalWidth}x${originalHeight} to ${thumbnailWidth}x${thumbnailHeight}`)

    // Create canvas and resize image
    const canvas = new OffscreenCanvas(thumbnailWidth, thumbnailHeight)
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    // Draw and resize the image
    ctx.drawImage(imageBitmap, 0, 0, thumbnailWidth, thumbnailHeight)

    // Convert canvas to blob (JPEG with 80% quality for smaller size)
    const thumbnailBlob = await canvas.convertToBlob({ 
      type: 'image/jpeg', 
      quality: 0.8 
    })

    // Generate thumbnail filename using centralized path utilities
    const thumbnailFilename = generateThumbnailFilename()
    const thumbnailPath = storagePaths.thumbnail(user_id, thumbnailFilename)

    // Upload thumbnail to Supabase Storage
    console.log(`[GENERATE-THUMBNAIL] Uploading thumbnail to: ${thumbnailPath}`)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(thumbnailPath, thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      console.error('[GENERATE-THUMBNAIL] Upload error:', uploadError)
      throw new Error(`Thumbnail upload failed: ${uploadError.message}`)
    }

    // Get public URL for thumbnail
    const { data: urlData } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(thumbnailPath)
    
    const thumbnailUrl = urlData.publicUrl

    // Update the generation record with thumbnail URL in the thumbnail_url field
    console.log(`[GENERATE-THUMBNAIL] Updating generation ${generation_id} with thumbnail: ${thumbnailUrl}`)
    const { error: updateError } = await supabase
      .from('generations')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', generation_id)

    if (updateError) {
      console.error('[GENERATE-THUMBNAIL] Database update error:', updateError)
      // Don't fail the request if DB update fails, thumbnail was still created
    }

    console.log(`[GENERATE-THUMBNAIL] Successfully generated thumbnail for generation ${generation_id}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        thumbnailUrl,
        originalSize: `${originalWidth}x${originalHeight}`,
        thumbnailSize: `${thumbnailWidth}x${thumbnailHeight}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('[GENERATE-THUMBNAIL] Error:', error)
    
    // FALLBACK: If thumbnail generation fails, store main URL as both main and thumbnail
    console.log(`[GENERATE-THUMBNAIL] Thumbnail generation failed for ${generation_id}, using main URL as fallback`)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      // Store main URL as thumbnail fallback in thumbnail_url field
      await supabase
        .from('generations')
        .update({ thumbnail_url: main_image_url })  // Use main URL as thumbnail fallback
        .eq('id', generation_id)
      
      console.log(`[GENERATE-THUMBNAIL] Stored main URL as fallback for generation ${generation_id}`)
    } catch (fallbackError) {
      console.error('[GENERATE-THUMBNAIL] Fallback update failed:', fallbackError)
    }
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        success: false,
        fallback: true,
        message: 'Thumbnail generation failed, using main image as thumbnail'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
