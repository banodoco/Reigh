import { db } from './db';
import { users as usersSchema, projects as projectsSchema } from '../../db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const DEFAULT_PROJECT_NAME = 'Default Project';

export const seedDatabase = async () => {
  try {
    // Get the dev user ID from the authenticated user or environment
    // This will be set by the authentication system
    const userId = process.env.DEV_USER_ID || 'dev-user-id-placeholder';
    
    // 1. Check for and create the user if they don't exist
    let user = (await db.select().from(usersSchema).where(eq(usersSchema.id, userId)).limit(1))[0];

    if (!user) {
      user = (await db.insert(usersSchema).values({
        id: userId,
        name: 'Dev User',
        email: process.env.VITE_DEV_USER_EMAIL || 'dev@reigh.local',
      }).returning())[0];
      console.log('[Seed] Dev user created successfully.');
    } else {
      console.log('[Seed] Dev user already exists.');
    }

    // 2. Check if the user has a default project
    const existingProject = await db
      .select()
      .from(projectsSchema)
      .where(and(eq(projectsSchema.userId, userId), eq(projectsSchema.name, DEFAULT_PROJECT_NAME)))
      .limit(1);

    if (existingProject.length === 0) {
      // 3. If no default project, create one for the user
      await db.insert(projectsSchema).values({
        id: randomUUID(),
        name: DEFAULT_PROJECT_NAME,
        userId: userId,
        aspectRatio: '16:9',
      });
      console.log('[Seed] Default project created for dev user.');
    } else {
      console.log('[Seed] Default project already exists for dev user.');
    }

  } catch (error) {
    console.error('[Seed] Error seeding database:', error);
    // Exit the process with an error code if seeding fails,
    // as it's a critical part of the startup.
    process.exit(1);
  }
}; 