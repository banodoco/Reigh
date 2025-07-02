# Supabase DB Transition Plan

## Context
Currently, the application uses a dual-database approach:
- **Client-side**: Supabase JS client (already configured but underutilized)
- **Server-side**: SQLite via better-sqlite3 + Drizzle ORM

We're transitioning to **Supabase PostgreSQL exclusively** for all environments.

### Current Architecture Analysis
1. **Schema**: Defined in `db/schema/schema.ts` (SQLite-specific with Drizzle)
2. **Migrations**: Separate folders for SQLite (`db/migrations-sqlite/`) and PG (`db/migrations/`)
3. **Database Client**: `src/lib/db/index.ts` conditionally initializes based on environment
4. **Seed Data**: `db/seed.ts` targets SQLite with a dummy user (`00000000-0000-0000-0000-000000000000`)
5. **Server**: Express API at port 8085, uses Drizzle for all database operations
6. **Client**: Already has Supabase client configured but mostly unused

### Target Architecture
Two execution modes using the **same Supabase instance**:

1. **dev mode** (`VITE_APP_ENV=dev`):
   * **Backend (Express)**: Connects to Supabase DB using the **service role key** for direct data access, bypassing RLS. This is for seeding and administrative tasks.
   * **Frontend (React)**: Auto-authenticates as a dedicated `dev` user via Supabase Auth.
   * **API Security**: For API requests, the backend will validate the `dev` user's JWT, but RLS will be permissive.

2. **production mode** (`VITE_APP_ENV=production`):
   * **Backend (Express)**: Still uses the **service role key** but relies on RLS policies being correctly implemented.
   * **Frontend (React)**: Requires full user authentication via Supabase Auth.
   * **API Security**: The backend **must** validate the user's JWT on every request and use it to enforce Supabase's Row-Level Security.

---

## Implementation Plan

### Phase 1: Database Schema & Drizzle Setup

#### 1.1 Convert Drizzle Schema to PostgreSQL
Instead of creating a new file, we will modify the existing `db/schema/schema.ts` to use Drizzle's `pg-core`.

**Action Items:**
- [ ] In `db/schema/schema.ts`, replace `drizzle-orm/sqlite-core` with `drizzle-orm/pg-core`.
- [ ] Update table definitions:
    * `sqliteTable` -> `pgTable`.
    * Change `text('id').primaryKey()` to `uuid('id').primaryKey().default(sql`gen_random_uuid()`)`.
    * Change `text('created_at').$defaultFn(...)` to `timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`.
    * Convert `text('...', { mode: 'json' })` to `jsonb('...')`.
    * Define `taskStatusEnum` using `pgEnum`.
- [ ] This maintains a single source of truth for the schema.

#### 1.2 Configure Drizzle for Supabase
- [ ] Update `drizzle.config.ts` to point to your Supabase instance.
  ```typescript
  // drizzle.config.ts
  import { defineConfig } from 'drizzle-kit';

  export default defineConfig({
    dialect: 'postgresql',
    schema: './db/schema/schema.ts', // Point to the updated PG schema
    out: './db/migrations',
    dbCredentials: {
      // Use the connection string with the password from your Supabase project
      connectionString: process.env.DATABASE_URL!,
    },
    verbose: true,
    strict: true,
  });
  ```
- [ ] Generate a new PostgreSQL migration: `npm run db:generate:pg`. This will create the first "real" PG migration.

#### 1.3 Apply Schema & Enable Extensions
- [ ] In the Supabase SQL Editor, enable the UUID extension: `create extension if not exists "uuid-ossp";`
- [ ] Apply the generated migration to your Supabase database using a tool like the Supabase SQL editor or a database client.

### Phase 2: Authentication & API Security

#### 2.1 Implement Server-Side Auth Middleware
This is a **critical step**. The Express server needs to validate the JWT sent from the Supabase client on each request.

- [ ] Create a new middleware file `src/server/middleware/auth.ts`.
- [ ] This middleware will:
    1. Extract the `Authorization` header (`Bearer <token>`).
    2. Use the Supabase Admin client (`supabaseAdmin`) to validate the token and get the user.
    3. Attach the user's identity to the request object (e.g., `req.user`).
    4. If the token is invalid, reject the request with a `401 Unauthorized` error.
- [ ] Apply this middleware to all protected API routes in `src/server/index.ts`.

#### 2.2 Row-Level Security (RLS) Policies
With the server validating JWTs, we can now write effective RLS policies.

- [ ] **Enable RLS on all tables** (as described in the previous plan).
- [ ] **Create Production Policies**:
  ```sql
  -- Users can see their own data.
  CREATE POLICY "Enable read access for own user" ON public.users FOR SELECT USING (auth.uid() = id);

  -- Projects are visible only to the user who created them.
  CREATE POLICY "Enable all access for project owners" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  
  -- Users can access tasks associated with projects they own.
  CREATE POLICY "Enable access for task project owners" ON public.tasks FOR ALL USING (
    (SELECT user_id FROM projects WHERE projects.id = tasks.project_id) = auth.uid()
  );
  
  -- (Repeat for shots, generations, etc.)
  ```
- [ ] **Create Development Policies**: For dev mode, we can have a permissive policy, but it's better to rely on the `service_role` key on the server which bypasses RLS entirely for admin tasks like seeding. For API requests, the dev user will be subject to the same RLS as a normal user, which is good for testing.

### Phase 3: Environment & Client Configuration

#### 3.1 Environment Variables
This section is largely correct. We just need to ensure the `DATABASE_URL` is the one from Supabase that includes the password for Drizzle.

**.env.dev.local**
```bash
# Supabase
VITE_SUPABASE_URL="https://[project-ref].supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[db-host].supabase.co:5432/postgres"

# Dev User (create in Supabase Auth first)
VITE_APP_ENV="dev"
DEV_USER_EMAIL="dev@reigh.local"
DEV_USER_PASSWORD="a-secure-password-for-dev"

# Server
PORT=8085
```
*(Production would have similar keys but without the DEV_USER_* vars)*

#### 3.2 Update Supabase Client for Dev Auto-Login
The plan for `src/integrations/supabase/client.ts` is good. Auto-signing in for `dev` mode is a great DevX feature.

### Phase 4: Backend Refactor (Drizzle, Not Supabase Client)

#### 4.1 Unify the Database Client
Update `src/lib/db/index.ts` to **only** use the Drizzle Postgres client. The distinction between browser/server is no longer needed here, as the server will exclusively use Drizzle.

```typescript
// src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../../db/schema/schema'; // The updated PG schema
import 'dotenv/config'; // Make sure env vars are loaded

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// For server-side, this is our DB instance
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```
**Crucially, we will NOT be rewriting API routes to use `supabase.from(...)`. We will continue using the `db.query...` syntax from Drizzle, which will now be talking to our Supabase Postgres database.** This saves a massive amount of refactoring effort.

#### 4.2 Remove SQLite Dependencies
This part of the plan remains the same. It's the final cleanup.
- [ ] Delete `db/migrations-sqlite/` and `drizzle-sqlite.config.ts`.
- [ ] Update `package.json` to remove all `*-sqlite` scripts.
- [ ] Uninstall `better-sqlite3`.

### Phase 5: Data Seeding

#### 5.1 Create Dev User in Supabase Auth
- [ ] Manually create a user in the Supabase Auth dashboard with the email/password specified in your `.env.dev.local`. This is a one-time setup action for the project.

#### 5.2 Update the Seed Script
- [ ] Modify `db/seed.ts` to use the Drizzle Postgres client (`db` from `src/lib/db/index.ts`).
- [ ] The logic can remain very similar, but it will now seed the remote Supabase DB. It must use the `dev` user's ID when creating projects, etc.
- [ ] The seed script should be run with the `SUPABASE_SERVICE_ROLE_KEY` active to bypass RLS.

### Follow-Ups
- **Supabase Storage**: This plan focuses on the database. A high-priority follow-up task should be created to migrate local file uploads in `public/files` to use Supabase Storage. This will unify the data layer.

---
## Revised Migration Checklist

1.  [ ] **Schema**: Convert `db/schema/schema.ts` to `pg-core`.
2.  [ ] **Drizzle Config**: Update `drizzle.config.ts` for Postgres.
3.  [ ] **Migration**: Generate and apply the initial PG migration to Supabase.
4.  [ ] **Auth**: Create the `dev` user in Supabase Auth.
5.  [ ] **Environment**: Update `.env.local` and create samples with the new variables.
6.  [ ] **API Security**: Implement the JWT validation middleware for Express.
7.  [ ] **RLS**: Enable RLS and apply policies for production use.
8.  [ ] **Backend DB Client**: Refactor `src/lib/db/index.ts` to use Drizzle-Postgres exclusively.
9.  [ ] **Frontend DB Client**: Update `src/integrations/supabase/client.ts` with the dev auto-login logic.
10. [ ] **Seeding**: Update `db/seed.ts` to work with Drizzle-Postgres.
11. [ ] **Testing**: Validate `dev` and `production` modes.
12. [ ] **Cleanup**: Remove SQLite packages, scripts, and configuration files.
13. [ ] **Follow-up**: Create a new task for migrating file uploads to Supabase Storage.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Keep SQLite as backup until fully validated |
| Performance degradation | Add proper indexes, use connection pooling |
| RLS policy bugs | Extensive testing, start with permissive policies |
| Breaking changes for users | Provide migration tools and clear documentation |

---

## Success Criteria

- [ ] No SQLite files or dependencies remain
- [ ] Dev mode works without authentication
- [ ] Production mode requires and enforces authentication
- [ ] All existing features work identically
- [ ] Performance is equal or better than SQLite version
- [ ] Clear documentation for both modes 