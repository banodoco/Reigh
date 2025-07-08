// PostgreSQL schema for Supabase

import { pgTable, text, uuid, timestamp, integer, index, pgEnum, jsonb } from 'drizzle-orm/pg-core';
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
  credits: integer('credits').default(0).notNull(), // Cached credit balance
});

export const creditsLedger = pgTable('credits_ledger', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id'), // nullable for top-ups
  amount: integer('amount').notNull(), // positive = top-up, negative = spend
  type: creditLedgerTypeEnum('type').notNull(),
  metadata: jsonb('metadata'), // Store additional data (stripe session, reason, etc.)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Indexes for better query performance
  userIdIdx: index('idx_credits_ledger_user_id').on(table.userId),
  typeIdx: index('idx_credits_ledger_type').on(table.type),
  createdAtIdx: index('idx_credits_ledger_created_at').on(table.createdAt),
}));

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  aspectRatio: text('aspect_ratio'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settings: jsonb('settings'), // Store tool settings as JSONB
});

// Type for updating projects, allowing optional fields
export type ProjectUpdate = {
  name?: string;
  aspectRatio?: string;
};

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
}, (table) => ({
  // Indexes for better query performance
  statusCreatedIdx: index('idx_status_created').on(table.status, table.createdAt),
  dependantOnIdx: index('idx_dependant_on').on(table.dependantOn),
  projectStatusIdx: index('idx_project_status').on(table.projectId, table.status),
}));

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tasks: jsonb('tasks'), // Storing array as JSONB
  params: jsonb('params'),
  location: text('location'),
  type: text('type'),
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
  position: integer('position').default(0).notNull(),
});

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'lora'
  metadata: jsonb('metadata').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const trainingDataBatches = pgTable('training_data_batches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  metadata: jsonb('metadata'), // Store additional batch metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const trainingData = pgTable('training_data', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull().references(() => trainingDataBatches.id, { onDelete: 'cascade' }),
  originalFilename: text('original_filename').notNull(),
  storageLocation: text('storage_location').notNull(),
  duration: integer('duration'), // Duration in seconds
  metadata: jsonb('metadata'), // Store additional video metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const trainingDataSegments = pgTable('training_data_segments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  trainingDataId: uuid('training_data_id').notNull().references(() => trainingData.id, { onDelete: 'cascade' }),
  startTime: integer('start_time').notNull(), // Start time in milliseconds
  endTime: integer('end_time').notNull(), // End time in milliseconds
  segmentLocation: text('segment_location'), // Path to extracted segment (if generated)
  description: text('description'), // Optional description
  metadata: jsonb('metadata'), // Store additional segment metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// --- Relations ---

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  resources: many(resources),
  creditsLedger: many(creditsLedger),
  trainingData: many(trainingData),
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

export const resourcesRelations = relations(resources, ({ one }) => ({
  user: one(users, {
    fields: [resources.userId],
    references: [users.id],
  }),
}));

export const creditsLedgerRelations = relations(creditsLedger, ({ one }) => ({
  user: one(users, {
    fields: [creditsLedger.userId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [creditsLedger.taskId],
    references: [tasks.id],
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
  user: one(users, {
    fields: [trainingData.userId],
    references: [users.id],
  }),
  batch: one(trainingDataBatches, {
    fields: [trainingData.batchId],
    references: [trainingDataBatches.id],
  }),
  segments: many(trainingDataSegments),
}));

export const trainingDataSegmentsRelations = relations(trainingDataSegments, ({ one }) => ({
  trainingData: one(trainingData, {
    fields: [trainingDataSegments.trainingDataId],
    references: [trainingData.id],
  }),
}));

// console.log('PostgreSQL schema loaded.'); 