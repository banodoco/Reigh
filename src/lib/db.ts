import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../../db/schema/schema';

// Standard development setup (SQLite)
const sqlite = new Database('local.db');
const db = drizzle(sqlite, { schema, logger: false });
console.log('[DB] Initialized Drizzle with better-sqlite3. Target: ./local.db');

export { db }; 