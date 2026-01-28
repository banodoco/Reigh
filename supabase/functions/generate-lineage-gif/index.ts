import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickImageCollection,
} from "npm:@imagemagick/magick-wasm@0.0.30"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Limits to avoid CPU timeout
const MAX_IMAGES = 10
const TARGET_WIDTH = 400 // Smaller to reduce processing time

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
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    await ensureMagickInitialized()

    const { imageUrls, frameDelay = 800, width = TARGET_WIDTH } = await req.json()

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'imageUrls array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Limit number of images to avoid timeout
    const urlsToProcess = imageUrls.slice(0, MAX_IMAGES)
    if (imageUrls.length > MAX_IMAGES) {
      console.log(`[GENERATE-LINEAGE-GIF] Limiting to ${MAX_IMAGES} images (was ${imageUrls.length})`)
    }

    console.log(`[GENERATE-LINEAGE-GIF] Processing ${urlsToProcess.length} images at ${width}px width`)

    // Fetch all images first
    const imageDataArray: Uint8Array[] = []
    for (let i = 0; i < urlsToProcess.length; i++) {
      try {
        const response = await fetch(urlsToProcess[i])
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

    // Convert delay from milliseconds to centiseconds (GIF standard)
    const delayCs = Math.round(frameDelay / 10)

    console.log(`[GENERATE-LINEAGE-GIF] Creating GIF with ${imageDataArray.length} frames, delay=${delayCs}cs`)

    // Process images one at a time and build GIF
    // Use a simpler approach: process each image individually to a resized PNG,
    // then combine them into a GIF at the end
    const resizedImages: Uint8Array[] = []

    for (let i = 0; i < imageDataArray.length; i++) {
      const resized = ImageMagick.read(imageDataArray[i], (img) => {
        img.resize(width, 0) // 0 = auto height
        return img.write(MagickFormat.Png, (data) => new Uint8Array(data))
      })
      resizedImages.push(resized)
      console.log(`[GENERATE-LINEAGE-GIF] Resized image ${i + 1}: ${resized.length} bytes`)
    }

    // Now create the animated GIF from resized images
    const collection = MagickImageCollection.create()

    for (let i = 0; i < resizedImages.length; i++) {
      ImageMagick.read(resizedImages[i], (img) => {
        img.animationDelay = delayCs
        img.animationIterations = 0 // infinite loop
        collection.push(img.clone())
      })
    }

    console.log(`[GENERATE-LINEAGE-GIF] Collection has ${collection.length} frames`)

    const gifData = collection.write(MagickFormat.Gif, (data) => new Uint8Array(data))

    // Dispose collection
    collection.dispose()

    console.log(`[GENERATE-LINEAGE-GIF] GIF generated: ${gifData.length} bytes`)

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
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
