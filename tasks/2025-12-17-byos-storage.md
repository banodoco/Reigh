# BYOS (Bring Your Own Storage) Implementation

## Overview

Allow users to optionally provide their own S3-compatible storage credentials (primarily Cloudflare R2) for storing generated media. Default remains Supabase storage for users who don't configure custom storage.

**Goals:**
- Data sovereignty - users control where their media lives
- Cost reduction - users pay for their own storage, reducing your costs
- Zero-egress benefits - R2 has no egress fees

---

## Complete Upload Audit

Before implementing, we must understand ALL places where files are uploaded to storage.

### Client-Side Uploads (Browser → Storage)

| File | Function | What It Uploads | How It Works |
|------|----------|-----------------|--------------|
| `src/shared/lib/imageUploader.ts` | `uploadImageToStorage()` | User-uploaded images | Direct XHR to Supabase Storage API |
| `src/shared/lib/videoUploader.ts` | `uploadVideoToStorage()` | User-uploaded videos | Direct XHR to Supabase Storage API |
| `src/shared/lib/clientThumbnailGenerator.ts` | `uploadImageWithThumbnail()` | Image + generated thumbnail | Calls `imageUploader` + direct upload |

**Key insight**: All client-side uploads go through Supabase's REST API directly. For BYOS, we need to either:
- A) Route through a new edge function that handles S3 uploads, OR
- B) Use browser-based S3 SDK (adds bundle size), OR
- C) Generate pre-signed S3 URLs and upload directly (recommended)

### Edge Function Uploads (Server → Storage)

| File | Function | What It Uploads | Called By |
|------|----------|-----------------|-----------|
| `supabase/functions/complete_task/storage.ts` | `handleStorageOperations()` | Task outputs (images/videos) | Workers completing tasks |
| `supabase/functions/trim-video/index.ts` | `uploadToStorage()` | Trimmed video files | Client request |
| `supabase/functions/generate-thumbnail/index.ts` | Direct upload | Server-generated thumbnails | Task completion trigger |

### Pre-Signed URL Generation

| File | Purpose | Impact on BYOS |
|------|---------|----------------|
| `supabase/functions/generate-upload-url/index.ts` | Creates signed URLs for workers | **Critical** - must generate S3 pre-signed URLs instead |

### Shared Storage Path Utilities

| File | Purpose |
|------|---------|
| `src/shared/lib/storagePaths.ts` | Client-side path generation |
| `supabase/functions/_shared/storagePaths.ts` | Server-side path generation (duplicated) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                                                                              │
│  ┌─────────────────────┐   ┌─────────────────────────────────────────────┐  │
│  │  Storage Settings   │   │  Upload Components                          │  │
│  │  - Provider select  │   │  ┌─────────────┐ ┌─────────────┐            │  │
│  │  - Credentials      │   │  │ imageUploader│ │videoUploader│            │  │
│  │  - Test connection  │   │  └──────┬──────┘ └──────┬──────┘            │  │
│  └──────────┬──────────┘   │         │               │                   │  │
│             │              │         └───────┬───────┘                   │  │
│             │              │                 ▼                            │  │
│             │              │  ┌─────────────────────────────┐            │  │
│             │              │  │ getUploadDestination()      │            │  │
│             │              │  │ - Check user storage config │            │  │
│             │              │  │ - Route to Supabase or S3   │            │  │
│             │              │  └──────────────┬──────────────┘            │  │
│             │              └─────────────────┼───────────────────────────┘  │
└─────────────┼────────────────────────────────┼──────────────────────────────┘
              │                                │
              │ Save config                    │ Upload
              ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  users.storage_config (jsonb, encrypted)                             │   │
│  │  {provider, endpoint, bucket, accessKeyId, secretAccessKey, ...}     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              │ Read config
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDGE FUNCTIONS                                     │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
│  │ test-storage-     │  │ generate-upload-  │  │ get-upload-           │   │
│  │ connection        │  │ url               │  │ destination (NEW)     │   │
│  │                   │  │                   │  │                       │   │
│  │ Validates creds   │  │ Pre-signed URLs   │  │ Returns upload config │   │
│  │ before saving     │  │ for workers       │  │ for client uploads    │   │
│  └───────────────────┘  └───────────────────┘  └───────────────────────┘   │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
│  │ complete_task     │  │ trim-video        │  │ generate-thumbnail    │   │
│  │                   │  │                   │  │                       │   │
│  │ Task completion   │  │ Video trimming    │  │ Thumbnail generation  │   │
│  │ uploads           │  │ output upload     │  │ upload                │   │
│  └─────────┬─────────┘  └─────────┬─────────┘  └───────────┬───────────┘   │
│            │                      │                        │               │
│            └──────────────────────┼────────────────────────┘               │
│                                   ▼                                         │
│            ┌─────────────────────────────────────────────┐                 │
│            │  _shared/storageAdapter.ts (NEW)            │                 │
│            │  - getStorageConfig(userId)                 │                 │
│            │  - uploadToStorage(config, data, path)      │                 │
│            │  - getPublicUrl(config, path)               │                 │
│            │  - createSignedUploadUrl(config, path)      │                 │
│            └─────────────────────┬───────────────────────┘                 │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STORAGE BACKENDS                                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ Supabase        │  │ Cloudflare R2   │  │ Other S3-Compatible         │ │
│  │ Storage         │  │                 │  │ (B2, Spaces, MinIO)         │ │
│  │ (default)       │  │ (recommended)   │  │                             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema & Types

### Task 1.1: Migration - Add storage_config column

**File**: `supabase/migrations/20251217000000_add_storage_config.sql`

```sql
-- Add storage_config column to users table for BYOS (Bring Your Own Storage)
-- This allows users to configure their own S3-compatible storage

ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_config jsonb;

-- Add comment documenting the expected structure
COMMENT ON COLUMN users.storage_config IS 
'Optional S3-compatible storage configuration for BYOS. Structure:
{
  "provider": "r2" | "s3" | "b2" | "spaces",
  "accountId": "cloudflare-account-id",      -- R2 only, used to generate endpoint
  "endpoint": "https://xxx.r2.cloudflarestorage.com",
  "bucket": "bucket-name",
  "accessKeyId": "...",
  "secretAccessKey": "...",                  -- Should be encrypted via Vault
  "region": "auto",                          -- S3 only
  "pathPrefix": "optional/prefix/",          -- Namespace within bucket
  "publicUrlBase": "https://pub-xxx.r2.dev" -- For generating public URLs
}';

-- Partial index for users with custom storage (fast lookup)
CREATE INDEX IF NOT EXISTS idx_users_has_storage_config 
ON users ((storage_config IS NOT NULL)) 
WHERE storage_config IS NOT NULL;
```

### Task 1.2: TypeScript Types (Frontend)

**File**: `src/shared/lib/storageTypes.ts`

```typescript
/**
 * BYOS (Bring Your Own Storage) type definitions
 * Used by both frontend and edge functions (duplicated in _shared/)
 */

export type StorageProvider = 'r2' | 's3' | 'b2' | 'spaces';

export interface StorageConfig {
  provider: StorageProvider;
  accountId?: string;        // R2/B2: used to generate endpoint
  endpoint: string;          // Full S3-compatible endpoint URL
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;   // Encrypted at rest, never returned to frontend after save
  region?: string;           // S3: required, others: 'auto'
  pathPrefix?: string;       // Optional namespace within bucket
  publicUrlBase?: string;    // Base URL for public file access
}

// For frontend display (credentials masked)
export interface StorageConfigDisplay {
  provider: StorageProvider;
  accountId?: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;       // Shown in UI
  hasSecretKey: boolean;     // Indicates if key is configured
  region?: string;
  pathPrefix?: string;
  publicUrlBase?: string;
}

// Provider-specific endpoint generators
export const PROVIDER_ENDPOINTS: Record<StorageProvider, (id: string) => string> = {
  r2: (accountId) => `https://${accountId}.r2.cloudflarestorage.com`,
  s3: (region) => `https://s3.${region}.amazonaws.com`,
  b2: (keyId) => `https://s3.us-west-004.backblazeb2.com`, // Region varies
  spaces: (region) => `https://${region}.digitaloceanspaces.com`,
};

// Default regions for each provider
export const PROVIDER_DEFAULTS: Record<StorageProvider, { region: string }> = {
  r2: { region: 'auto' },
  s3: { region: 'us-east-1' },
  b2: { region: 'us-west-004' },
  spaces: { region: 'nyc3' },
};
```

### Task 1.3: TypeScript Types (Edge Functions)

**File**: `supabase/functions/_shared/storageTypes.ts`

```typescript
/**
 * BYOS type definitions for Edge Functions
 * Keep in sync with src/shared/lib/storageTypes.ts
 */

export type StorageProvider = 'r2' | 's3' | 'b2' | 'spaces';

export interface StorageConfig {
  provider: StorageProvider;
  accountId?: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  pathPrefix?: string;
  publicUrlBase?: string;
}
```

---

## Phase 2: Shared S3 Client & Storage Adapter (Edge Functions)

### Task 2.1: S3 Client Wrapper

**File**: `supabase/functions/_shared/s3Client.ts`

```typescript
/**
 * S3-compatible client for BYOS uploads
 * Uses aws4fetch for request signing (works in Deno)
 */

import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

export interface S3ClientConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export class S3Client {
  private client: AwsClient;
  private endpoint: string;

  constructor(config: S3ClientConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, ''); // Remove trailing slash
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region || 'auto',
      service: 's3',
    });
  }

  /**
   * Upload an object to S3
   */
  async putObject(
    bucket: string, 
    key: string, 
    body: Uint8Array | ArrayBuffer, 
    contentType: string
  ): Promise<void> {
    const url = `${this.endpoint}/${bucket}/${key}`;
    console.log(`[S3Client] PUT ${url} (${body.byteLength} bytes, ${contentType})`);
    
    const response = await this.client.fetch(url, {
      method: 'PUT',
      body,
      headers: { 
        'Content-Type': contentType,
        'Content-Length': body.byteLength.toString(),
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[S3Client] Upload failed: ${response.status}`, errorText);
      throw new Error(`S3 upload failed: ${response.status} - ${errorText}`);
    }
    
    console.log(`[S3Client] Upload successful`);
  }

  /**
   * Check if an object exists
   */
  async headObject(bucket: string, key: string): Promise<boolean> {
    const url = `${this.endpoint}/${bucket}/${key}`;
    const response = await this.client.fetch(url, { method: 'HEAD' });
    return response.ok;
  }

  /**
   * Delete an object
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    const url = `${this.endpoint}/${bucket}/${key}`;
    const response = await this.client.fetch(url, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed: ${response.status}`);
    }
  }

  /**
   * Generate a pre-signed PUT URL for direct uploads
   * Note: aws4fetch doesn't support pre-signed URLs directly,
   * so we construct them manually using AWS Signature V4
   */
  async createSignedUploadUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    // For R2 and most S3-compatible services, we need to generate
    // a presigned URL. This is a simplified version.
    const url = `${this.endpoint}/${bucket}/${key}`;
    
    // The aws4fetch library signs requests, not URLs.
    // For pre-signed URLs, we need to use a different approach.
    // This will be implemented using the AWS SDK pattern.
    
    // For now, return the endpoint - actual implementation will use
    // proper presigned URL generation
    throw new Error('createSignedUploadUrl not yet implemented - use putObject instead');
  }
}
```

### Task 2.2: Shared Storage Adapter

**File**: `supabase/functions/_shared/storageAdapter.ts`

```typescript
/**
 * Unified storage adapter for BYOS
 * All edge functions should use this for storage operations
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client } from './s3Client.ts';
import { StorageConfig } from './storageTypes.ts';
import { MEDIA_BUCKET } from './storagePaths.ts';

declare const Deno: any;

export interface StorageUploadResult {
  publicUrl: string;
  objectPath: string;
}

/**
 * Get user's storage configuration from database
 */
export async function getStorageConfig(
  supabase: SupabaseClient,
  userId: string
): Promise<StorageConfig | null> {
  const { data: user, error } = await supabase
    .from('users')
    .select('storage_config')
    .eq('id', userId)
    .single();

  if (error) {
    console.error(`[StorageAdapter] Error fetching storage config:`, error);
    return null;
  }

  if (!user?.storage_config) {
    return null;
  }

  return user.storage_config as StorageConfig;
}

/**
 * Upload data to storage (BYOS-aware)
 * Automatically routes to user's S3 or default Supabase storage
 */
export async function uploadToStorage(
  supabase: SupabaseClient,
  userId: string,
  data: Uint8Array | ArrayBuffer,
  path: string,
  contentType: string,
  storageConfig?: StorageConfig | null
): Promise<StorageUploadResult> {
  // Get config if not provided
  const config = storageConfig ?? await getStorageConfig(supabase, userId);

  if (config) {
    // Use user's S3-compatible storage
    return uploadWithS3(config, data, path, contentType);
  }

  // Default: use Supabase storage
  return uploadWithSupabase(supabase, data, path, contentType);
}

/**
 * Upload to user's S3-compatible storage
 */
async function uploadWithS3(
  config: StorageConfig,
  data: Uint8Array | ArrayBuffer,
  path: string,
  contentType: string
): Promise<StorageUploadResult> {
  const client = new S3Client({
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
  });

  // Apply path prefix if configured
  const objectPath = config.pathPrefix 
    ? `${config.pathPrefix.replace(/\/$/, '')}/${path}`
    : path;

  console.log(`[StorageAdapter] Uploading to S3: ${config.provider}/${config.bucket}/${objectPath}`);
  
  const dataArray = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  await client.putObject(config.bucket, objectPath, dataArray, contentType);

  // Generate public URL
  const publicUrl = config.publicUrlBase
    ? `${config.publicUrlBase.replace(/\/$/, '')}/${objectPath}`
    : `${config.endpoint}/${config.bucket}/${objectPath}`;

  console.log(`[StorageAdapter] S3 upload complete: ${publicUrl}`);
  
  return { publicUrl, objectPath };
}

/**
 * Upload to default Supabase storage
 */
async function uploadWithSupabase(
  supabase: SupabaseClient,
  data: Uint8Array | ArrayBuffer,
  path: string,
  contentType: string
): Promise<StorageUploadResult> {
  console.log(`[StorageAdapter] Uploading to Supabase: ${MEDIA_BUCKET}/${path}`);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, data, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error(`[StorageAdapter] Supabase upload error:`, uploadError);
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(path);

  console.log(`[StorageAdapter] Supabase upload complete: ${urlData.publicUrl}`);
  
  return { publicUrl: urlData.publicUrl, objectPath: path };
}

/**
 * Get public URL for a stored file (BYOS-aware)
 */
export function getPublicUrl(
  supabase: SupabaseClient,
  path: string,
  storageConfig?: StorageConfig | null
): string {
  // If path is already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (storageConfig) {
    const objectPath = storageConfig.pathPrefix
      ? `${storageConfig.pathPrefix.replace(/\/$/, '')}/${path}`
      : path;
    
    return storageConfig.publicUrlBase
      ? `${storageConfig.publicUrlBase.replace(/\/$/, '')}/${objectPath}`
      : `${storageConfig.endpoint}/${storageConfig.bucket}/${objectPath}`;
  }

  // Default: Supabase URL
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Clean up a file from storage (BYOS-aware)
 */
export async function deleteFromStorage(
  supabase: SupabaseClient,
  userId: string,
  path: string,
  storageConfig?: StorageConfig | null
): Promise<void> {
  const config = storageConfig ?? await getStorageConfig(supabase, userId);

  if (config) {
    const client = new S3Client({
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
    });

    const objectPath = config.pathPrefix
      ? `${config.pathPrefix.replace(/\/$/, '')}/${path}`
      : path;

    await client.deleteObject(config.bucket, objectPath);
    console.log(`[StorageAdapter] Deleted from S3: ${objectPath}`);
  } else {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    console.log(`[StorageAdapter] Deleted from Supabase: ${path}`);
  }
}
```

---

## Phase 3: Update All Edge Functions

### Task 3.1: Update complete_task/storage.ts

**File**: `supabase/functions/complete_task/storage.ts`

**Changes needed:**
1. Import shared storage adapter
2. Replace direct Supabase calls with adapter calls
3. Pass userId to enable BYOS lookup

```typescript
// Add import at top
import { 
  getStorageConfig, 
  uploadToStorage, 
  getPublicUrl,
  deleteFromStorage 
} from '../_shared/storageAdapter.ts';
import type { StorageConfig } from '../_shared/storageTypes.ts';

// Modify handleStorageOperations signature to accept pre-fetched config
export async function handleStorageOperations(
  supabase: any,
  parsedRequest: ParsedRequest,
  userId: string,
  isServiceRole: boolean,
  storageConfig?: StorageConfig | null  // NEW: optional pre-fetched config
): Promise<StorageResult> {
  // Get storage config if not provided
  const config = storageConfig ?? await getStorageConfig(supabase, userId);
  
  if (config) {
    console.log(`[Storage] Using BYOS: ${config.provider} for user ${userId}`);
  }

  let publicUrl: string;
  let objectPath: string;
  let thumbnailUrl: string | null = null;

  if (parsedRequest.storagePath) {
    // MODE 3/4: File already in storage - get public URL
    objectPath = parsedRequest.storagePath;
    publicUrl = getPublicUrl(supabase, objectPath, config);
    console.log(`[Storage] MODE 3/4: Retrieved public URL: ${publicUrl}`);

    if (parsedRequest.thumbnailStoragePath) {
      thumbnailUrl = getPublicUrl(supabase, parsedRequest.thumbnailStoragePath, config);
      console.log(`[Storage] MODE 3/4: Retrieved thumbnail URL: ${thumbnailUrl}`);
    }
  } else {
    // MODE 1: Upload file from base64
    const effectiveContentType = parsedRequest.fileContentType || getContentType(parsedRequest.filename);
    objectPath = `${userId}/${parsedRequest.filename}`;

    console.log(`[Storage] MODE 1: Uploading to ${objectPath}`);
    
    const result = await uploadToStorage(
      supabase,
      userId,
      parsedRequest.fileData as Uint8Array,
      objectPath,
      effectiveContentType,
      config
    );
    
    publicUrl = result.publicUrl;
    objectPath = result.objectPath;

    // Handle thumbnail
    thumbnailUrl = await handleThumbnail(supabase, parsedRequest, userId, publicUrl, config);
  }

  return { publicUrl, objectPath, thumbnailUrl };
}

// Update handleThumbnail to use adapter
async function handleThumbnail(
  supabase: any,
  parsedRequest: ParsedRequest,
  userId: string,
  mainFileUrl: string,
  storageConfig?: StorageConfig | null
): Promise<string | null> {
  if (parsedRequest.thumbnailData && parsedRequest.thumbnailFilename) {
    console.log(`[Storage] Uploading provided thumbnail`);
    try {
      const thumbnailPath = `${userId}/thumbnails/${parsedRequest.thumbnailFilename}`;
      const contentType = parsedRequest.thumbnailContentType || getContentType(parsedRequest.thumbnailFilename);
      
      const result = await uploadToStorage(
        supabase,
        userId,
        parsedRequest.thumbnailData as Uint8Array,
        thumbnailPath,
        contentType,
        storageConfig
      );
      
      console.log(`[Storage] Thumbnail uploaded: ${result.publicUrl}`);
      return result.publicUrl;
    } catch (error) {
      console.error("[Storage] Error processing thumbnail:", error);
      return null;
    }
  }

  // Auto-generate thumbnail for images
  const contentType = getContentType(parsedRequest.filename);
  if (contentType.startsWith("image/") && parsedRequest.fileData) {
    return await generateThumbnail(supabase, parsedRequest.fileData, userId, mainFileUrl, storageConfig);
  }

  return null;
}

// Update generateThumbnail to use adapter
async function generateThumbnail(
  supabase: any,
  sourceBytes: Uint8Array,
  userId: string,
  fallbackUrl: string,
  storageConfig?: StorageConfig | null
): Promise<string | null> {
  // ... existing resize logic ...
  
  // Replace direct upload with adapter
  const thumbPath = `${userId}/thumbnails/${thumbFilename}`;
  
  try {
    const result = await uploadToStorage(
      supabase,
      userId,
      thumbBytes,
      thumbPath,
      'image/jpeg',
      storageConfig
    );
    
    console.log(`[ThumbnailGen] ✅ Auto-generated thumbnail: ${result.publicUrl}`);
    return result.publicUrl;
  } catch (error) {
    console.error('[ThumbnailGen] Upload error:', error);
    console.log(`[ThumbnailGen] Using fallback - main image URL as thumbnail: ${fallbackUrl}`);
    return fallbackUrl;
  }
}

// Update cleanupFile to use adapter
export async function cleanupFile(
  supabase: any,
  userId: string,
  objectPath: string,
  storageConfig?: StorageConfig | null
): Promise<void> {
  try {
    await deleteFromStorage(supabase, userId, objectPath, storageConfig);
    console.log(`[Storage] Cleaned up file: ${objectPath}`);
  } catch (error) {
    console.error(`[Storage] Failed to cleanup file:`, error);
  }
}
```

### Task 3.2: Update trim-video/index.ts

**File**: `supabase/functions/trim-video/index.ts`

**Changes needed:**
- Import storage adapter
- Replace `uploadToStorage` function with adapter call

```typescript
// Add imports
import { getStorageConfig, uploadToStorage as adapterUpload } from '../_shared/storageAdapter.ts';
import type { StorageConfig } from '../_shared/storageTypes.ts';

// Replace the uploadToStorage function:
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  videoBuffer: ArrayBuffer,
  userId: string,
  projectId: string,
  contentType: string = 'video/mp4'
): Promise<string> {
  // Generate storage path
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const extension = contentType.includes('mp4') ? 'mp4' : 'webm';
  const filename = `trimmed_${timestamp}_${randomStr}.${extension}`;
  const uploadPath = storagePaths.upload(userId, filename);

  console.log(`[TRIM-VIDEO] Uploading to storage: ${uploadPath}`);
  console.log(`[TRIM-VIDEO] Size: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  // Get user's storage config for BYOS
  const storageConfig = await getStorageConfig(supabase, userId);

  const result = await adapterUpload(
    supabase,
    userId,
    new Uint8Array(videoBuffer),
    uploadPath,
    contentType,
    storageConfig
  );

  console.log(`[TRIM-VIDEO] Uploaded: ${result.publicUrl}`);
  return result.publicUrl;
}
```

### Task 3.3: Update generate-thumbnail/index.ts

**File**: `supabase/functions/generate-thumbnail/index.ts`

**Changes needed:**
- Import storage adapter
- Replace direct Supabase upload with adapter

```typescript
// Add imports
import { getStorageConfig, uploadToStorage } from '../_shared/storageAdapter.ts';
import type { StorageConfig } from '../_shared/storageTypes.ts';

// In the serve handler, after creating supabase client:
const storageConfig = await getStorageConfig(supabase, user_id);

// Replace the upload section:
const thumbnailFilename = generateThumbnailFilename();
const thumbnailPath = storagePaths.thumbnail(user_id, thumbnailFilename);

console.log(`[GENERATE-THUMBNAIL] Uploading thumbnail to: ${thumbnailPath}`);

// Convert blob to Uint8Array for adapter
const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
const thumbnailData = new Uint8Array(thumbnailArrayBuffer);

const result = await uploadToStorage(
  supabase,
  user_id,
  thumbnailData,
  thumbnailPath,
  'image/jpeg',
  storageConfig
);

const thumbnailUrl = result.publicUrl;
```

### Task 3.4: Update generate-upload-url/index.ts

**File**: `supabase/functions/generate-upload-url/index.ts`

This is **critical** - workers use pre-signed URLs to upload directly. For BYOS, we need to generate S3 pre-signed URLs.

**Changes needed:**
- Check user's storage config
- If BYOS: generate S3 pre-signed URL
- If not: use existing Supabase signed URL logic

```typescript
// Add imports
import { getStorageConfig } from '../_shared/storageAdapter.ts';
import { S3Client } from '../_shared/s3Client.ts';
import type { StorageConfig } from '../_shared/storageTypes.ts';

// In the handler, after determining userId:
const storageConfig = await getStorageConfig(supabaseAdmin, userId);

if (storageConfig) {
  // BYOS: Generate S3 pre-signed URL
  console.log(`[GENERATE-UPLOAD-URL] Using BYOS: ${storageConfig.provider}`);
  
  // For S3-compatible storage, we need to generate a presigned URL
  // This requires implementing proper AWS Signature V4 presigning
  // or using the S3 SDK
  
  const objectPath = storageConfig.pathPrefix
    ? `${storageConfig.pathPrefix}${taskStoragePath}`
    : taskStoragePath;
  
  // NOTE: aws4fetch doesn't support presigned URLs directly
  // We'll need to implement this or use @aws-sdk/s3-request-presigner
  // For now, return the path and let workers use the credentials directly
  
  const response = {
    upload_url: null,  // Workers will need to use S3 client directly
    storage_path: objectPath,
    bucket: storageConfig.bucket,
    endpoint: storageConfig.endpoint,
    use_s3_client: true,  // Signal to worker to use S3 client
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  
  // ... similar for thumbnail URL
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

// Existing Supabase signed URL logic for non-BYOS users...
```

**Note**: The generate-upload-url function has complexity because S3 pre-signed URLs require proper AWS Signature V4. Options:
1. Add `@aws-sdk/s3-request-presigner` to edge functions
2. Have workers use S3 credentials directly (less secure but simpler)
3. Route worker uploads through a new edge function (more latency)

---

## Phase 4: Test Connection Endpoint

### Task 4.1: Create test-storage-connection function

**File**: `supabase/functions/test-storage-connection/index.ts`

```typescript
/**
 * Edge function: test-storage-connection
 * 
 * Tests S3-compatible storage credentials before saving.
 * Uploads a small test file, verifies it exists, then deletes it.
 * 
 * POST /functions/v1/test-storage-connection
 * Headers: Authorization: Bearer <user-jwt>
 * Body: {
 *   provider: "r2" | "s3" | "b2" | "spaces",
 *   endpoint: string,
 *   bucket: string,
 *   accessKeyId: string,
 *   secretAccessKey: string,
 *   region?: string
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client } from '../_shared/s3Client.ts';

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Authentication required' 
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Parse request
    const { provider, endpoint, bucket, accessKeyId, secretAccessKey, region } = await req.json();

    // Validate required fields
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: endpoint, bucket, accessKeyId, secretAccessKey' 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`[TEST-CONNECTION] Testing ${provider} storage: ${endpoint}/${bucket}`);

    // Create S3 client
    const client = new S3Client({
      endpoint,
      accessKeyId,
      secretAccessKey,
      region: region || 'auto',
    });

    // Test 1: Upload a small test file
    const testKey = `.reigh-connection-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const testData = new TextEncoder().encode(JSON.stringify({
      test: true,
      timestamp: new Date().toISOString(),
      provider,
    }));

    console.log(`[TEST-CONNECTION] Uploading test file: ${testKey}`);
    await client.putObject(bucket, testKey, testData, 'application/json');

    // Test 2: Verify file exists
    console.log(`[TEST-CONNECTION] Verifying file exists`);
    const exists = await client.headObject(bucket, testKey);
    if (!exists) {
      throw new Error('File upload succeeded but verification failed');
    }

    // Test 3: Clean up test file
    console.log(`[TEST-CONNECTION] Cleaning up test file`);
    await client.deleteObject(bucket, testKey);

    console.log(`[TEST-CONNECTION] ✅ All tests passed for ${provider}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Connection successful',
      provider,
      bucket,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[TEST-CONNECTION] Error:', error);
    
    // Parse common S3 errors for user-friendly messages
    let userMessage = error.message || 'Connection failed';
    
    if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
      userMessage = 'Access denied - check your Access Key ID and Secret Access Key';
    } else if (error.message?.includes('404') || error.message?.includes('NoSuchBucket')) {
      userMessage = 'Bucket not found - verify the bucket name exists';
    } else if (error.message?.includes('InvalidAccessKeyId')) {
      userMessage = 'Invalid Access Key ID';
    } else if (error.message?.includes('SignatureDoesNotMatch')) {
      userMessage = 'Invalid Secret Access Key';
    } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo')) {
      userMessage = 'Could not reach endpoint - check the endpoint URL';
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: userMessage,
      details: error.message,
    }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

---

## Phase 5: Client-Side Changes

### Task 5.1: Create useStorageConfig hook

**File**: `src/shared/hooks/useStorageConfig.ts`

```typescript
/**
 * Hook for managing user's BYOS storage configuration
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/shared/hooks/useAuth';
import type { StorageConfig, StorageConfigDisplay } from '@/shared/lib/storageTypes';

export function useStorageConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch current config (without secret key)
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['storage-config', user?.id],
    queryFn: async (): Promise<StorageConfigDisplay | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('users')
        .select('storage_config')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      if (!data?.storage_config) return null;

      // Return display version (no secret key)
      const cfg = data.storage_config as StorageConfig;
      return {
        provider: cfg.provider,
        accountId: cfg.accountId,
        endpoint: cfg.endpoint,
        bucket: cfg.bucket,
        accessKeyId: cfg.accessKeyId,
        hasSecretKey: !!cfg.secretAccessKey,
        region: cfg.region,
        pathPrefix: cfg.pathPrefix,
        publicUrlBase: cfg.publicUrlBase,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Test connection mutation
  const testConnection = useMutation({
    mutationFn: async (testConfig: Omit<StorageConfig, 'secretAccessKey'> & { secretAccessKey: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-storage-connection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(testConfig),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Connection test failed');
      }
      return result;
    },
  });

  // Save config mutation
  const saveConfig = useMutation({
    mutationFn: async (newConfig: StorageConfig) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('users')
        .update({ storage_config: newConfig })
        .eq('id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-config', user?.id] });
    },
  });

  // Remove config mutation
  const removeConfig = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('users')
        .update({ storage_config: null })
        .eq('id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-config', user?.id] });
    },
  });

  return {
    config,
    isLoading,
    error,
    testConnection,
    saveConfig,
    removeConfig,
    hasCustomStorage: !!config,
  };
}
```

### Task 5.2: Create get-upload-destination endpoint

**File**: `supabase/functions/get-upload-destination/index.ts`

For client-side uploads, we need to tell the client where to upload.

```typescript
/**
 * Edge function: get-upload-destination
 * 
 * Returns upload configuration for client-side uploads.
 * If user has BYOS, returns S3 credentials for direct upload.
 * Otherwise, returns Supabase storage info.
 * 
 * POST /functions/v1/get-upload-destination
 * Headers: Authorization: Bearer <user-jwt>
 * Body: { filename: string, contentType: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStorageConfig } from '../_shared/storageAdapter.ts';
import { storagePaths, generateUniqueFilename, getFileExtension, MEDIA_BUCKET } from '../_shared/storagePaths.ts';

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { filename, contentType } = await req.json();

    // Generate storage path
    const ext = getFileExtension(filename, contentType);
    const uniqueFilename = generateUniqueFilename(ext);
    const storagePath = storagePaths.upload(user.id, uniqueFilename);

    // Check for BYOS config
    const storageConfig = await getStorageConfig(supabase, user.id);

    if (storageConfig) {
      // Return S3 configuration for direct upload
      // NOTE: Returning credentials to client is a security consideration
      // Alternative: generate short-lived presigned URL server-side
      
      const objectPath = storageConfig.pathPrefix
        ? `${storageConfig.pathPrefix}${storagePath}`
        : storagePath;

      return new Response(JSON.stringify({
        type: 's3',
        endpoint: storageConfig.endpoint,
        bucket: storageConfig.bucket,
        objectPath,
        accessKeyId: storageConfig.accessKeyId,
        secretAccessKey: storageConfig.secretAccessKey, // Security concern - see note
        region: storageConfig.region || 'auto',
        publicUrlBase: storageConfig.publicUrlBase,
        contentType,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return Supabase storage info
    return new Response(JSON.stringify({
      type: 'supabase',
      bucket: MEDIA_BUCKET,
      storagePath,
      contentType,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[GET-UPLOAD-DESTINATION] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
```

### Task 5.3: Create unified upload utility

**File**: `src/shared/lib/storageUploader.ts`

```typescript
/**
 * Unified upload utility that handles both Supabase and BYOS S3 uploads
 */

import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/integrations/supabase/config/env';

export interface UploadResult {
  publicUrl: string;
  storagePath: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Get upload destination from server (determines Supabase vs S3)
 */
async function getUploadDestination(filename: string, contentType: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/get-upload-destination`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ filename, contentType }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get upload destination');
  }

  return response.json();
}

/**
 * Upload to S3-compatible storage using XMLHttpRequest for progress
 */
async function uploadToS3(
  destination: any,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  // For S3, we need to use AWS SDK or construct signed request
  // This is a simplified version using fetch (no progress)
  
  // In production, you'd use @aws-sdk/client-s3 or similar
  // For now, we'll use a basic PUT request
  
  const { AwsClient } = await import('aws4fetch');
  
  const client = new AwsClient({
    accessKeyId: destination.accessKeyId,
    secretAccessKey: destination.secretAccessKey,
    region: destination.region || 'auto',
    service: 's3',
  });

  const url = `${destination.endpoint}/${destination.bucket}/${destination.objectPath}`;
  
  // Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();
  
  const response = await client.fetch(url, {
    method: 'PUT',
    body: fileBuffer,
    headers: {
      'Content-Type': destination.contentType,
      'Content-Length': file.size.toString(),
    },
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status}`);
  }

  // Generate public URL
  const publicUrl = destination.publicUrlBase
    ? `${destination.publicUrlBase}/${destination.objectPath}`
    : `${destination.endpoint}/${destination.bucket}/${destination.objectPath}`;

  return {
    publicUrl,
    storagePath: destination.objectPath,
  };
}

/**
 * Upload to Supabase storage using XMLHttpRequest for progress
 */
async function uploadToSupabase(
  destination: any,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const bucketUrl = `${SUPABASE_URL}/storage/v1/object/${destination.bucket}/${destination.storagePath}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data } = supabase.storage
          .from(destination.bucket)
          .getPublicUrl(destination.storagePath);
        
        resolve({
          publicUrl: data.publicUrl,
          storagePath: destination.storagePath,
        });
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', bucketUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Main upload function - automatically routes to correct storage
 */
export async function uploadFile(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  // Get upload destination from server
  const destination = await getUploadDestination(file.name, file.type);

  if (destination.type === 's3') {
    return uploadToS3(destination, file, onProgress);
  } else {
    return uploadToSupabase(destination, file, onProgress);
  }
}
```

### Task 5.4: Update existing uploaders

**File**: `src/shared/lib/imageUploader.ts`

```typescript
// Option 1: Replace entire implementation with storageUploader
import { uploadFile, UploadResult } from './storageUploader';

export const uploadImageToStorage = async (
  file: File,
  maxRetries: number = 3,
  onProgress?: (progress: number) => void
): Promise<string> => {
  if (!file) throw new Error("No file provided");

  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await uploadFile(file, (progress) => {
        onProgress?.(progress.percent);
      });
      return result.publicUrl;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  
  throw lastError || new Error('Upload failed');
};
```

**File**: `src/shared/lib/videoUploader.ts`

```typescript
// Similar update to use storageUploader
import { uploadFile } from './storageUploader';

export const uploadVideoToStorage = async (
  file: File,
  projectId: string,  // Kept for backwards compat
  shotId: string,     // Kept for backwards compat
  onProgress?: (progress: number) => void,
  maxRetries: number = 3
): Promise<string> => {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await uploadFile(file, (progress) => {
        onProgress?.(progress.percent);
      });
      return result.publicUrl;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  throw lastError || new Error('Upload failed');
};
```

### Task 5.5: Update clientThumbnailGenerator.ts

**File**: `src/shared/lib/clientThumbnailGenerator.ts`

```typescript
// Update uploadImageWithThumbnail to use storageUploader
import { uploadFile } from './storageUploader';

export async function uploadImageWithThumbnail(
  originalFile: File,
  thumbnailBlob: Blob,
  userId: string,
  onProgress?: (progress: number) => void
): Promise<{imageUrl: string, thumbnailUrl: string}> {
  // Upload original image (90% of progress)
  const imageResult = await uploadFile(originalFile, (progress) => {
    onProgress?.(Math.round(progress.percent * 0.9));
  });

  onProgress?.(90);

  // Upload thumbnail (10% of progress)
  const thumbnailFile = new File([thumbnailBlob], 'thumbnail.jpg', { type: 'image/jpeg' });
  const thumbnailResult = await uploadFile(thumbnailFile, (progress) => {
    onProgress?.(90 + Math.round(progress.percent * 0.1));
  });

  onProgress?.(100);

  return {
    imageUrl: imageResult.publicUrl,
    thumbnailUrl: thumbnailResult.publicUrl,
  };
}
```

---

## Phase 6: Frontend Settings UI

### Task 6.1: StorageSettings Component

**Directory**: `src/shared/components/StorageSettings/`

```
StorageSettings/
├── index.tsx                    -- Main export + container
├── StorageSettingsForm.tsx      -- Form fields
├── ProviderSelector.tsx         -- Provider dropdown with icons
├── ProviderGuide.tsx            -- Setup instructions
├── ConnectionTestButton.tsx     -- Test button with states
└── RemoveStorageDialog.tsx      -- Confirmation dialog
```

### Task 6.2: Integration Point

Add to account settings (wherever that currently lives - likely a modal or settings page).

---

## Complete Files List

### New Files to Create

| File | Phase | Description |
|------|-------|-------------|
| `supabase/migrations/20251217000000_add_storage_config.sql` | 1 | Database migration |
| `src/shared/lib/storageTypes.ts` | 1 | Frontend TypeScript types |
| `supabase/functions/_shared/storageTypes.ts` | 1 | Edge function types |
| `supabase/functions/_shared/s3Client.ts` | 2 | S3 client wrapper |
| `supabase/functions/_shared/storageAdapter.ts` | 2 | Shared storage adapter |
| `supabase/functions/test-storage-connection/index.ts` | 4 | Connection test endpoint |
| `supabase/functions/get-upload-destination/index.ts` | 5 | Upload routing endpoint |
| `src/shared/lib/storageUploader.ts` | 5 | Unified client uploader |
| `src/shared/hooks/useStorageConfig.ts` | 5 | Storage config hook |
| `src/shared/components/StorageSettings/` | 6 | UI components (multiple files) |

### Existing Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `supabase/functions/complete_task/storage.ts` | 3 | Use storage adapter |
| `supabase/functions/trim-video/index.ts` | 3 | Use storage adapter |
| `supabase/functions/generate-thumbnail/index.ts` | 3 | Use storage adapter |
| `supabase/functions/generate-upload-url/index.ts` | 3 | Support S3 presigned URLs |
| `src/shared/lib/imageUploader.ts` | 5 | Use storageUploader |
| `src/shared/lib/videoUploader.ts` | 5 | Use storageUploader |
| `src/shared/lib/clientThumbnailGenerator.ts` | 5 | Use storageUploader |
| `src/shared/lib/storagePaths.ts` | 5 | Add URL helper function |

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Credential storage | Encrypt `secretAccessKey` using Supabase Vault |
| Credential in transit | Always use HTTPS, credentials only sent to edge functions |
| Credential exposure | Never return full credentials after initial save; mask in UI |
| Client-side credentials | `get-upload-destination` returns credentials - consider presigned URLs instead |
| Invalid credentials | Always test connection before saving |
| Rate limiting | Rate limit test-connection endpoint |
| Audit trail | Log storage config changes |

---

## Testing Checklist

### Basic Flow
- [ ] New user with no config → uploads go to Supabase
- [ ] User opens storage settings → form is empty
- [ ] User enters R2 credentials → test connection works
- [ ] User saves config → config persisted in DB
- [ ] User creates generation (task completion) → file goes to R2
- [ ] User uploads image directly → file goes to R2
- [ ] User uploads video directly → file goes to R2
- [ ] User views generation → URL resolves from R2
- [ ] User trims video → trimmed video goes to R2
- [ ] Thumbnails → generated thumbnails go to R2

### Error Cases
- [ ] Invalid credentials → test connection fails with clear error
- [ ] Invalid bucket → test connection fails
- [ ] User removes config → falls back to Supabase
- [ ] R2 temporarily unavailable → graceful error handling
- [ ] Existing files (pre-BYOS) → continue to work (URLs are absolute)

### Edge Cases
- [ ] User changes provider mid-project → new files go to new storage
- [ ] Large file upload → progress tracking works
- [ ] Concurrent uploads → no race conditions
- [ ] Session expiry during upload → handled gracefully

---

## Rollout Strategy

1. **Phase A: Backend only** (no user-facing changes)
   - Deploy migration (adds column, no behavior change)
   - Deploy edge function updates (with fallback to Supabase)
   - Test internally with manual DB config

2. **Phase B: Internal testing**
   - Enable settings UI for internal users only
   - Test full flow with real R2 buckets
   - Monitor for errors

3. **Phase C: Beta release**
   - Enable for select users who requested the feature
   - Gather feedback

4. **Phase D: General availability**
   - Enable for all users
   - Add documentation/help articles

---

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1: Database & Types | 1.1, 1.2, 1.3 | 1 hr |
| Phase 2: S3 Client & Adapter | 2.1, 2.2 | 3 hrs |
| Phase 3: Update Edge Functions | 3.1, 3.2, 3.3, 3.4 | 4 hrs |
| Phase 4: Test Connection | 4.1 | 1 hr |
| Phase 5: Client-Side | 5.1, 5.2, 5.3, 5.4, 5.5 | 5 hrs |
| Phase 6: Settings UI | 6.1, 6.2 | 4 hrs |
| Testing & Polish | - | 3 hrs |

**Total: ~21 hours (~3 days)**

---

## Open Questions / Decisions Needed

1. **Credential handling for client uploads**: The `get-upload-destination` endpoint returns S3 credentials to the client. Alternatives:
   - Generate presigned URLs server-side (more secure, more latency)
   - Use a proxy endpoint for all uploads (more secure, more complexity)
   - Accept client-side credential usage (current plan, simpler)

2. **Worker uploads via generate-upload-url**: Workers currently use Supabase presigned URLs. For BYOS:
   - Implement proper S3 presigned URL generation (requires AWS SDK)
   - Have workers store credentials and upload directly (security concern)
   - Route worker uploads through edge function (latency concern)

3. **Credential encryption**: Use Supabase Vault or application-level encryption?

4. **Feature flag**: Hide behind a flag initially?

5. **Pricing implications**: Does BYOS affect user pricing tiers?
