import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickImage,
  MagickImageCollection,
} from "npm:@imagemagick/magick-wasm@0.0.30"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize ImageMagick WASM
let magickInitialized = false

async function ensureMagickInitialized() {
  if (magickInitialized) return

  const wasmBytes = await Deno.readFile(
    new URL(
      "magick.wasm",
      import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30"),
    ),
  )
  await initializeImageMagick(wasmBytes)
  magickInitialized = true
  console.log('[GENERATE-LINEAGE-GIF] ImageMagick initialized')
}

/**
 * Edge function: generate-lineage-gif
 *
 * Generates an animated GIF from an array of image URLs.
 * Uses ImageMagick WASM for image processing.
 *
 * POST /functions/v1/generate-lineage-gif
 * Body: {
 *   imageUrls: string[],  // Array of image URLs to include in the GIF
 *   frameDelay?: number,  // Milliseconds between frames (default: 800)
 *   width?: number,       // Output width (default: 512)
 * }
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
    // Initialize ImageMagick
    await ensureMagickInitialized()

    const { imageUrls, frameDelay = 800, width = 512 } = await req.json()

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'imageUrls array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[GENERATE-LINEAGE-GIF] Processing ${imageUrls.length} images`)

    // Fetch all images
    const imageDataArray: Uint8Array[] = []
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i]
      console.log(`[GENERATE-LINEAGE-GIF] Fetching image ${i + 1}/${imageUrls.length}`)

      try {
        const response = await fetch(url)
        if (!response.ok) {
          console.error(`[GENERATE-LINEAGE-GIF] Failed to fetch image ${i}: ${response.status}`)
          continue
        }

        const arrayBuffer = await response.arrayBuffer()
        imageDataArray.push(new Uint8Array(arrayBuffer))
        console.log(`[GENERATE-LINEAGE-GIF] Image ${i + 1} loaded: ${arrayBuffer.byteLength} bytes`)
      } catch (err) {
        console.error(`[GENERATE-LINEAGE-GIF] Error loading image ${i}:`, err)
      }
    }

    if (imageDataArray.length === 0) {
      return new Response(JSON.stringify({ error: 'No images could be loaded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[GENERATE-LINEAGE-GIF] Creating animated GIF with ${imageDataArray.length} frames`)

    // Convert delay from milliseconds to centiseconds (GIF standard)
    const delayCs = Math.round(frameDelay / 10)

    // Create the animated GIF using ImageMagick
    const gifData = ImageMagick.readCollection(imageDataArray[0], (images: MagickImageCollection) => {
      // First image is already in the collection, resize it
      images[0].resize(width, 0) // 0 = auto height to maintain aspect ratio
      images[0].animationDelay = delayCs

      // Add remaining images
      for (let i = 1; i < imageDataArray.length; i++) {
        ImageMagick.read(imageDataArray[i], (img: MagickImage) => {
          img.resize(width, 0)
          img.animationDelay = delayCs
          images.push(img)
        })
      }

      // Set loop count (0 = infinite loop)
      images.forEach((img: MagickImage) => {
        img.animationIterations = 0
      })

      console.log(`[GENERATE-LINEAGE-GIF] Collection has ${images.length} images`)

      // Write as animated GIF
      return images.write(MagickFormat.Gif, (data: Uint8Array) => {
        return new Uint8Array(data)
      })
    })

    console.log(`[GENERATE-LINEAGE-GIF] GIF generated: ${gifData.length} bytes`)

    // Return GIF as binary response
    return new Response(gifData, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/gif',
        'Content-Length': gifData.length.toString(),
      },
      status: 200,
    })

  } catch (error) {
    console.error('[GENERATE-LINEAGE-GIF] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
