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
      // Connection pool configuration for Supabase
      max: 5, // Maximum number of connections in the pool
      min: 1, // Minimum number of connections in the pool
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // Timeout for new connections
      allowExitOnIdle: true, // Allow the process to exit when all connections are idle
    });

    // Handle unexpected errors on idle clients so they don't crash the process
    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle PostgreSQL client', err);
      // The pool will automatically remove the broken client and will create a new one
      // for the next query, so we just log here instead of letting the error bubble up.
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

// Commenting out closeDbConnection and process handlers for now to simplify and focus on connection.
// Cleanup handlers for Supabase/PostgreSQL connections can be added here if needed in the future. 