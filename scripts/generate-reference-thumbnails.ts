#!/usr/bin/env tsx
/**
 * Migration Script: Generate Thumbnails for Style References
 * 
 * Generates and uploads thumbnails for all style-reference resources
 * that don't have thumbnails yet (or have thumbnails same as original)
 * 
 * Usage: npx tsx scripts/generate-reference-thumbnails.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';
import sharp from 'sharp';
import fetch from 'node-fetch';

// Load environment variables from both .env and .env.local
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.local', override: true });

// Initialize Supabase client
const MAIN_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const MAIN_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!MAIN_SUPABASE_URL || !MAIN_SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing main Supabase credentials');
  console.error('Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env');
  process.exit(1);
}

// Use service role key to bypass RLS
const mainSupabase = createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface StyleReferenceMetadata {
  name: string;
  styleReferenceImage: string;
  styleReferenceImageOriginal: string;
  thumbnailUrl?: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: 'style' | 'subject' | 'style-character' | 'scene' | 'custom';
  styleBoostTerms?: string;
  is_public: boolean;
  created_by: {
    is_you: boolean;
    username?: string;
  };
  updatedAt: string;
}

interface Resource {
  id: string;
  user_id: string;
  type: string;
  metadata: StyleReferenceMetadata;
  created_at: string;
}

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate thumbnail using sharp (Node.js image processing)
 */
async function generateThumbnail(imageBuffer: Buffer, maxSize: number = 300): Promise<Buffer> {
  // Use sharp to resize the image
  const thumbnail = await sharp(imageBuffer)
    .resize(maxSize, maxSize, {
      fit: 'inside', // Maintain aspect ratio
      withoutEnlargement: true // Don't enlarge smaller images
    })
    .jpeg({
      quality: 80,
      progressive: true
    })
    .toBuffer();
  
  return thumbnail;
}

/**
 * Upload thumbnail to Supabase storage
 */
async function uploadThumbnail(thumbnailBuffer: Buffer, resourceId: string): Promise<string> {
  const timestamp = Date.now();
  const thumbnailFilename = `thumb_${resourceId}_${timestamp}.jpg`;
  const thumbnailPath = `files/thumbnails/${thumbnailFilename}`;
  
  const { data: uploadData, error: uploadError } = await mainSupabase.storage
    .from('image_uploads')
    .upload(thumbnailPath, thumbnailBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    });
  
  if (uploadError) {
    throw new Error(`Failed to upload thumbnail: ${uploadError.message}`);
  }
  
  const { data: urlData } = mainSupabase.storage
    .from('image_uploads')
    .getPublicUrl(thumbnailPath);
  
  return urlData.publicUrl;
}

async function generateThumbnailsForReferences() {
  console.log('🚀 Starting thumbnail generation for style references...\n');

  try {
    // Fetch all style-reference resources
    console.log('📥 Fetching style-reference resources from database...');
    const { data: resources, error: fetchError } = await mainSupabase
      .from('resources')
      .select('*')
      .eq('type', 'style-reference');

    if (fetchError) {
      throw new Error(`Failed to fetch resources: ${fetchError.message}`);
    }

    if (!resources || resources.length === 0) {
      console.log('⚠️  No style-reference resources found');
      return;
    }

    console.log(`✅ Found ${resources.length} style-reference resources\n`);

    // Filter resources that need thumbnails
    const resourcesNeedingThumbnails = resources.filter((r: Resource) => {
      const metadata = r.metadata as StyleReferenceMetadata;
      const needsThumbnail = 
        !metadata.thumbnailUrl || 
        metadata.thumbnailUrl === metadata.styleReferenceImageOriginal;
      
      return needsThumbnail;
    });

    console.log(`🎯 ${resourcesNeedingThumbnails.length} resources need thumbnails\n`);

    if (resourcesNeedingThumbnails.length === 0) {
      console.log('✅ All resources already have thumbnails!');
      return;
    }

    // Process each resource
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < resourcesNeedingThumbnails.length; i++) {
      const resource = resourcesNeedingThumbnails[i] as Resource;
      const metadata = resource.metadata as StyleReferenceMetadata;
      const progress = `[${i + 1}/${resourcesNeedingThumbnails.length}]`;

      try {
        console.log(`${progress} 📸 Processing: ${metadata.name}`);
        
        // Download original image
        console.log(`${progress}   ⬇️  Downloading original image...`);
        const imageBuffer = await downloadImage(metadata.styleReferenceImageOriginal);
        console.log(`${progress}   ✅ Downloaded (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
        
        // Generate thumbnail
        console.log(`${progress}   🔄 Generating thumbnail...`);
        const thumbnailBuffer = await generateThumbnail(imageBuffer, 300);
        console.log(`${progress}   ✅ Generated thumbnail (${(thumbnailBuffer.length / 1024).toFixed(2)} KB)`);
        
        // Upload thumbnail
        console.log(`${progress}   ⬆️  Uploading thumbnail...`);
        const thumbnailUrl = await uploadThumbnail(thumbnailBuffer, resource.id);
        console.log(`${progress}   ✅ Uploaded to: ${thumbnailUrl}`);
        
        // Update resource metadata
        console.log(`${progress}   💾 Updating resource metadata...`);
        const updatedMetadata = {
          ...metadata,
          thumbnailUrl: thumbnailUrl
        };
        
        const { error: updateError } = await mainSupabase
          .from('resources')
          .update({ metadata: updatedMetadata })
          .eq('id', resource.id);
        
        if (updateError) {
          console.error(`${progress}   ❌ Failed to update metadata:`, updateError.message);
          failed++;
        } else {
          console.log(`${progress}   ✅ Successfully added thumbnail!`);
          processed++;
        }
        
        // Rate limiting: wait a bit between batches
        if ((i + 1) % 5 === 0) {
          console.log(`${progress}   ⏸️  Pausing for rate limiting...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(''); // Empty line for readability
      } catch (error) {
        console.error(`${progress} ❌ Error processing resource:`, error);
        failed++;
        console.log(''); // Empty line for readability
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Thumbnail Generation Summary:');
    console.log(`   Total resources needing thumbnails: ${resourcesNeedingThumbnails.length}`);
    console.log(`   ✅ Processed successfully: ${processed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('='.repeat(60) + '\n');

    if (failed > 0) {
      console.log('⚠️  Some thumbnails failed to generate. Review the errors above.');
      process.exit(1);
    } else {
      console.log('🎉 All thumbnails generated successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Fatal error during thumbnail generation:', error);
    process.exit(1);
  }
}

// Run the migration
generateThumbnailsForReferences();



