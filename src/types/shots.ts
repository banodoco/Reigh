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
}

export interface Shot {
  id: string;
  name: string;
  images: GenerationRow[]; // This will be populated by joining data
  created_at?: string; // Optional, matches the DB schema
  updated_at?: string | null; // Optional, matches the DB schema
  project_id?: string; // Add project_id here
}

export interface ShotImage {
  shot_id: string;
  generation_id: string; // Assuming generation_id is a string. If it's BIGINT, this might be number.
  position?: number;
} 