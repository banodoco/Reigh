#!/usr/bin/env tsx
/**
 * Migration Script: Dataset to Resources
 * 
 * Migrates style reference images from dataset_contents (dataset_id=1) 
 * to the resources table with type='style-reference'
 * 
 * Usage: npx tsx scripts/migrate-dataset-to-resources.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables from both .env and .env.local
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.local', override: true });

// Initialize Supabase clients
const MAIN_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const MAIN_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Dataset database credentials (with hardcoded defaults from datasetClient.ts)
const DATASET_SUPABASE_URL = process.env.VITE_DATASET_SUPABASE_URL || 'https://ujlwuvkrxlvoswwkerdf.supabase.co';
const DATASET_SUPABASE_ANON_KEY = process.env.VITE_DATASET_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbHd1dmtyeGx2b3N3d2tlcmRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxNjQ5MTYsImV4cCI6MjA2Mzc0MDkxNn0.156-RCR2I9wIbgsrVg6VhEh4WHysS27EB-XR2jLqtAA';

if (!MAIN_SUPABASE_URL || !MAIN_SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing main Supabase credentials');
  console.error('Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env');
  process.exit(1);
}

// Use service role key to bypass RLS for migration
const mainSupabase = createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
const datasetSupabase = createClient(DATASET_SUPABASE_URL, DATASET_SUPABASE_ANON_KEY);

interface DatasetImage {
  id: number;
  dataset_id: number;
  filename: string;
  storage_url: string;
  style_reference?: string;
  prompt?: string;
  generation_prompt?: string;
  params?: string;
  width?: number;
  height?: number;
  size_category?: string;
  orientation?: string;
  character_reference?: string;
  scene_reference?: string;
  review_status: string;
  based_on?: string;
  created_at: string;
  updated_at: string;
}

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

// Map reference mode based on dataset fields
function inferReferenceMode(image: DatasetImage): 'style' | 'subject' | 'style-character' | 'scene' | 'custom' {
  if (image.scene_reference) return 'scene';
  if (image.character_reference) return 'style-character';
  if (image.style_reference) return 'style';
  return 'custom';
}

// Create a name from filename or prompt
function createName(image: DatasetImage): string {
  if (image.prompt && image.prompt.length > 0) {
    // Use first 50 chars of prompt
    return image.prompt.substring(0, 50).trim();
  }
  if (image.filename) {
    // Remove extension and clean up
    return image.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  }
  return `Reference ${image.id}`;
}

// Extract subject description
function extractSubjectDescription(image: DatasetImage): string {
  if (image.character_reference) return image.character_reference;
  if (image.prompt) return image.prompt;
  if (image.generation_prompt) return image.generation_prompt;
  return '';
}

async function migrateDatasetToResources() {
  console.log('🚀 Starting migration from dataset_contents to resources...\n');

  try {
    // Step 0: Get a user_id to assign these resources to
    console.log('🔍 Finding user to assign public resources to...');
    const { data: users, error: userError } = await mainSupabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (userError || !users || users.length === 0) {
      throw new Error('Could not find a user in the database. Please create a user first.');
    }
    
    const SYSTEM_USER_ID = users[0].id;
    console.log(`✅ Using user ID: ${SYSTEM_USER_ID}\n`);
    
    // Step 1: Get total count first
    console.log('📥 Fetching total count from dataset_contents (dataset_id=1)...');
    const { count: totalCount, error: countError } = await datasetSupabase
      .from('dataset_contents')
      .select('*', { count: 'exact', head: true })
      .eq('dataset_id', 1)
      .eq('review_status', 'approved');

    if (countError) {
      throw new Error(`Failed to get count: ${countError.message}`);
    }

    if (!totalCount || totalCount === 0) {
      console.log('⚠️  No approved images found in dataset');
      return;
    }

    console.log(`✅ Found ${totalCount} total approved images in dataset\n`);

    // Fetch in batches to handle large datasets
    const BATCH_SIZE = 1000;
    const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
    let allDatasetImages: DatasetImage[] = [];

    console.log(`📦 Fetching images in ${totalBatches} batch(es) of ${BATCH_SIZE}...\n`);

    for (let batch = 0; batch < totalBatches; batch++) {
      const offset = batch * BATCH_SIZE;
      console.log(`   Fetching batch ${batch + 1}/${totalBatches} (offset: ${offset})...`);
      
      const { data: batchData, error: fetchError } = await datasetSupabase
        .from('dataset_contents')
        .select('*')
        .eq('dataset_id', 1)
        .eq('review_status', 'approved')
        .order('created_at', { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (fetchError) {
        throw new Error(`Failed to fetch batch ${batch + 1}: ${fetchError.message}`);
      }

      if (batchData && batchData.length > 0) {
        allDatasetImages = allDatasetImages.concat(batchData);
        console.log(`   ✅ Fetched ${batchData.length} images (total so far: ${allDatasetImages.length})`);
      }
    }

    console.log(`\n✅ Successfully fetched all ${allDatasetImages.length} images\n`);
    
    const datasetImages = allDatasetImages;

    // Step 2: Check which ones already exist in resources
    console.log('🔍 Checking for existing resources...');
    const { data: existingResources, error: existingError } = await mainSupabase
      .from('resources')
      .select('metadata')
      .eq('type', 'style-reference');

    if (existingError) {
      console.error('⚠️  Could not check existing resources:', existingError.message);
    }

    const existingUrls = new Set(
      (existingResources || [])
        .map((r: any) => r.metadata?.styleReferenceImageOriginal)
        .filter(Boolean)
    );

    console.log(`Found ${existingUrls.size} existing style references\n`);

    // Step 3: Migrate each image
    console.log('📤 Starting migration...\n');
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < datasetImages.length; i++) {
      const image = datasetImages[i] as DatasetImage;
      const progress = `[${i + 1}/${datasetImages.length}]`;

      // Skip if already migrated
      if (existingUrls.has(image.storage_url)) {
        console.log(`${progress} ⏭️  Skipping (already exists): ${image.filename}`);
        skipped++;
        continue;
      }

      try {
        // Create metadata object
        const metadata: StyleReferenceMetadata = {
          name: createName(image),
          styleReferenceImage: image.storage_url, // Processed URL
          styleReferenceImageOriginal: image.storage_url, // Original URL (same for dataset)
          thumbnailUrl: image.storage_url, // Use same URL for thumbnail (could be optimized later)
          styleReferenceStrength: 0.5, // Default values
          subjectStrength: 0.5,
          subjectDescription: extractSubjectDescription(image),
          inThisScene: false,
          inThisSceneStrength: 0.5,
          referenceMode: inferReferenceMode(image),
          styleBoostTerms: image.style_reference || '',
          is_public: true, // Dataset images are public
          created_by: {
            is_you: false,
            username: 'dataset',
          },
          updatedAt: image.updated_at || image.created_at,
        };

        // Insert into resources table
        const { error: insertError } = await mainSupabase
          .from('resources')
          .insert({
            type: 'style-reference',
            metadata: metadata,
            user_id: SYSTEM_USER_ID,
            created_at: image.created_at,
          });

        if (insertError) {
          console.error(`${progress} ❌ Failed to create resource for ${image.filename}:`, insertError.message);
          failed++;
        } else {
          console.log(`${progress} ✅ Created: ${metadata.name}`);
          created++;
        }

        // Rate limiting: wait a bit between batches
        if ((i + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`${progress} ❌ Error processing ${image.filename}:`, error);
        failed++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   Total images: ${datasetImages.length}`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped (already exist): ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('='.repeat(60) + '\n');

    if (failed > 0) {
      console.log('⚠️  Some migrations failed. Review the errors above.');
      process.exit(1);
    } else {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Fatal error during migration:', error);
    process.exit(1);
  }
}

// Run the migration
migrateDatasetToResources();

