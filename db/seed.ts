import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/schema';
import { eq, sql, and } from 'drizzle-orm';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig({ path: '.env.local' });

const SEEDED_PROJECT_NAME = 'My Seeded Project';

async function seed() {
  console.log(`[Seed] Starting database seed process for PostgreSQL...`);

  let pool: Pool | null = null;
  let db: any;

  try {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
    
    console.log('[Seed] Connected to PostgreSQL for seeding.');

    // Get the dev user ID - this should match what's created in Supabase Auth
    const userId = process.env.DEV_USER_ID || 'dev-user-id-placeholder';
    const userEmail = process.env.VITE_DEV_USER_EMAIL || 'dev@reigh.local';

    // 1. Upsert User
    console.log(`[Seed] Ensuring dev user ${userId} exists...`);
    await db.insert(schema.users)
      .values({ 
        id: userId,
        email: userEmail,
        name: 'Dev User'
      })
      .onConflictDoNothing()
      .execute();
    console.log(`[Seed] Dev user ${userId} upserted.`);

    // 2. Find or Create Project
    let projectId: string;
    console.log(`[Seed] Looking for project: "${SEEDED_PROJECT_NAME}" for user ${userId}`);
    const existingProject = await db.query.projects.findFirst({
      where: (p: any, { eq, and }: any) => and(eq(p.name, SEEDED_PROJECT_NAME), eq(p.userId, userId)),
    });

    if (existingProject) {
      projectId = existingProject.id;
      console.log(`[Seed] Found existing project: "${existingProject.name}" (${projectId})`);
    } else {
      console.log(`[Seed] Project "${SEEDED_PROJECT_NAME}" not found, creating...`);
      const newProjectResult = await db.insert(schema.projects)
        .values({ name: SEEDED_PROJECT_NAME, userId: userId, aspectRatio: '16:9' })
        .returning();
      
      if (!newProjectResult || newProjectResult.length === 0) {
        console.error('[Seed] CRITICAL: Failed to create project for seeding. Cannot continue.');
        if (pool) await pool.end();
        process.exit(1);
      }
      projectId = newProjectResult[0].id as string;
      const projectName = newProjectResult[0].name as string;
      console.log(`[Seed] Created project: "${projectName}" (${projectId})`);
    }

    // For idempotency, clear related data for this project before re-seeding them
    console.log(`[Seed] Clearing existing tasks, generations, shots for project ${projectId}...`);
    await db.delete(schema.shotGenerations).where(sql`generation_id IN (SELECT id FROM ${schema.generations} WHERE project_id = ${projectId})`);
    await db.delete(schema.generations).where(eq(schema.generations.projectId, projectId));
    await db.delete(schema.shots).where(eq(schema.shots.projectId, projectId));
    await db.delete(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    console.log(`[Seed] Cleared existing data for project ${projectId}.`);

    // 3. Create sample tasks
    console.log('[Seed] Creating sample tasks...');
    const taskIds = [];
    for (let i = 0; i < 5; i++) {
      const taskData = {
        taskType: i % 2 === 0 ? 'single_image' : 'travel_stitch',
        params: {
          prompt: `Sample task ${i + 1}`,
          width: 1024,
          height: 1024,
          steps: 20,
          model: 'flux-dev',
        },
        status: i === 0 ? 'Complete' : i === 1 ? 'In Progress' : 'Queued',
        projectId: projectId,
      };
      const [newTask] = await db.insert(schema.tasks).values(taskData).returning();
      taskIds.push(newTask.id);
      console.log(`[Seed]   Created task: ${newTask.id} (${taskData.taskType}, ${taskData.status})`);
    }

    // 4. Create sample generations
    console.log('[Seed] Creating sample generations...');
    const generationIds = [];
    for (let i = 0; i < 3; i++) {
      const genData = {
        tasks: [taskIds[i]],
        params: { 
          prompt: `Sample generation ${i + 1}`,
          seed: 42 + i,
        },
        location: `/public/files/sample-gen-${i + 1}.png`,
        type: 'image',
        projectId: projectId,
      };
      const [newGen] = await db.insert(schema.generations).values(genData).returning();
      generationIds.push(newGen.id);
      console.log(`[Seed]   Created generation: ${newGen.id}`);
    }

    // 5. Create sample shots
    console.log('[Seed] Creating sample shots...');
    const shotIds = [];
    for (let i = 0; i < 2; i++) {
      const shotData = {
        name: `Shot ${i + 1}`,
        projectId: projectId,
      };
      const [newShot] = await db.insert(schema.shots).values(shotData).returning();
      shotIds.push(newShot.id);
      console.log(`[Seed]   Created shot: ${newShot.id} ("${shotData.name}")`);
    }

    // 6. Link generations to shots
    console.log('[Seed] Linking generations to shots...');
    for (let i = 0; i < generationIds.length; i++) {
      const shotId = shotIds[i % shotIds.length];
      const shotGenData = {
        shotId: shotId,
        generationId: generationIds[i],
        position: i,
      };
      await db.insert(schema.shotGenerations).values(shotGenData);
      console.log(`[Seed]   Linked generation ${generationIds[i]} to shot ${shotId} at position ${i}`);
    }

    console.log('[Seed] Seeding completed successfully!');
  } catch (error) {
    console.error('[Seed] Error during seeding:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('[Seed] PostgreSQL connection closed.');
    }
  }
}

// Execute the seed function
seed().catch((error) => {
  console.error('[Seed] Unexpected error:', error);
  process.exit(1);
}); 