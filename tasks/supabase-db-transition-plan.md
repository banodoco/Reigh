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

#### 2.1 Update Server-Side Auth Middleware
The auth middleware already exists at `src/server/middleware/auth.ts` but currently uses a dummy implementation.

- [ ] Create Supabase Admin client in `src/integrations/supabase/admin.ts`:
  ```typescript
  import { createClient } from '@supabase/supabase-js';
  
  export const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  ```
- [ ] Update the existing `src/server/middleware/auth.ts`:
    1. Extract the `Authorization` header (`Bearer <token>`).
    2. Use `supabaseAdmin.auth.getUser(token)` to validate and get the user.
    3. Continue using `req.userId` (not `req.user`) to maintain compatibility.
    4. If the token is invalid, reject with `401 Unauthorized`.
    5. In dev mode (`VITE_APP_ENV=dev`), optionally allow a bypass for the dev user.
- [ ] Apply this middleware to ALL route files that need authentication:
    - `projects.ts` - replace DUMMY_USER_ID with req.userId
    - `resources.ts` - replace DUMMY_USER_ID with req.userId  
    - `shots.ts`
    - `tasks.ts`
    - `steerableMotion.ts`
    - `singleImageGeneration.ts`
    - `toolSettings.ts` (already imports but needs to use it)
    - `generations.ts` (already imports but needs to use it)
    - `apiKeys.ts` (already uses it correctly)

#### 2.2 Row-Level Security (RLS) Policies
With the server validating JWTs, we can now write effective RLS policies.

- [ ] **Enable RLS on all tables** (as described in the previous plan).
- [ ] **Create Production Policies**:
  ```sql
  -- Users can see their own data
  CREATE POLICY "Enable read access for own user" ON public.users FOR SELECT USING (auth.uid() = id);
  CREATE POLICY "Enable update for own user" ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

  -- Projects are visible only to the user who created them
  CREATE POLICY "Enable all access for project owners" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  
  -- Users can access tasks associated with projects they own
  CREATE POLICY "Enable access for task project owners" ON public.tasks FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND projects.user_id = auth.uid())
  );
  
  -- Users can access generations for their projects
  CREATE POLICY "Enable access for generation project owners" ON public.generations FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = generations.project_id AND projects.user_id = auth.uid())
  );
  
  -- Users can access shots for their projects
  CREATE POLICY "Enable access for shot project owners" ON public.shots FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = shots.project_id AND projects.user_id = auth.uid())
  );
  
  -- Users can access shot_generations through their projects
  CREATE POLICY "Enable access for shot_generation project owners" ON public.shot_generations FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shots 
      JOIN projects ON projects.id = shots.project_id 
      WHERE shots.id = shot_generations.shot_id 
      AND projects.user_id = auth.uid()
    )
  );
  
  -- Resources are user-scoped
  CREATE POLICY "Enable all access for resource owners" ON public.resources FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
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
VITE_DEV_USER_EMAIL="dev@reigh.local"
VITE_DEV_USER_PASSWORD="a-secure-password-for-dev"

# Server
PORT=8085
```
*(Production would have similar keys but without the DEV_USER_* vars)*

#### 3.2 Update Supabase Client for Dev Auto-Login
The plan for `src/integrations/supabase/client.ts` is good. Auto-signing in for `dev` mode is a great DevX feature.

- [ ] Update `src/integrations/supabase/client.ts` to read from environment variables instead of hardcoded values:
  ```typescript
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
  
  export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  
  // Auto-login for dev mode
  if (import.meta.env.VITE_APP_ENV === 'dev') {
    const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL;
    const DEV_USER_PASSWORD = import.meta.env.VITE_DEV_USER_PASSWORD;
    
    if (DEV_USER_EMAIL && DEV_USER_PASSWORD) {
      supabase.auth.signInWithPassword({
        email: DEV_USER_EMAIL,
        password: DEV_USER_PASSWORD,
      }).then(({ error }) => {
        if (error) console.error('Dev auto-login failed:', error);
        else console.log('Dev user auto-logged in');
      });
    }
  }
  ```

### Phase 4: Backend Refactor (Drizzle, Not Supabase Client)

#### 4.1 Unify the Database Client
Update `src/lib/db/index.ts` to **only** use the Drizzle Postgres client. The distinction between browser/server is no longer needed here, as the server will exclusively use Drizzle.

```typescript
// src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../../db/schema/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
export const db = drizzle(pool, { schema });
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


---
## Revised Migration Checklist

1.  [x] **Schema**: Convert `db/schema/schema.ts` to `pg-core` (pgTable, pgEnum, jsonb, timestamps).
2.  [x] **Drizzle Config**: Update `drizzle.config.ts` for Postgres with DATABASE_URL.
3.  [x] **Migration**: Generate and apply the initial PG migration to Supabase.
4.  [x] **Auth**: Create the `dev` user in Supabase Auth dashboard.
5.  [x] **Environment**: Update `.env.local` with all required variables (including VITE_ prefixed ones).
6.  [x] **Supabase Admin Client**: Create `src/integrations/supabase/admin.ts` for server-side JWT validation.
7.  [x] **API Security**: Update existing auth middleware to validate JWTs with Supabase Admin.
8.  [x] **Route Authentication**: Apply auth middleware to all routes, replace DUMMY_USER_ID with req.userId.
9.  [ ] **RLS**: Enable RLS on all tables and apply comprehensive policies.
10. [x] **Backend DB Client**: Refactor `src/lib/db/index.ts` to use `drizzle-orm/node-postgres` with `pg`.
11. [x] **Frontend Client Authentication**: Update all hooks to use authenticated fetch via `fetchWithAuth` utility.
12. [x] **Frontend Supabase Client**: Update `src/integrations/supabase/client.ts` to use env vars and add dev auto-login.
13. [x] **Runtime Seeding**: Update `src/lib/seed.ts` to use Postgres and dev user ID.
14. [x] **Standalone Seeding**: Update `db/seed.ts` for manual seeding with Postgres.
15. [x] **Package Scripts**: Update `start:api` to use PG migrations, update/remove SQLite scripts.
16. [ ] **Testing**: Validate both `dev` and `production` modes work correctly.
17. [ ] **Cleanup**: Delete `src/lib/db.ts`, `db/migrate.ts`, `db/migrations-sqlite/`, `drizzle-sqlite.config.ts`, remove `better-sqlite3`.
18. [ ] **Docs**: Update `structure.md` to remove SQLite references and describe the new Supabase-only architecture.

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

---

## Implementation Gaps Found During Code Review

After reviewing the codebase, several important details need to be addressed:

### 1. Database Driver Selection
- The project already has `pg` installed, NOT `postgres`
- Use `drizzle-orm/node-postgres` with the existing `pg` package instead of adding `postgres`
- Update the Phase 4.1 example to:
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../../db/schema/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
export const db = drizzle(pool, { schema });
```

### 2. Authentication Middleware Gaps
- Auth middleware exists (`src/server/middleware/auth.ts`) but only `apiKeys.ts` actually uses it
- It sets `req.userId`, NOT `req.user.id` - maintain this convention
- Routes that need auth middleware added:
  - `projects.ts` (currently uses hardcoded DUMMY_USER_ID)
  - `resources.ts` (currently uses hardcoded DUMMY_USER_ID)
  - `shots.ts`
  - `tasks.ts`
  - `steerableMotion.ts`
  - `singleImageGeneration.ts`
  - `toolSettings.ts` (imports but doesn't use)
  - `generations.ts` (imports but doesn't use)

### 3. User ID Migration
- Replace all `DUMMY_USER_ID` constants with `req.userId` from auth middleware
- Affected files:
  - `src/server/routes/projects.ts` (9 occurrences)
  - `src/server/routes/resources.ts` (6 occurrences)
  - `src/lib/seed.ts` (uses different dummy ID: `3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e`)

### 4. Environment Variable Updates
- `src/integrations/supabase/client.ts` has hardcoded URL/key - needs to read from env:
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://...";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJ...";
```
- Add `VITE_APP_ENV` check for dev auto-login logic
- Server needs to check `process.env.VITE_APP_ENV` or similar for dev/prod mode

### 5. Scripts & Build Process
- Update `package.json` scripts:
  - `start:api` currently runs `db:migrate:sqlite` - change to PG migration
  - Remove all `db:*:sqlite` scripts after migration
  - The `db:migrate:pg` script has a placeholder echo - needs real implementation

### 6. Cleanup Tasks
- Delete after migration:
  - `src/lib/db.ts` (duplicate SQLite-only connection)
  - `db/migrate.ts` (SQLite migration helper)
  - `db/migrations-sqlite/` directory
  - `drizzle-sqlite.config.ts`
  - `local.db` and related files
  - Remove `better-sqlite3` from dependencies

### 7. Schema Considerations
- UUID generation: Supabase has `pgcrypto` extension enabled by default, so `gen_random_uuid()` works
- Convert `