// Temporarily empty schema for Drizzle Kit to initialize the migrations folder.

import { pgTable, uuid, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { taskStatusEnum } from './enums';

// --- Canonical Schema ---

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // Assuming user_id comes from an auth provider like Supabase Auth
  // Additional user columns (e.g., email, name) can be added here as needed.
  // For now, it's minimal as per the doc.
});

export const projects = pgTable('projects', {
  id: uuid('id').$defaultFn(() => randomUUID()).primaryKey(),
  name: text('name').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  aspectRatio: text('aspect_ratio'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).$defaultFn(() => new Date()).notNull(),
});

// Type for updating projects, allowing optional fields
export type ProjectUpdate = {
  name?: string;
  aspectRatio?: string;
};

export const tasks = pgTable('tasks', {
  id: uuid('id').$defaultFn(() => randomUUID()).primaryKey(),
  taskType: text('task_type').notNull(),
  params: jsonb('params').notNull(),
  status: taskStatusEnum('status').default('Pending').notNull(),
  dependantOn: uuid('dependant_on').array(),
  outputLocation: text('output_location'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).$onUpdate(() => new Date()),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  generationProcessedAt: timestamp('generation_processed_at', { mode: 'date', withTimezone: true }),
});

export const generations = pgTable('generations', {
  id: uuid('id').$defaultFn(() => randomUUID()).primaryKey(),
  tasks: uuid('tasks').array(),
  location: text('location'),
  type: text('type'), // "type" is a reserved keyword in SQL, Drizzle handles quoting
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).$onUpdate(() => new Date()),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});

export const shots = pgTable('shots', {
  id: uuid('id').$defaultFn(() => randomUUID()).primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).$onUpdate(() => new Date()),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});

export const shotGenerations = pgTable('shot_generations', {
  id: uuid('id').$defaultFn(() => randomUUID()).primaryKey(),
  shotId: uuid('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  generationId: uuid('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),
  position: integer('position').default(0).notNull(),
});

// --- Relations ---

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
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

// console.log('Canonical schema loaded.'); // Removed noisy console log 