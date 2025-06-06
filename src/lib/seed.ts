import { db } from './db';
import { users as usersSchema } from '../../db/schema/schema';
import { eq } from 'drizzle-orm';

const DUMMY_USER_ID = '3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e';

export const seedDatabase = async () => {
  try {
    // Check if the dummy user already exists
    const existingUser = await db
      .select()
      .from(usersSchema)
      .where(eq(usersSchema.id, DUMMY_USER_ID))
      .limit(1);

    if (existingUser.length === 0) {
      // If user doesn't exist, insert them
      await db.insert(usersSchema).values({
        id: DUMMY_USER_ID,
        name: 'Dummy User',
        email: 'dummy@example.com',
      });
      console.log('[Seed] Dummy user created successfully.');
    } else {
      console.log('[Seed] Dummy user already exists.');
    }
  } catch (error) {
    console.error('[Seed] Error seeding database:', error);
    // Exit the process with an error code if seeding fails,
    // as it's a critical part of the startup.
    process.exit(1);
  }
}; 