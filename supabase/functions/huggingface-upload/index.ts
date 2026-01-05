// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
// @ts-ignore - HuggingFace Hub types
import { whoAmI, createRepo, uploadFile } from "https://esm.sh/@huggingface/hub@0.18.2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function createResponse(body: object, status: number = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Sanitize a string to be a valid HuggingFace repository name
 */
function sanitizeRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-._]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 96); // HF has a 96 char limit for repo names
}

/**
 * Extract original filename from storage path
 * Format: {user_id}/{uuid}-{original_filename}
 */
function extractOriginalFilename(storagePath: string): string {
  const pathParts = storagePath.split("/");
  const fileNameWithUuid = pathParts[pathParts.length - 1];
  return fileNameWithUuid.includes("-")
    ? fileNameWithUuid.substring(fileNameWithUuid.indexOf("-") + 1)
    : fileNameWithUuid;
}

/**
 * Generate README.md content for the HuggingFace model card
 * Supports both single-stage and multi-stage LoRAs
 */
function generateReadmeContent(
  loraDetails: {
    name: string;
    description?: string;
    baseModel: string;
    triggerWord?: string;
    creatorName?: string;
  },
  loraFiles: {
    single?: string;      // filename for single-stage
    highNoise?: string;   // filename for multi-stage high noise
    lowNoise?: string;    // filename for multi-stage low noise
  },
  repoId: string,
  sampleVideoPaths: string[]
): string {
  let readme = "";

  // YAML frontmatter for HuggingFace model card
  readme += "---\n";
  readme += "tags:\n";
  readme += "- lora\n";
  readme += "- video-generation\n";

  // Add base model tag
  const baseModelLower = loraDetails.baseModel.toLowerCase();
  if (baseModelLower.includes("wan")) {
    readme += "- wan\n";
    if (baseModelLower.includes("i2v")) readme += "- image-to-video\n";
    if (baseModelLower.includes("t2v")) readme += "- text-to-video\n";
    if (baseModelLower.includes("2.2")) readme += "- multi-stage\n";
  } else if (baseModelLower.includes("qwen")) {
    readme += "- qwen\n";
    readme += "- image-generation\n";
  }

  // Widget for video previews
  if (sampleVideoPaths.length > 0) {
    readme += "widget:\n";
    sampleVideoPaths.forEach((videoPath) => {
      readme += `- output:\n`;
      readme += `    url: ${videoPath}\n`;
    });
  }
  readme += "---\n\n";

  // Main content
  readme += `# ${loraDetails.name}\n\n`;
  readme += `This LoRA was uploaded via [Reigh](https://reigh.ai/).\n\n`;

  readme += `## Model Details\n\n`;

  // Show files based on single vs multi-stage
  if (loraFiles.highNoise || loraFiles.lowNoise) {
    // Multi-stage LoRA
    if (loraFiles.highNoise) {
      readme += `**High Noise File:** \`${loraFiles.highNoise}\` ([Download](https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(loraFiles.highNoise)}))\n\n`;
    }
    if (loraFiles.lowNoise) {
      readme += `**Low Noise File:** \`${loraFiles.lowNoise}\` ([Download](https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(loraFiles.lowNoise)}))\n\n`;
    }
  } else if (loraFiles.single) {
    // Single-stage LoRA
    readme += `**File:** \`${loraFiles.single}\` ([Download](https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(loraFiles.single)}))\n\n`;
  }

  readme += `**Base Model:** ${loraDetails.baseModel}\n\n`;

  if (loraDetails.triggerWord) {
    readme += `**Trigger Word:** \`${loraDetails.triggerWord}\`\n\n`;
  }

  if (loraDetails.description) {
    readme += `## Description\n\n`;
    readme += `${loraDetails.description}\n\n`;
  }

  if (loraDetails.creatorName) {
    readme += `## Creator\n\n`;
    readme += `Created by: **${loraDetails.creatorName}**\n\n`;
  }

  if (sampleVideoPaths.length > 0) {
    readme += `## Examples\n\n`;
    sampleVideoPaths.forEach((videoPath, index) => {
      const fileName = videoPath.split("/").pop() || `Example ${index + 1}`;
      readme += `- [${fileName}](./${videoPath})\n`;
    });
    readme += "\n";
  }

  return readme;
}

/**
 * Edge function: huggingface-upload
 *
 * Uploads LoRA files and sample videos to HuggingFace on behalf of the user.
 * Supports both single-stage (one file) and multi-stage (high_noise + low_noise) LoRAs.
 *
 * Flow:
 * 1. Authenticate user via Supabase JWT
 * 2. Retrieve user's HuggingFace token from external_api_keys table
 * 3. Download files from temporary storage bucket
 * 4. Create HF repo and upload files
 * 5. Generate README.md
 * 6. Clean up temporary files
 * 7. Return HuggingFace URLs
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return createResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("[HF-UPLOAD] Missing required environment variables");
    return createResponse({ error: "Server configuration error" }, 500);
  }

  try {
    // Create Supabase client with user's JWT for auth
    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    });

    // Create admin client for storage operations
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error("[HF-UPLOAD] Auth error:", authError);
      return createResponse({ error: "Unauthorized" }, 401);
    }

    console.log(`[HF-UPLOAD] Authenticated user: ${user.id}`);

    // 2. Get user's HuggingFace token (decrypted from Vault)
    const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin.rpc(
      "get_external_api_key_decrypted",
      { p_user_id: user.id, p_service: "huggingface" }
    );

    if (apiKeyError || !apiKeyData || apiKeyData.length === 0) {
      console.error("[HF-UPLOAD] HF token not found:", apiKeyError);
      return createResponse({
        error: "HuggingFace API key not found. Please set up your HuggingFace token first.",
        code: "HF_TOKEN_NOT_FOUND"
      }, 400);
    }

    const hfToken = apiKeyData[0].key_value;
    if (!hfToken) {
      console.error("[HF-UPLOAD] HF token is empty");
      return createResponse({
        error: "HuggingFace API key is empty. Please re-enter your token.",
        code: "HF_TOKEN_EMPTY"
      }, 400);
    }
    console.log("[HF-UPLOAD] Retrieved HF token from Vault");

    // 3. Parse form data
    const formData = await req.formData();

    // Support both new format (loraStoragePaths object) and legacy format (loraStoragePath string)
    const loraStoragePathsRaw = formData.get("loraStoragePaths") as string | null;
    const legacyLoraStoragePath = formData.get("loraStoragePath") as string | null;

    const loraDetailsRaw = formData.get("loraDetails") as string | null;
    const sampleVideosRaw = formData.get("sampleVideos") as string | null;
    const repoNameOverride = formData.get("repoName") as string | null;
    const isPrivate = formData.get("isPrivate") === "true";

    // Parse storage paths - support both formats
    let storagePaths: { single?: string; highNoise?: string; lowNoise?: string };
    if (loraStoragePathsRaw) {
      // New format: JSON object with single/highNoise/lowNoise
      storagePaths = JSON.parse(loraStoragePathsRaw);
    } else if (legacyLoraStoragePath) {
      // Legacy format: single path string
      storagePaths = { single: legacyLoraStoragePath };
    } else {
      return createResponse({ error: "loraStoragePaths or loraStoragePath is required" }, 400);
    }

    // Validate at least one file path is provided
    if (!storagePaths.single && !storagePaths.highNoise && !storagePaths.lowNoise) {
      return createResponse({ error: "At least one LoRA file path is required" }, 400);
    }

    if (!loraDetailsRaw) {
      return createResponse({ error: "loraDetails is required" }, 400);
    }

    const loraDetails = JSON.parse(loraDetailsRaw);
    const sampleVideos: { storagePath: string; originalFileName: string }[] =
      sampleVideosRaw ? JSON.parse(sampleVideosRaw) : [];

    console.log(`[HF-UPLOAD] Processing LoRA: ${loraDetails.name}`);
    console.log(`[HF-UPLOAD] Storage paths: single=${storagePaths.single || 'none'}, highNoise=${storagePaths.highNoise || 'none'}, lowNoise=${storagePaths.lowNoise || 'none'}`);
    console.log(`[HF-UPLOAD] Sample videos: ${sampleVideos.length}`);

    // 4. Get HF username and create repo first (before downloading files)
    const hfUser = await whoAmI({ credentials: { accessToken: hfToken } });
    if (!hfUser.name) {
      return createResponse({ error: "Could not determine HuggingFace username" }, 400);
    }

    const username = hfUser.name;
    const repoName = repoNameOverride || sanitizeRepoName(loraDetails.name);
    const repoId = `${username}/${repoName}`;

    console.log(`[HF-UPLOAD] Creating repo: ${repoId} (private: ${isPrivate})`);

    try {
      await createRepo({
        repo: repoId,
        private: isPrivate,
        credentials: { accessToken: hfToken },
      });
      console.log(`[HF-UPLOAD] Repository created: ${repoId}`);
    } catch (repoError: any) {
      if (!repoError.message?.toLowerCase().includes("already exists")) {
        console.error(`[HF-UPLOAD] Repo creation error:`, repoError);
        throw repoError;
      }
      console.log(`[HF-UPLOAD] Repository already exists: ${repoId}`);
    }

    // 5. Download and upload LoRA file(s)
    const uploadedLoraFiles: { single?: string; highNoise?: string; lowNoise?: string } = {};
    const uploadedLoraUrls: { loraUrl?: string; highNoiseUrl?: string; lowNoiseUrl?: string } = {};
    const pathsToClean: string[] = [];

    // Helper function to download and upload a LoRA file
    async function processLoraFile(storagePath: string, fileType: 'single' | 'highNoise' | 'lowNoise'): Promise<string> {
      console.log(`[HF-UPLOAD] Downloading ${fileType} LoRA from: ${storagePath}`);
      const { data: loraBlob, error: loraDownloadError } = await supabaseAdmin.storage
        .from("temporary")
        .download(storagePath);

      if (loraDownloadError || !loraBlob) {
        console.error(`[HF-UPLOAD] ${fileType} LoRA download error:`, loraDownloadError);
        throw new Error(`Failed to download ${fileType} LoRA from temporary storage`);
      }

      pathsToClean.push(storagePath);

      const originalName = extractOriginalFilename(storagePath);
      const loraFile = new File([loraBlob], originalName, { type: "application/octet-stream" });
      console.log(`[HF-UPLOAD] ${fileType} LoRA file prepared: ${loraFile.name} (${loraFile.size} bytes)`);

      // Upload to HuggingFace
      console.log(`[HF-UPLOAD] Uploading ${fileType} LoRA file...`);
      await uploadFile({
        repo: repoId,
        file: loraFile,
        credentials: { accessToken: hfToken },
      });
      console.log(`[HF-UPLOAD] ${fileType} LoRA file uploaded successfully`);

      return originalName;
    }

    // Process each LoRA file type
    if (storagePaths.single) {
      const filename = await processLoraFile(storagePaths.single, 'single');
      uploadedLoraFiles.single = filename;
      uploadedLoraUrls.loraUrl = `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(filename)}`;
    }

    if (storagePaths.highNoise) {
      const filename = await processLoraFile(storagePaths.highNoise, 'highNoise');
      uploadedLoraFiles.highNoise = filename;
      uploadedLoraUrls.highNoiseUrl = `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(filename)}`;
    }

    if (storagePaths.lowNoise) {
      const filename = await processLoraFile(storagePaths.lowNoise, 'lowNoise');
      uploadedLoraFiles.lowNoise = filename;
      uploadedLoraUrls.lowNoiseUrl = `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(filename)}`;
    }

    // 6. Upload sample videos
    const uploadedVideoPaths: string[] = [];

    for (const video of sampleVideos) {
      try {
        console.log(`[HF-UPLOAD] Downloading video: ${video.storagePath}`);
        const { data: videoBlob, error: videoError } = await supabaseAdmin.storage
          .from("temporary")
          .download(video.storagePath);

        if (videoError || !videoBlob) {
          console.error(`[HF-UPLOAD] Video download error:`, videoError);
          continue;
        }

        pathsToClean.push(video.storagePath);

        const videoFile = new File([videoBlob], video.originalFileName, { type: videoBlob.type });
        const sanitizedFileName = sanitizeRepoName(video.originalFileName);
        const targetPath = `media/${sanitizedFileName}`;

        console.log(`[HF-UPLOAD] Uploading video to: ${targetPath}`);
        await uploadFile({
          repo: repoId,
          file: { path: targetPath, content: videoFile },
          credentials: { accessToken: hfToken },
        });

        uploadedVideoPaths.push(targetPath);
        console.log(`[HF-UPLOAD] Video uploaded: ${targetPath}`);
      } catch (videoUploadError: any) {
        console.error(`[HF-UPLOAD] Video upload error:`, videoUploadError);
        // Continue with other videos
      }
    }

    // 7. Generate and upload README
    console.log(`[HF-UPLOAD] Generating README...`);
    const readmeContent = generateReadmeContent(
      loraDetails,
      uploadedLoraFiles,
      repoId,
      uploadedVideoPaths
    );
    const readmeBlob = new Blob([readmeContent], { type: "text/markdown" });
    const readmeFile = new File([readmeBlob], "README.md", { type: "text/markdown" });

    await uploadFile({
      repo: repoId,
      file: readmeFile,
      credentials: { accessToken: hfToken },
    });
    console.log(`[HF-UPLOAD] README uploaded`);

    // 8. Construct video URLs
    const videoUrls = uploadedVideoPaths.map(
      (path) => `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(path)}`
    );

    // 9. Clean up temporary files
    console.log(`[HF-UPLOAD] Cleaning up ${pathsToClean.length} temporary files...`);

    const { error: cleanupError } = await supabaseAdmin.storage
      .from("temporary")
      .remove(pathsToClean);

    if (cleanupError) {
      console.error("[HF-UPLOAD] Cleanup error:", cleanupError);
      // Don't fail the request for cleanup errors
    } else {
      console.log("[HF-UPLOAD] Cleanup successful");
    }

    console.log(`[HF-UPLOAD] Upload complete. Repo: ${repoId}`);

    return createResponse({
      success: true,
      repoId,
      repoUrl: `https://huggingface.co/${repoId}`,
      ...uploadedLoraUrls,  // loraUrl for single-stage, or highNoiseUrl/lowNoiseUrl for multi-stage
      videoUrls,
    });

  } catch (error: any) {
    console.error("[HF-UPLOAD] Unexpected error:", error);
    return createResponse({
      error: error.message || "An unexpected error occurred",
    }, 500);
  }
});
