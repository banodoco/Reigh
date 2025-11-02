// Placeholder: Adjust this type according to your actual GenerationRow structure
export interface GenerationRow {
  id: string; // Assuming generation_id is a string, adjust if it's a number or other type
  // Add other relevant properties from your generations table
  imageUrl?: string; // May specifically be for image previews
  thumbUrl?: string;
  location?: string | null;
  type?: string | null;
  createdAt?: string;
  metadata?: Record<string, unknown>; // Added metadata field
  isOptimistic?: boolean;
  shotImageEntryId?: string; // ID from the shot_images table linking shot to generation
  name?: string; // Optional variant name
  timeline_frame?: number; // Position in timeline (from shot_generations table)
  starred?: boolean; // Whether this generation is starred
  upscaled_url?: string | null; // URL of upscaled version if available
  derivedCount?: number; // Number of generations based on this one
  based_on?: string | null; // ID of source generation for lineage tracking (magic edits, variations)
}

export interface Shot {
  id: string;
  name: string;
  images: GenerationRow[]; // This will be populated by joining data
  created_at?: string; // Optional, matches the DB schema
  updated_at?: string | null; // Optional, matches the DB schema
  project_id?: string; // Add project_id here
  aspect_ratio?: string | null; // Aspect ratio for shot video generation
  position: number; // Position for manual ordering
}

export interface ShotImage {
  shot_id: string;
  generation_id: string; // Assuming generation_id is a string. If it's BIGINT, this might be number.
  timeline_frame?: number;
} 