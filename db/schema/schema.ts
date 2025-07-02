// Temporarily empty schema for Drizzle Kit to initialize the migrations folder.

import { pgTable, text, timestamp, json, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { v4 as randomUUID } from 'uuid';

// --- ENUMS for PostgreSQL ---
export const taskStatusEnum = pgEnum('task_status', ['Queued', 'In Progress', 'Complete', 'Failed', 'Cancelled']);

// Convenient array form for front-end filtering & joins
export const taskStatusEnumValues = ['Queued', 'In Progress', 'Complete', 'Failed', 'Cancelled'] as const;

// --- Canonical Schema for PostgreSQL ---

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  apiKeys: json('api_keys'), // Store API keys as JSONB
  settings: json('settings'), // Store tool settings as JSONB
});

export const projects = pgTable('projects', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  aspectRatio: text('aspect_ratio'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settings: json('settings'), // Store tool settings as JSONB
});

// Type for updating projects, allowing optional fields
export type ProjectUpdate = {
  name?: string;
  aspectRatio?: string;
};

export const tasks = pgTable('tasks', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  taskType: text('task_type').notNull(),
  params: json('params').notNull(),
  status: taskStatusEnum('status').default('Queued').notNull(),
  dependantOn: text('dependant_on'),
  outputLocation: text('output_location'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  generationProcessedAt: timestamp('generation_processed_at', { withTimezone: true }),
}, (table) => ({
  // Indexes for better query performance
  statusCreatedIdx: index('idx_status_created').on(table.status, table.createdAt),
  dependantOnIdx: index('idx_dependant_on').on(table.dependantOn),
  projectStatusIdx: index('idx_project_status').on(table.projectId, table.status),
}));

export const generations = pgTable('generations', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  tasks: json('tasks'), // Storing array as JSONB
  params: json('params'),
  location: text('location'),
  type: text('type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});

export const shots = pgTable('shots', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  settings: json('settings'),
});

export const shotGenerations = pgTable('shot_generations', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  shotId: text('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  generationId: text('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),
  position: text('position').default('0').notNull(),
});

export const resources = pgTable('resources', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'lora'
  metadata: json('metadata').notNull(),
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

// console.log('Canonical schema loaded.'); // Removed noisy console log 