import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../src/lib/db';

// This will run migrations on the database, skipping the ones already applied
async function main() {
  try {
    await migrate(db, { migrationsFolder: 'db/migrations' });
    console.log('[Migrate] Migrations ran successfully');
    process.exit(0);
  } catch (err) {
    console.error('[Migrate] Error running migrations:', err);
    process.exit(1);
  }
}

main(); 