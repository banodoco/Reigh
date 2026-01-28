import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Import gifenc from esm.sh for Deno compatibility
import { GIFEncoder, quantize, applyPalette } from "https://esm.sh/gifenc@1.0.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Edge function: generate-lineage-gif
 *
 * Generates an animated GIF from an array of image URLs.
 * This runs server-side to avoid CORS issues with canvas pixel reading.
 *
 * POST /functions/v1/generate-lineage-gif
 * Body: {
 *   imageUrls: string[],  // Array of image URLs to include in the GIF
 *   frameDelay?: number,  // Milliseconds between frames (default: 800)
 *   width?: number,       // Output width (default: 512)
 * }
 *
 * Returns:
 * - 200 OK with GIF as binary data (Content-Type: image/gif)
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
    const { imageUrls, frameDelay = 800, width = 512 } = await req.json()

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'imageUrls array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[GENERATE-LINEAGE-GIF] Processing ${imageUrls.length} images`)

    // Fetch and decode all images
    const images: ImageBitmap[] = []
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i]
      console.log(`[GENERATE-LINEAGE-GIF] Fetching image ${i + 1}/${imageUrls.length}: ${url.substring(0, 60)}...`)

      try {
        const response = await fetch(url)
        if (!response.ok) {
          console.error(`[GENERATE-LINEAGE-GIF] Failed to fetch image ${i}: ${response.status}`)
          continue
        }

        const arrayBuffer = await response.arrayBuffer()
        const blob = new Blob([arrayBuffer])
        const bitmap = await createImageBitmap(blob)
        images.push(bitmap)

        console.log(`[GENERATE-LINEAGE-GIF] Image ${i + 1} loaded: ${bitmap.width}x${bitmap.height}`)
      } catch (err) {
        console.error(`[GENERATE-LINEAGE-GIF] Error loading image ${i}:`, err)
      }
    }

    if (images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images could be loaded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Calculate height based on first image aspect ratio
    const firstImage = images[0]
    const aspectRatio = firstImage.width / firstImage.height
    const height = Math.round(width / aspectRatio)

    console.log(`[GENERATE-LINEAGE-GIF] Output size: ${width}x${height}, ${images.length} frames`)

    // Create canvas for rendering frames
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    // Initialize GIF encoder
    const gif = GIFEncoder()

    // Process each image
    for (let i = 0; i < images.length; i++) {
      const img = images[i]

      // Fill background with black
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)

      // Calculate scaling to fit while maintaining aspect ratio
      const imgAspect = img.width / img.height
      const targetAspect = width / height

      let drawWidth: number
      let drawHeight: number
      let drawX: number
      let drawY: number

      if (imgAspect > targetAspect) {
        // Image is wider - fit to width
        drawWidth = width
        drawHeight = width / imgAspect
        drawX = 0
        drawY = (height - drawHeight) / 2
      } else {
        // Image is taller - fit to height
        drawHeight = height
        drawWidth = height * imgAspect
        drawX = (width - drawWidth) / 2
        drawY = 0
      }

      // Draw image to canvas
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

      // Get image data
      const imageData = ctx.getImageData(0, 0, width, height)
      const { data } = imageData

      // Convert RGBA to RGB array for gifenc
      const rgbData = new Uint8Array(width * height * 3)
      for (let j = 0; j < width * height; j++) {
        rgbData[j * 3] = data[j * 4]
        rgbData[j * 3 + 1] = data[j * 4 + 1]
        rgbData[j * 3 + 2] = data[j * 4 + 2]
      }

      // Quantize colors to 256-color palette
      const palette = quantize(rgbData, 256)
      const indexedPixels = applyPalette(rgbData, palette)

      // Add frame with specified delay (gifenc uses centiseconds)
      gif.writeFrame(indexedPixels, width, height, {
        palette,
        delay: frameDelay / 10, // Convert ms to centiseconds
      })

      console.log(`[GENERATE-LINEAGE-GIF] Encoded frame ${i + 1}/${images.length}`)
    }

    // Finish encoding
    gif.finish()

    // Get the GIF data
    const gifBytes = gif.bytes()

    console.log(`[GENERATE-LINEAGE-GIF] GIF generated: ${gifBytes.length} bytes`)

    // Return GIF as binary response
    return new Response(gifBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/gif',
        'Content-Length': gifBytes.length.toString(),
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
