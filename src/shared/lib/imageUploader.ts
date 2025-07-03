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

  const BUCKET_NAME = 'image_uploads';

  // Generate a unique filename to avoid collisions
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  const fileExtension = file.name.split('.').pop();
  const filePath = `files/${timestamp}-${randomString}.${fileExtension}`;

  // Upload directly to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error("Error uploading image to Supabase:", error);
    throw new Error(`Failed to upload image to Supabase: ${error.message}`);
  }

  if (!data || !data.path) {
    throw new Error("Supabase upload did not return a path.");
  }

  // Retrieve the public URL for the newly-uploaded object
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);

  if (!publicUrl) {
    throw new Error('Failed to obtain a public URL for the uploaded image.');
  }

  return publicUrl;
};
