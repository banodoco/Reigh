import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/schema.ts',
  out: './db/migrations',
  dbCredentials: {
    // Use the connection string with the password from your Supabase project
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
}); 