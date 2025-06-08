import { db } from './db';
import { users as usersSchema, projects as projectsSchema } from '../../db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const DUMMY_USER_ID = '3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e';
const DEFAULT_PROJECT_NAME = 'Default Project';

export const seedDatabase = async () => {
  try {
    // 1. Check for and create the dummy user if they don't exist
    let user = (await db.select().from(usersSchema).where(eq(usersSchema.id, DUMMY_USER_ID)).limit(1))[0];

    if (!user) {
      user = (await db.insert(usersSchema).values({
        id: DUMMY_USER_ID,
        name: 'Dummy User',
        email: 'dummy@example.com',
      }).returning())[0];
      console.log('[Seed] Dummy user created successfully.');
    } else {
      console.log('[Seed] Dummy user already exists.');
    }

    // 2. Check if the user has a default project
    const existingProject = await db
      .select()
      .from(projectsSchema)
      .where(and(eq(projectsSchema.userId, DUMMY_USER_ID), eq(projectsSchema.name, DEFAULT_PROJECT_NAME)))
      .limit(1);

    if (existingProject.length === 0) {
      // 3. If no default project, create one for the dummy user
      await db.insert(projectsSchema).values({
        id: randomUUID(),
        name: DEFAULT_PROJECT_NAME,
        userId: DUMMY_USER_ID,
        aspectRatio: '16:9',
      });
      console.log('[Seed] Default project created for dummy user.');
    } else {
      console.log('[Seed] Default project already exists for dummy user.');
    }

  } catch (error) {
    console.error('[Seed] Error seeding database:', error);
    // Exit the process with an error code if seeding fails,
    // as it's a critical part of the startup.
    process.exit(1);
  }
}; 