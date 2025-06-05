import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads an image file.
 * In local development, it sends the file to a local server endpoint.
 * Otherwise, it uploads to Supabase storage.
 * Returns the public URL of the uploaded image.
 */
export const uploadImageToStorage = async (file: File): Promise<string> => {
  if (!file) {
    throw new Error("No file provided");
  }

  // Check if in development environment (Vite specific)
  if (import.meta.env.DEV) {
    // Local development: send to a local server endpoint
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/local-image-upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error occurred" }));
        throw new Error(`Failed to upload image locally: ${response.statusText} - ${errorData.message}`);
      }

      const result = await response.json();
      if (!result.url) {
        throw new Error("Local upload endpoint did not return a URL.");
      }
      // Ensure the local dev path is also treated as a relative path
      // If result.url starts with a leading slash, it's fine. If not, consider context.
      // For now, assuming result.url is already a suitable relative path like /uploads/images/filename.png
      return result.url; 
    } catch (error) {
      console.error("Error uploading image locally:", error);
      throw new Error(`Failed to upload image locally: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Production or other environments: upload to Supabase
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(2, 10);
    const fileExtension = file.name.split('.').pop();
    // Add 'files/' prefix to the fileName for Supabase uploads
    const fileName = `files/${timestamp}-${randomString}.${fileExtension}`;

    const { data, error } = await supabase.storage
      .from('image_uploads') // This is the bucket name
      .upload(fileName, file, { // fileName here is the path within the bucket
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error("Error uploading image to Supabase:", error);
      throw new Error(`Failed to upload image to Supabase: ${error.message}`);
    }

    if (!data || !data.path) {
      throw new Error("Supabase upload did not return a path.");
    }

    // data.path is the path within the bucket, e.g., "files/your-generated-name.png"
    // This is the relative path we want to store.
    return data.path;
  }
};
