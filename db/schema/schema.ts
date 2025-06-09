// Temporarily empty schema for Drizzle Kit to initialize the migrations folder.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { v4 as randomUUID } from 'uuid';

// --- ENUMS (simulated for SQLite) ---
// Note: Drizzle ORM's `sqlite-core` does not have a native enum type like `pg-core`.
// We'll use `text` and can enforce values at the application level.
export const taskStatusEnum = ['Pending', 'Queued', 'In Progress', 'Complete', 'Failed', 'Cancelled'] as const;

// --- Canonical Schema for SQLite ---

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email'),
});

export const projects = sqliteTable('projects', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  aspectRatio: text('aspect_ratio'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// Type for updating projects, allowing optional fields
export type ProjectUpdate = {
  name?: string;
  aspectRatio?: string;
};

export const tasks = sqliteTable('tasks', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  taskType: text('task_type').notNull(),
  params: text('params', { mode: 'json' }).notNull(),
  status: text('status', { enum: taskStatusEnum }).default('Pending').notNull(),
  dependantOn: text('dependant_on'),
  outputLocation: text('output_location'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }), // No $onUpdate in SQLite
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  generationProcessedAt: integer('generation_processed_at', { mode: 'timestamp' }),
});

export const generations = sqliteTable('generations', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  tasks: text('tasks', { mode: 'json' }), // Storing array as JSON string
  params: text('params', { mode: 'json' }),
  location: text('location'),
  type: text('type'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});

export const shots = sqliteTable('shots', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});

export const shotGenerations = sqliteTable('shot_generations', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  shotId: text('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  generationId: text('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),
  position: integer('position').default(0).notNull(),
});

export const resources = sqliteTable('resources', {
  id: text('id').$defaultFn(() => randomUUID()).primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'lora'
  metadata: text('metadata', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
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