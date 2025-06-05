import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import * as schema from './schema/schema';
import { eq, sql, and } from 'drizzle-orm';
import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Calculate __dirname for ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// --- End Calculate __dirname ---

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000';
const SEEDED_PROJECT_NAME = 'My Seeded Project';
const SQLITE_DB_PATH = process.env.DATABASE_URL_SQLITE || './local.db';

async function seed() {
  console.log(`[Seed] Starting database seed process for SQLite at ${SQLITE_DB_PATH}...`);

  let sqliteConnection: BetterSqlite3.Database | null = null;
  let localDb: BetterSQLite3Database<typeof schema>;

  try {
    sqliteConnection = new BetterSqlite3(SQLITE_DB_PATH, { /* verbose: console.log */ });
    
    // ---- Execute DDL to create tables if they don't exist ----
    console.log('[Seed] Checking if initial schema setup is needed...');
    try {
      // Check if a key table (e.g., users) exists
      sqliteConnection.prepare('SELECT 1 FROM users LIMIT 1').get();
      console.log('[Seed] Tables seem to exist. Skipping DDL execution.');
    } catch (tableCheckError: any) {
      // Assuming error means table doesn't exist
      if (tableCheckError.message && tableCheckError.message.includes(`no such table`)) {
        console.log('[Seed] Tables not found. Attempting to create schema from manual DDL file...');
        const ddlFilePath = path.join(__dirname, 'migrations-sqlite/0000_clear_rocket_raccoon.sql');
        try {
          const ddlSql = fs.readFileSync(ddlFilePath, 'utf-8');
          sqliteConnection.exec(ddlSql);
          console.log('[Seed] Successfully executed DDL from 0000_clear_rocket_raccoon.sql');
        } catch (ddlError) {
          console.error('[Seed] CRITICAL: Failed to read or execute DDL SQL file:', ddlFilePath, ddlError);
          if (sqliteConnection) sqliteConnection.close();
          process.exit(1);
        }
      } else {
        // Different error during table check, rethrow or handle
        console.error('[Seed] Error checking for tables existence (not \'no such table\'):', tableCheckError);
        throw tableCheckError;
      }
    }
    // ---- End DDL Execution ----

    localDb = drizzle(sqliteConnection, { schema, logger: true });
    console.log('[Seed] Connected to SQLite for seeding.');

    // 1. Upsert User
    console.log(`[Seed] Ensuring dummy user ${DUMMY_USER_ID} exists...`);
    await localDb.insert(schema.users)
      .values({ id: DUMMY_USER_ID })
      .onConflictDoNothing()
      .execute();
    console.log(`[Seed] Dummy user ${DUMMY_USER_ID} upserted.`);

    // 2. Find or Create Project
    let projectId: string;
    console.log(`[Seed] Looking for project: "${SEEDED_PROJECT_NAME}" for user ${DUMMY_USER_ID}`);
    const existingProject = await localDb.query.projects.findFirst({
      where: (p, { eq }) => and(eq(p.name, SEEDED_PROJECT_NAME), eq(p.userId, DUMMY_USER_ID)),
    });

    if (existingProject) {
      projectId = existingProject.id;
      console.log(`[Seed] Found existing project: "${existingProject.name}" (${projectId})`);
    } else {
      console.log(`[Seed] Project "${SEEDED_PROJECT_NAME}" not found, creating...`);
      const newProjectResult = await localDb.insert(schema.projects)
        .values({ name: SEEDED_PROJECT_NAME, userId: DUMMY_USER_ID })
        .returning();
      
      if (!newProjectResult || newProjectResult.length === 0) {
        console.error('[Seed] CRITICAL: Failed to create project for seeding. Cannot continue.');
        if (sqliteConnection) sqliteConnection.close();
        process.exit(1);
      }
      projectId = newProjectResult[0].id as string;
      const projectName = newProjectResult[0].name as string;
      console.log(`[Seed] Created project: "${projectName}" (${projectId})`);
    }

    // For idempotency, clear related data for this project before re-seeding them
    console.log(`[Seed] Clearing existing tasks, generations, shots for project ${projectId}...`);
    await localDb.delete(schema.shotGenerations).where(sql`generation_id IN (SELECT id FROM ${schema.generations} WHERE project_id = ${projectId})`);
    await localDb.delete(schema.generations).where(eq(schema.generations.projectId, projectId));
    await localDb.delete(schema.shots).where(eq(schema.shots.projectId, projectId));
    await localDb.delete(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    console.log(`[Seed] Existing data cleared for project ${projectId}.`);

    // 4. Create Shot
    console.log('[Seed] Creating new shot...');
    const [shot] = await localDb.insert(schema.shots).values({
      name: 'Shot_010_0010',
      projectId: projectId,
    }).returning();
    console.log(`[Seed] Created shot: ${shot.id} - ${shot.name}`);

    // 5. Create Generation
    console.log('[Seed] Creating new generation...');
    const [generation] = await localDb.insert(schema.generations).values({
      tasks: [task1.id, task2.id],
      location: '/renders/project_alpha/shot_010/gen_005',
      type: 'Final Render',
      projectId: projectId,
    }).returning();
    console.log(`[Seed] Created generation: ${generation.id}`);
    
    // 6. Link Shot and Generation
    console.log('[Seed] Linking shot and generation...');
    await localDb.insert(schema.shotGenerations).values({
      shotId: shot.id,
      generationId: generation.id,
      position: 1,
    }).execute();
    console.log(`[Seed] Linked shot ${shot.id} with generation ${generation.id}`);

    console.log('[Seed] Database seeding completed successfully.');

  } catch (error) {
    console.error('[Seed] Error during database seeding:', error);
    if (sqliteConnection) sqliteConnection.close();
    process.exit(1);
  } finally {
    if (sqliteConnection) {
      sqliteConnection.close();
      console.log('[Seed] SQLite connection closed.');
    }
  }
}

seed().catch((err) => {
  console.error('[Seed] Unhandled error in seed execution:', err);
  process.exit(1);
}); 