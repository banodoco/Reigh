// PostgreSQL schema for Supabase - Documentation & Seeding Only
// This file serves as living documentation and provides types for seeding
// All database queries use Supabase client directly

import { pgTable, text, uuid, timestamp, integer, pgEnum, jsonb, boolean, numeric, decimal } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// --- ENUMS ---
export const taskStatusEnum = pgEnum('task_status', ['Queued', 'In Progress', 'Complete', 'Failed', 'Cancelled']);
export const creditLedgerTypeEnum = pgEnum('credit_ledger_type', ['stripe', 'manual', 'spend', 'refund']);

// --- Canonical Schema for PostgreSQL ---

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  apiKeys: jsonb('api_keys'), // Store API keys as JSONB
  settings: jsonb('settings'), // Store tool settings as JSONB
  onboarding: jsonb('onboarding').default('{}').notNull(), // Store onboarding progress as JSONB
  credits: numeric('credits', { precision: 10, scale: 3 }).default('0').notNull(), // Cached credit balance - supports fractional values
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  aspectRatio: text('aspect_ratio'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settings: jsonb('settings'), // Store project-level settings as JSONB
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  taskType: text('task_type').notNull(),
  params: jsonb('params').notNull(),
  status: taskStatusEnum('status').default('Queued').notNull(),
  dependantOn: uuid('dependant_on'),
  outputLocation: text('output_location'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  generationProcessedAt: timestamp('generation_processed_at', { withTimezone: true }),
  costCents: decimal('cost_cents', { precision: 10, scale: 2 }),
  generationStartedAt: timestamp('generation_started_at', { withTimezone: true }),
  generationCreated: boolean('generation_created').default(false).notNull(),
});

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tasks: jsonb('tasks'), // Array of task IDs that created this generation
  params: jsonb('params'), // Generation parameters and metadata
  location: text('location'), // URL/path to the generated content
  type: text('type'), // 'image', 'video', etc.
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});

export const shots = pgTable('shots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  settings: jsonb('settings'), // Store tool settings as JSONB
});

export const shotGenerations = pgTable('shot_generations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  shotId: uuid('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  generationId: uuid('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),
  position: integer('position'), // Now nullable to allow unpositioned associations
});

export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull(),
  metadata: jsonb('metadata'),
});

export const creditsLedger = pgTable('credits_ledger', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 10, scale: 3 }).notNull(), // Support fractional credits
  type: creditLedgerTypeEnum('type').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
});

export const taskCostConfigs = pgTable('task_cost_configs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  taskType: text('task_type').notNull(),
  baseCostPerSecond: numeric('base_cost_per_second', { precision: 10, scale: 6 }).notNull(), // Cost per second in dollars
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const userApiTokens = pgTable('user_api_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  metadata: jsonb('metadata').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Training data tables
export const trainingDataBatches = pgTable('training_data_batches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const trainingData = pgTable('training_data', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  batchId: uuid('batch_id').notNull().references(() => trainingDataBatches.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  url: text('url').notNull(),
});

export const trainingDataSegments = pgTable('training_data_segments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  videoId: uuid('video_id').notNull().references(() => trainingData.id, { onDelete: 'cascade' }),
  startTime: integer('start_time').notNull(),
  endTime: integer('end_time').notNull(),
});

// --- RELATIONS (For Drizzle Relational Queries - Documentation Only) ---

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  creditsLedger: many(creditsLedger),
  userApiTokens: many(userApiTokens),
  resources: many(resources),
  trainingDataBatches: many(trainingDataBatches),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  tasks: many(tasks),
  generations: many(generations),
  shots: many(shots),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
}));

export const generationsRelations = relations(generations, ({ one, many }) => ({
  project: one(projects, {
    fields: [generations.projectId],
    references: [projects.id],
  }),
  shotGenerations: many(shotGenerations),
}));

export const shotsRelations = relations(shots, ({ one, many }) => ({
  project: one(projects, {
    fields: [shots.projectId],
    references: [projects.id],
  }),
  shotGenerations: many(shotGenerations),
}));

export const shotGenerationsRelations = relations(shotGenerations, ({ one }) => ({
  shot: one(shots, {
    fields: [shotGenerations.shotId],
    references: [shots.id],
  }),
  generation: one(generations, {
    fields: [shotGenerations.generationId],
    references: [generations.id],
  }),
}));

export const creditsLedgerRelations = relations(creditsLedger, ({ one }) => ({
  user: one(users, {
    fields: [creditsLedger.userId],
    references: [users.id],
  }),
}));

export const userApiTokensRelations = relations(userApiTokens, ({ one }) => ({
  user: one(users, {
    fields: [userApiTokens.userId],
    references: [users.id],
  }),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  user: one(users, {
    fields: [resources.userId],
    references: [users.id],
  }),
}));

export const trainingDataBatchesRelations = relations(trainingDataBatches, ({ one, many }) => ({
  user: one(users, {
    fields: [trainingDataBatches.userId],
    references: [users.id],
  }),
  trainingData: many(trainingData),
}));

export const trainingDataRelations = relations(trainingData, ({ one, many }) => ({
  batch: one(trainingDataBatches, {
    fields: [trainingData.batchId],
    references: [trainingDataBatches.id],
  }),
  segments: many(trainingDataSegments),
}));

export const trainingDataSegmentsRelations = relations(trainingDataSegments, ({ one }) => ({
  video: one(trainingData, {
    fields: [trainingDataSegments.videoId],
    references: [trainingData.id],
  }),
}));

// --- INDEXES (For Performance Documentation) ---
// Indexes are created in Supabase migrations, documented here for reference:

// --- TYPE EXPORTS (For TypeScript Usage) ---

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;

export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;

export type ShotGeneration = typeof shotGenerations.$inferSelect;
export type NewShotGeneration = typeof shotGenerations.$inferInsert;

export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;

export type CreditLedger = typeof creditsLedger.$inferSelect;
export type NewCreditLedger = typeof creditsLedger.$inferInsert;

export type TaskCostConfig = typeof taskCostConfigs.$inferSelect;
export type NewTaskCostConfig = typeof taskCostConfigs.$inferInsert;

export type UserApiToken = typeof userApiTokens.$inferSelect;
export type NewUserApiToken = typeof userApiTokens.$inferInsert;

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;

export type TrainingDataBatch = typeof trainingDataBatches.$inferSelect;
export type NewTrainingDataBatch = typeof trainingDataBatches.$inferInsert;

export type TrainingData = typeof trainingData.$inferSelect;
export type NewTrainingData = typeof trainingData.$inferInsert;

export type TrainingDataSegment = typeof trainingDataSegments.$inferSelect;
export type NewTrainingDataSegment = typeof trainingDataSegments.$inferInsert; 