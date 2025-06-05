# Dual Database Support: Local SQLite & Remote Supabase

> **Status:** draft / to-be-implemented  
> **Owner:** @backend-infra  
> **Related RFCs:** _none yet_

---

## 1. Objectives

1. Provide a **local-first** development & offline-capable experience by persisting all data to a _SQLite_ database that lives inside the project/workspace directory (`./local.db` by default).
2. Seamlessly switch to **hosted Supabase (Postgres)** when the app is running in production / web environment.
3. Maintain **one canonical schema definition & migration history** so both databases stay in lock-step.
4. Offer a **single, typed data-access layer (DAL)** the rest of the codebase can import without caring which backend is active.
5. Add simple DX tooling (`npm run db:*`) for generating, migrating and inspecting either database.

## 2. High-Level Design

### 2.1 Environment Detection

| Context                | Mechanism                                   | DB Backend |
|------------------------|---------------------------------------------|------------|
| `npm run dev` / Jest   | `process.env.APP_ENV !== 'web'` (default)   | SQLite     |
| Vercel / Netlify build | `process.env.APP_ENV === 'web'`             | Supabase   |
| Storybook              | Follows host environment                    | —          |

> **Env var:** `APP_ENV` → `local` _(default)_ | `web`

### 2.2 Directory Layout Additions

```
/tasks               – Planning docs (this file, …)
/db/schema           – Canonical SQL or ORM schema
/db/migrations       – Timestamp-tagged migration files (common for both)
/src/lib/db          – Runtime DAL (sqLite + supabase drivers)
```

### 2.3 Technology Choice (proposal)

* **Drizzle ORM** + **drizzle-kit**
  * Reason: first-class TypeScript types, supports **SQLite** + **Postgres** from same schema.
  * Generates typed query client for both runtimes.
* Alternative: Prisma or Kysely (comparable but heavier).

### 2.4 Runtime Switching Strategy

```ts
// src/lib/db/index.ts
import { createClient as createSupabase } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/libsql';

export const db = (() => {
  if (process.env.APP_ENV === 'web') {
    return createSupabase(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }
  const client = drizzle({
    url: 'file:./local.db',
  });
  return client;
})();
```
*Upstream code consumes `db` with a shared repository interface (e.g., `projectsRepo`)*.

---

## 3. Schema Definition

```sql
-- projects
id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
name        text    NOT NULL,
user_id     uuid    NOT NULL,
created_at  timestamptz DEFAULT now()

-- users (minimal)
id          uuid    PRIMARY KEY,
-- additional columns TBD

-- tasks
id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
task_type       text    NOT NULL,
params          jsonb   NOT NULL,
status          text    CHECK (status IN ('Pending','In Progress','Complete','Failed','Queued','Cancelled')),
dependant_on    uuid[]  DEFAULT '{}',
output_location text,
created_at      timestamptz DEFAULT now(),
updated_at      timestamptz,
project_id      uuid    REFERENCES projects(id)

-- generations
id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
tasks       uuid[] DEFAULT '{}',
location    text,
"type"      text,
created_at  timestamptz DEFAULT now(),
updated_at  timestamptz,
project_id  uuid REFERENCES projects(id)

-- shots
id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
name        text NOT NULL,
created_at  timestamptz DEFAULT now(),
updated_at  timestamptz,
project_id  uuid REFERENCES projects(id)

-- shot_generations (join table)
id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
shot_id        uuid REFERENCES shots(id),
generation_id  uuid REFERENCES generations(id),
position       int  DEFAULT 0
```

(Drizzle/Prisma schema file will encode the same. **Crucially, the Drizzle POC must validate how types like `uuid[]`, `jsonb`, and `timestamptz` are handled for SQLite, and if `gen_random_uuid()` is polyfilled app-side.**)

---

## 4. Migration & Deployment Flow

### 4.1 Local (SQLite)

1. `npm run db:generate` → Compiles schema into migration SQL.
2. `npm run db:migrate` → Applies pending migrations to `local.db` via drizzle-kit.
3. `npm run db:studio` (optional) → Launches Drizzle Studio web UI pointed at SQLite.

### 4.2 Web (Supabase)

1.  `npm run db:generate` (or equivalent Drizzle command) produces SQL migration files. **Drizzle should be the single source of truth for migration generation.**
2.  These Drizzle-generated SQL files are then applied to the Supabase database. For example, using `supabase db push --local` if Drizzle generates standard SQL files that Supabase can consume, or a similar mechanism that applies the SQL without Supabase generating a conflicting migration history. The goal is to avoid divergent migration histories between Drizzle's tracking (for SQLite) and Supabase's internal `supabase_migrations` table. **Ideally, Drizzle's migration table should be used for both, or a unified strategy clearly defined.**
3.  CI pipeline can run: `npm run db:generate && <command_to_apply_drizzle_sql_to_supabase>`.

> *Guarantees identical SQL is executed on both engines.*

### 4.3 Keeping Types in Sync

`drizzle-kit generate:pg` & `generate:sqlite` emit matching TS types → commit to repo so client code stays typed without hitting DB at runtime.

---

## 5. Implementation Task List - Mark Complete As You Proceed:

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 1 | Decide ORM/Toolkit (Drizzle vs Prisma) - **Strongly leaning Drizzle** | @backend-infra | S |
| 2 | **Execute POC:** Spike Drizzle with `uuid[]`, `jsonb`, `timestamptz`, `gen_random_uuid()` for SQLite & Postgres compatibility. Document findings. | @backend-infra ✅ (complete) | M |
| 3 | Install deps & scaffolding (`drizzle-kit`, drivers) | ✅ (complete) | S |
| 4 | Create canonical schema (`/db/schema/schema.ts`) based on POC results | ✅ (complete) | M |
| 5 | Add migration scripts to `package.json` (unified for Drizzle) | ✅ (complete) | S |
| 6 | Implement runtime DAL & switching logic (`src/lib/db`) | ✅ (complete) | M |
| 7 | Refactor existing Supabase calls to use DAL (incremental) | | L |
| 8 | Write Seed script for local dev (`npm run db:seed`) - **Must be idempotent & use consistent dummy user ID.** | ✅ (complete) | M |
| 9 | Document env vars (`APP_ENV`, Supabase keys) in README | ✅ (complete) | S |
|10 | Update CI workflow to run migrations and **tests against both SQLite (local) and a dedicated Postgres (e.g., Supabase Docker image) instance.** | | M |
|11 | Update structure.md with new file and outline of how everything works | ✅ (complete) | M |
|12 | QA: run e2e flows in both modes | QA | M |


Legend: S = < 1h, M = 1-3h, L = 1-2d

---

## 6. Key Design Decisions

Based on initial considerations, the following decisions have been made for the MVP:

*   **Offline Data Handling:** For simplicity in the initial version, the application will not support queuing writes when offline. Data operations will assume an active connection to the determined database (local SQLite or remote Supabase).
*   **Local Development Authentication:** When running in a local development environment (i.e., `APP_ENV !== 'web'`), the application will operate with a pre-defined dummy user. This approach avoids the complexity of a full authentication emulator for local SQLite usage. Full authentication against Supabase will occur when `APP_ENV === 'web'`.
*   **Data Replication/Syncing:** Advanced features like partial data replication or Supabase-Edge syncing are considered out of scope for the MVP. These can be revisited if future requirements necessitate such capabilities.
*   **Timestamp Handling:** All timestamps will be stored and handled in UTC. SQLite timestamps, which lack native timezone support, will be treated as ISO 8601 strings in UTC.
*   **Storybook Data Access:** For components that fetch data within Storybook, a strategy of mocking or stubbing the Data Access Layer (DAL) will be employed to avoid live database dependencies during UI development and testing.

---

## 7. Detailed Considerations & Potential Challenges

This section outlines specific technical considerations and potential challenges identified, along with planned mitigations.

*   **SQL Dialect Mismatches & Data Type Polyfills:**
    *   **Challenge:** Key schema types (`timestamptz`, `jsonb`, `uuid[]`, `gen_random_uuid()`) have different native support in Postgres vs. SQLite.
    *   **Mitigation:**
        *   The Drizzle POC (Task #2) is critical to verify Drizzle's adapter capabilities for SQLite:
            *   Application-side UUID generation if `gen_random_uuid()` isn't available.
            *   Mapping `jsonb` to `TEXT` with JSON functions for SQLite.
            *   Handling `timestamptz` as UTC ISO strings.
            *   Viable representation for `uuid[]` in SQLite (e.g., JSON string in a `TEXT` column if native array emulation is insufficient or Drizzle's support is lacking for array operators).
        *   Adopt UTC-first for all date/time operations.

*   **Migration History Management:**
    *   **Challenge:** Supabase (`supabase_migrations` table) and Drizzle (its own migration table) can create divergent migration histories.
    *   **Mitigation:** Standardize on Drizzle's migration generation as the source of truth. The SQL generated by Drizzle should be applied to Supabase in a way that doesn't cause Supabase to create conflicting migration metadata (e.g., using `supabase db remote commit` carefully or `supabase db push --local` if appropriate). Aim for a single, coherent migration history.

*   **SQLite Concurrency (`SQLITE_BUSY`):**
    *   **Challenge:** SQLite's file-level locking can cause `SQLITE_BUSY` errors during concurrent access (e.g., dev server + tests).
    *   **Mitigation:**
        *   Use `PRAGMA busy_timeout` on SQLite connections.
        *   Run Jest tests serially if they interact with the SQLite DB.
        *   CI pipeline should include tests against a Postgres instance, which has more robust concurrency, to catch such issues earlier if they were to manifest differently.

*   **CI Test Coverage for Both Databases:**
    *   **Challenge:** Unit/integration tests solely on SQLite may miss Postgres-specific behaviors or issues.
    *   **Mitigation:** The CI pipeline must include a job that provisions a Postgres database (e.g., Supabase via Docker or a dedicated test instance) and runs the full migration and test suite against it, in addition to tests against SQLite.

*   **Local Seeding & Dummy User Authentication:**
    *   **Challenge:** Consistent local development requires reliable seed data and a predictable authentication state.
    *   **Mitigation:** Develop an idempotent seed script. The dummy user for local development should have a fixed, known `user_id` to ensure foreign key relationships are correctly established in seeded data.

*   **Supabase Credentials in CI:**
    *   **Challenge:** Exposing `SUPABASE_ANON_KEY` or other sensitive keys directly in CI for PR builds can be a security risk.
    *   **Mitigation:** For CI environments, prefer using a Supabase Service Role Key if elevated privileges are needed for schema changes/seeding. Restrict this key's permissions as much as possible (e.g., to a dedicated CI schema or temporary database if feasible). Explore options for dynamic secret injection or key rotation for CI.

*   **Production Fallback (Supabase Unreachable):**
    *   **Challenge:** If the primary Supabase database is temporarily unavailable in production, the application (as currently scoped with no offline writes) may lose functionality.
    *   **Mitigation (Application Level):** This is an application design consideration. Decide on appropriate UX: display an "offline" or "maintenance" banner, disable data-dependent features, or queue critical operations if a future iteration includes offline support. This is out of scope for the initial DB setup but noted for broader application resilience.

*   **Enum Handling (Future):**
    *   **Challenge:** If more complex enum types (beyond simple `CHECK` constraints) are needed, differences between Postgres native enums and SQLite's handling can arise.
    *   **Mitigation:** For future needs, utilize Drizzle's `pgEnum()` / `sqliteEnum()` helpers or implement enums using separate lookup tables for maximum compatibility. The current `CHECK (status IN (...))` is expected to work fine.

---

## 8. Next Steps 
(Renumbering from original 7)
*   Approve design (this doc).
*   **Prioritize and execute the Drizzle POC (Task #2 in Implementation Plan).**
*   Based on POC findings, refine schema and proceed with implementation tasks.
*   Track progress in GitHub Project "Dual DB".

## 9. Drizzle POC Findings (2025-06-03)

The schema in `/db/schema/schema.ts` was executed through Drizzle Kit for both Postgres **and** SQLite.

Key results:

1. Type mapping
   * **Postgres**:  
     * `uuid` → `uuid` (with `DEFAULT gen_random_uuid()`)  
     * `uuid[]` → `uuid[]`  
     * `jsonb` → `jsonb`  
     * `timestamp` (`withTimezone: true`) → `timestamptz`
   * **SQLite** (driver `better-sqlite3`):  
     * `uuid` → `TEXT`  
     * `uuid[]` → `TEXT` (stored as JSON string)  
     * `jsonb` → `TEXT`  
     * `timestamp_ms` mode chosen → `INTEGER` (Unix ms).  
     * `gen_random_uuid()` is **not** available in SQLite – handled via `$defaultFn(() => randomUUID())` on the client side.

2. Generated SQL (excerpt)
   ```sql
   -- Postgres (db/migrations/0000_fresh_thunderbolt.sql)
   CREATE TABLE "poc_psql_table" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "uuid_array" uuid[],
     "json_data" jsonb,
     "created_at" timestamptz DEFAULT now()
   );

   -- SQLite (db/migrations-sqlite/0000_special_jackal.sql)
   CREATE TABLE `poc_sqlite_table` (
     `id` text PRIMARY KEY NOT NULL,
     `uuid_array` text,
     `json_data` text,
     `created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000)
   );
   ```

3. Tooling confirmed
   * `npm i drizzle-orm drizzle-kit better-sqlite3 pg dotenv`