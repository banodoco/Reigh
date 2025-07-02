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
   - Server uses Supabase service role key for full access
   - Client auto-authenticates as a dev user (no login required)
   - Permissive RLS policies allow dev user full access

2. **production mode** (`VITE_APP_ENV=production`):
   - Server uses Supabase service role key (with careful access control)
   - Client requires user authentication via Supabase Auth
   - Strict RLS policies enforce user-based access control

---

## Implementation Plan

### Phase 1: Database Schema Migration

#### 1.1 Schema Conversion (SQLite → PostgreSQL)
The current schema uses SQLite-specific types. Key changes needed:

| SQLite Type | PostgreSQL Type | Notes |
|-------------|-----------------|-------|
| `text` (primary keys) | `uuid` | Use `gen_random_uuid()` for defaults |
| `text` (timestamps) | `timestamptz` | Use `now()` for defaults |
| `integer` | `integer` | No change |
| `text` (JSON mode) | `jsonb` | Better performance and querying |
| `text` (enums) | Custom type or `text` with CHECK | PostgreSQL supports real enums |

**Action Items:**
- [ ] Create new `db/schema/schema.pg.ts` with PostgreSQL-specific types
- [ ] Update foreign key constraints to use proper PostgreSQL syntax
- [ ] Add database indexes that SQLite version is missing
- [ ] Ensure all tables have proper `created_at` and `updated_at` timestamps

#### 1.2 Migration Generation
- [ ] Configure `drizzle.config.ts` to point to Supabase:
  ```typescript
  export default defineConfig({
    dialect: 'postgresql',
    schema: './db/schema/schema.pg.ts',
    out: './db/migrations',
    dbCredentials: {
      connectionString: process.env.DATABASE_URL || 'postgresql://...',
    },
  });
  ```
- [ ] Generate fresh PostgreSQL migrations: `npm run db:generate:pg`
- [ ] Review and adjust generated SQL for Supabase compatibility

#### 1.3 Apply Schema to Supabase
- [ ] Use Supabase dashboard SQL editor or CLI to run migrations
- [ ] Enable required extensions: `uuid-ossp` or `pgcrypto` for UUID generation
- [ ] Verify all tables, constraints, and indexes are created correctly

### Phase 2: Row-Level Security (RLS)

#### 2.1 Enable RLS on All Tables
```sql
-- Enable RLS for all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE shot_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
```

#### 2.2 Development Mode Policies
Create permissive policies for the dev user:
```sql
-- Allow service role full access (bypasses RLS)
-- This is automatic in Supabase

-- Dev user policies (replace with actual dev user ID)
CREATE POLICY "dev_user_all_access" ON public.users
  FOR ALL USING (auth.uid() = 'dev-user-uuid' OR auth.role() = 'service_role');

-- Repeat for all tables...
```

#### 2.3 Production Mode Policies
Implement proper user-based access control:
```sql
-- Users can only see/edit their own record
CREATE POLICY "users_self_access" ON public.users
  FOR ALL USING (auth.uid() = id);

-- Users can only access their own projects
CREATE POLICY "projects_owner_access" ON public.projects
  FOR ALL USING (auth.uid() = user_id);

-- Tasks belong to projects, so check project ownership
CREATE POLICY "tasks_project_owner_access" ON public.tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = tasks.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- Continue for all tables...
```

### Phase 3: Environment Configuration

#### 3.1 Update Environment Variables
Create environment-specific configs:

**.env.dev.local**
```bash
# Supabase
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

# Dev user (create in Supabase Auth)
DEV_USER_ID=11111111-1111-1111-1111-111111111111
DEV_USER_EMAIL=dev@reigh.local

# App
VITE_APP_ENV=dev
PORT=8085
```

**.env.production.local**
```bash
# Supabase (same project or different)
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

# App
VITE_APP_ENV=production
PORT=8085
```

#### 3.2 Update Supabase Client
Modify `src/integrations/supabase/client.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auto-login for dev mode
if (import.meta.env.VITE_APP_ENV === 'dev' && import.meta.env.DEV) {
  const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL || 'dev@reigh.local';
  const DEV_USER_PASSWORD = import.meta.env.VITE_DEV_USER_PASSWORD || 'dev-password';
  
  // Auto sign-in in dev mode
  supabase.auth.signInWithPassword({
    email: DEV_USER_EMAIL,
    password: DEV_USER_PASSWORD,
  }).then(({ error }) => {
    if (error) console.error('Dev auto-login failed:', error);
    else console.log('Dev mode: Auto-logged in');
  });
}
```

### Phase 4: Database Client Refactor

#### 4.1 Server-Side Database Client
Update `src/lib/db/index.ts`:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../../db/schema/schema.pg';

// Always use PostgreSQL
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });

// For client-side, export the existing Supabase client
export { supabase } from '@/integrations/supabase/client';
```

#### 4.2 Remove SQLite Dependencies
- [ ] Delete `db/migrations-sqlite/` directory
- [ ] Delete `drizzle-sqlite.config.ts`
- [ ] Remove SQLite-specific code from `db/seed.ts`
- [ ] Update `package.json` scripts to remove SQLite commands
- [ ] Remove `better-sqlite3` from dependencies (after migration is complete)

### Phase 5: Data Migration & Seeding

#### 5.1 Create Dev User in Supabase Auth
```sql
-- Run in Supabase SQL editor
-- Note: You'll need to create the user via Supabase Auth dashboard
-- Then update their ID here
UPDATE auth.users 
SET id = '11111111-1111-1111-1111-111111111111'
WHERE email = 'dev@reigh.local';

-- Insert corresponding record in public.users
INSERT INTO public.users (id, email, name, api_keys, settings)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'dev@reigh.local',
  'Dev User',
  '{"fal": "", "openai": "", "replicate": ""}',
  '{}'
);
```

#### 5.2 Update Seed Script
Create `db/seed.supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/integrations/supabase/types';

const supabase = createClient<Database>(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  // Use service role to bypass RLS
  const DEV_USER_ID = process.env.DEV_USER_ID!;
  
  // Create default project
  const { data: project } = await supabase
    .from('projects')
    .insert({
      name: 'Default Dev Project',
      user_id: DEV_USER_ID,
      aspect_ratio: '16:9'
    })
    .select()
    .single();
    
  console.log('Seeded project:', project);
  // ... rest of seeding logic
}
```

### Phase 6: API Routes Migration

#### 6.1 Update All Route Handlers
Replace Drizzle queries with Supabase client calls. Example:

**Before (Drizzle/SQLite):**
```typescript
const projects = await db.query.projects.findMany({
  where: eq(projects.userId, userId)
});
```

**After (Supabase):**
```typescript
const { data: projects, error } = await supabase
  .from('projects')
  .select('*')
  .eq('user_id', userId);
```

#### 6.2 Server-Side Auth Context
For server routes, use service role client:
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
```

### Phase 7: Testing & Validation

#### 7.1 Development Mode Testing
- [ ] Run `npm run dev` - should auto-login and show tools
- [ ] Create projects, shots, generations - all should work without login
- [ ] Verify WebSocket connections work properly
- [ ] Test file uploads (ensure they still work with local storage)

#### 7.2 Production Mode Testing
- [ ] Set `VITE_APP_ENV=production` and restart
- [ ] Verify login is required
- [ ] Test that users can only see their own data
- [ ] Verify RLS policies are working correctly

### Phase 8: Cleanup & Documentation

- [ ] Remove all SQLite-related code and dependencies
- [ ] Update README with new setup instructions
- [ ] Document environment variables
- [ ] Create migration guide for existing installations
- [ ] Update CI/CD pipelines to use Supabase

---

## Migration Checklist Summary

### Immediate Actions (Week 1)
1. [ ] Create PostgreSQL schema file
2. [ ] Set up Supabase project with dev user
3. [ ] Generate and apply migrations
4. [ ] Implement basic RLS policies
5. [ ] Update environment configuration

### Core Migration (Week 2)
1. [ ] Refactor database client
2. [ ] Update seed scripts
3. [ ] Migrate API routes to use Supabase
4. [ ] Test dev mode thoroughly
5. [ ] Implement auth flow for production

### Finalization (Week 3)
1. [ ] Remove SQLite dependencies
2. [ ] Update documentation
3. [ ] Production testing
4. [ ] Deploy and monitor

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