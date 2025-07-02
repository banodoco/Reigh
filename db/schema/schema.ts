// PostgreSQL schema for Supabase

import { pgTable, text, uuid, timestamp, integer, index, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// --- ENUMS ---
export const taskStatusEnum = pgEnum('task_status', ['Queued', 'In Progress', 'Complete', 'Failed', 'Cancelled']);

// --- Canonical Schema for PostgreSQL ---

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  apiKeys: jsonb('api_keys'), // Store API keys as JSONB
  settings: jsonb('settings'), // Store tool settings as JSONB
});

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

// --- Relations ---

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  resources: many(resources),
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

// console.log('PostgreSQL schema loaded.'); 