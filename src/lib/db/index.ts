import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config as dotenvConfig } from 'dotenv';
import * as schema from '../../../db/schema/schema'; // Import the full schema

// Load environment variables from .env.local if running in a Node environment
if (typeof process !== 'undefined' && process.env) {
  dotenvConfig({ path: '.env.local' });
}

let db: any; // Database client (either Drizzle or Supabase)

if (typeof window !== 'undefined') {
  // Browser environment: use Supabase JS Client
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase URL or Anon Key is not configured in VITE environment variables.');
    throw new Error('Supabase client configuration missing for browser environment.');
  }
  db = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[DB] Browser environment: Initialized Supabase JS Client.');

} else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  // Node.js (server) environment: use PostgreSQL via pg and Drizzle
  try {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    const pool = new Pool({
      connectionString,
    });
    
    // Pass the imported schema to Drizzle for relational queries
    db = drizzle(pool, { schema });
    console.log('[DB] Node.js environment: Initialized Drizzle with PostgreSQL and schema.');
  } catch (error) {
    console.error('[DB] Node.js environment: Failed to initialize Drizzle with PostgreSQL.', error);
    throw error; // Re-throw the error to make it visible during server startup
  }
} else {
  // Other environments (e.g., web workers without window, or unknown JS environments)
  console.warn('[DB] Unknown JavaScript environment. Database client not initialized.');
  // db will remain undefined or could be set to a mock/null implementation.
}

export { db };

/*
// Commenting out closeDbConnection and process handlers for now to simplify and focus on connection.
// These need to be revisited if specific cleanup is required and APP_ENV logic is clarified.
export async function closeDbConnection(): Promise<void> {
  try {
    // This logic needs to be adapted based on whether db is a Drizzle/better-sqlite3 instance or Supabase client
    // and if APP_ENV is reliably available/necessary here.
    if (db && typeof (db as any).close === 'function') { // Example for better-sqlite3 direct driver instance
        (db as any).close();
        console.log('[DB] SQLite connection closed.');
    } else if (db && db._driver && typeof (db._driver as any).close === 'function') { // Drizzle might wrap it
        (db._driver as any).close();
        console.log('[DB] Drizzle/SQLite connection closed.');
    }
    // Add logic for Supabase client if needed, though it typically doesn't require explicit close for client-side usage.
  } catch (error) {
    console.error('[DB] Error closing database connection:', error);
  }
}

if (typeof process !== 'undefined' && process.on) {
  process.on('SIGINT', async () => {
    console.log('[DB] SIGINT received, attempting to close DB connection...');
    // await closeDbConnection();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.log('[DB] SIGTERM received, attempting to close DB connection...');
    // await closeDbConnection();
    process.exit(0);
  });
}
*/ 