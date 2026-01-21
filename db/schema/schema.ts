import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const taskStatus = pgEnum('task_status', ['Queued', 'In Progress', 'Complete', 'Failed', 'Cancelled']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  apiKeys: jsonb('api_keys'),
  settings: jsonb('settings'),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  aspectRatio: text('aspect_ratio'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settings: jsonb('settings'),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  taskType: text('task_type').notNull(),
  params: jsonb('params').notNull(),
  status: taskStatus('status').default('Queued').notNull(),
  dependantOn: uuid('dependant_on').array(),  // Array of task IDs this task depends on
  outputLocation: text('output_location'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  generationProcessedAt: timestamp('generation_processed_at', { withTimezone: true }),
  workerId: uuid('worker_id'),
  costInCredits: text('cost_in_credits'),
  generationCreated: boolean('generation_created').default(false).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  errorMessage: text('error_message'),
});

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tasks: jsonb('tasks'), // Array of task IDs that created this generation
  params: jsonb('params'), // Generation parameters and metadata (synced from primary variant)
  location: text('location'), // URL/path to the generated content (synced from primary variant)
  type: text('type'), // 'image', 'video', etc.
  thumbnailUrl: text('thumbnail_url'), // URL to thumbnail (synced from primary variant)
  name: text('name'), // Optional variant name (e.g., "high-contrast", "style-test-1")
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  starred: boolean('starred').default(false).notNull(),
  basedOn: uuid('based_on').references((): any => generations.id),
  // NOTE: upscaled_url removed - use generation_variants with variant_type='upscaled' instead
  
  // Parent-child relationship support (e.g., travel segments)
  parentGenerationId: uuid('parent_generation_id').references((): any => generations.id, { onDelete: 'cascade' }),
  childOrder: integer('child_order'), // Position in sequence (0, 1, 2, ...)
  isChild: boolean('is_child').default(false).notNull(), // Quick filter for child generations
  children: jsonb('children'), // Denormalized cache: [{id: uuid, order: int}, ...]
  
  // Variants support - points to the currently active variant
  primaryVariantId: uuid('primary_variant_id'), // References generation_variants(id) - can't use .references() due to circular dep
});

// Generation variants - stores individual outputs for each generation
// Each generation can have multiple variants (original, upscaled, edited, etc.)
// One variant is marked as primary and its data is synced to the parent generation
export const generationVariants = pgTable('generation_variants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  generationId: uuid('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),
  
  // Core output data
  location: text('location').notNull(), // URL to the variant content
  thumbnailUrl: text('thumbnail_url'), // Thumbnail for this variant
  params: jsonb('params'), // Generation parameters for this specific variant
  
  // Variant classification
  isPrimary: boolean('is_primary').default(false).notNull(), // Only one per generation
  variantType: text('variant_type'), // Flexible: 'original', 'upscaled', 'edit', etc.
  name: text('name'), // Human-readable name
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const shots = pgTable('shots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  settings: jsonb('settings'),
  position: integer('position').notNull().default(1), // Position for manual ordering
});

export const shotGenerations = pgTable('shot_generations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  shotId: uuid('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  generationId: uuid('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),
  position: integer('position'), // Now nullable to allow unpositioned associations
});

export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
