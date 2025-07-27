import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/schema';
import { eq, sql, and } from 'drizzle-orm';
import { config as dotenvConfig } from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables
dotenvConfig({ path: '.env.local' });

const SEEDED_PROJECT_NAME = 'My Seeded Project';

async function seed() {
  console.log(`[Seed] Starting database seed process for PostgreSQL...`);

  let client: postgres.Sql<{}> | null = null;
  let db: ReturnType<typeof drizzle>;

  try {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Create postgres client
    client = postgres(connectionString, {
      max: 1, // Single connection for seeding
    });
    
    db = drizzle(client, { schema });
    
    console.log(`[Seed] Connected to PostgreSQL database`);

    // Get or create user
    const userId = await getOrCreateUser(db);
    console.log(`[Seed] User ID: ${userId}`);

    // Get or create project
    const projectId = await getOrCreateProject(db, userId);
    console.log(`[Seed] Project ID: ${projectId}`);

    // Clean up existing generated data for this project to avoid duplicates
    await cleanupProjectData(db, projectId);

    // Create sample shots
    const shotIds = await createSampleShots(db, projectId);
    console.log(`[Seed] Created ${shotIds.length} sample shots`);

    // Create sample generations
    const generationIds = await createSampleGenerations(db, projectId);
    console.log(`[Seed] Created ${generationIds.length} sample generations`);

    // Link some generations to shots
    await linkGenerationsToShots(db, shotIds, generationIds);
    console.log(`[Seed] Linked generations to shots`);

    // Create sample task cost configs
    await createSampleTaskCostConfigs(db);
    console.log(`[Seed] Created sample task cost configs`);

    // Create sample credits
    await createSampleCredits(db, userId);
    console.log(`[Seed] Created sample credits`);

    console.log(`[Seed] ✅ Database seeding completed successfully!`);

  } catch (error) {
    console.error(`[Seed] ❌ Error during seeding:`, error);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log(`[Seed] Database connection closed`);
    }
  }
}

async function getOrCreateUser(db: ReturnType<typeof drizzle>): Promise<string> {
  const userId = process.env.VITE_DEV_USER_ID || 'c7b3e1f4-9876-5432-1098-76543210abcd';
  
  let user = (await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
  
  if (!user) {
    console.log(`[Seed] Creating new user with ID: ${userId}`);
    await db.insert(schema.users).values({
      id: userId,
      name: 'Seeded User',
      email: 'seed@example.com',
      credits: '100.000', // Start with 100 credits
      apiKeys: {},
      settings: {
        ui: {
          paneLocks: {
            gens: false,
            shots: false,
            tasks: true
          }
        },
        "user-preferences": {}
      },
      onboarding: {},
    });
    user = (await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
  } else {
    console.log(`[Seed] Using existing user: ${user.name} (${user.email})`);
  }
  
  return user.id;
}

async function getOrCreateProject(db: ReturnType<typeof drizzle>, userId: string): Promise<string> {
  let project = (await db.select()
    .from(schema.projects)
    .where(and(
      eq(schema.projects.userId, userId),
      eq(schema.projects.name, SEEDED_PROJECT_NAME)
    ))
    .limit(1))[0];
  
  if (!project) {
    console.log(`[Seed] Creating new project: ${SEEDED_PROJECT_NAME}`);
    const projectData = {
      name: SEEDED_PROJECT_NAME,
      userId: userId,
      aspectRatio: '16:9',
      settings: {
        defaultTool: 'image-generation',
        autoSave: true,
      },
    };
    
    const [newProject] = await db.insert(schema.projects).values(projectData).returning();
    project = newProject;
  } else {
    console.log(`[Seed] Using existing project: ${project.name}`);
  }
  
  return project.id;
}

async function cleanupProjectData(db: ReturnType<typeof drizzle>, projectId: string): Promise<void> {
  console.log(`[Seed] Cleaning up existing data for project: ${projectId}`);
  
  // Delete shot_generations first (foreign key dependencies)
  await db.delete(schema.shotGenerations).where(sql`generation_id IN (SELECT id FROM ${schema.generations} WHERE project_id = ${projectId})`);
  
  // Delete generations
  await db.delete(schema.generations).where(eq(schema.generations.projectId, projectId));
  
  // Delete shots
  await db.delete(schema.shots).where(eq(schema.shots.projectId, projectId));
  
  // Delete tasks
  await db.delete(schema.tasks).where(eq(schema.tasks.projectId, projectId));
  
  console.log(`[Seed] Cleanup completed`);
}

async function createSampleShots(db: ReturnType<typeof drizzle>, projectId: string): Promise<string[]> {
  const shotsData = [
    {
      name: 'Opening Scene',
      projectId: projectId,
      settings: {
        description: 'The opening shot of our creative project',
        mood: 'epic',
      },
    },
    {
      name: 'Character Introduction',
      projectId: projectId,
      settings: {
        description: 'Introducing the main character',
        mood: 'mysterious',
      },
    },
    {
      name: 'Action Sequence',
      projectId: projectId,
      settings: {
        description: 'Fast-paced action scene',
        mood: 'intense',
      },
    },
    {
      name: 'Closing Shot',
      projectId: projectId,
      settings: {
        description: 'The final shot that brings it all together',
        mood: 'triumphant',
      },
    },
  ];
  
  const insertedShots = await db.insert(schema.shots).values(shotsData).returning();
  return insertedShots.map(shot => shot.id);
}

async function createSampleGenerations(db: ReturnType<typeof drizzle>, projectId: string): Promise<string[]> {
  const generationsData = [
    {
      projectId: projectId,
      type: 'image',
      location: '/placeholder.svg',
      params: {
        prompt: 'A majestic mountain landscape at sunrise',
        seed: 12345,
        steps: 20,
        model: 'wan_2.1',
        width: 1024,
        height: 576,
      },
      tasks: [randomUUID()],
    },
    {
      projectId: projectId,
      type: 'image',
      location: '/placeholder.svg',
      params: {
        prompt: 'A mysterious figure in a dark forest',
        seed: 67890,
        steps: 25,
        model: 'wan_2.1',
        width: 1024,
        height: 576,
      },
      tasks: [randomUUID()],
    },
    {
      projectId: projectId,
      type: 'image',
      location: '/placeholder.svg',
      params: {
        prompt: 'An epic battle scene with dramatic lighting',
        seed: 54321,
        steps: 30,
        model: 'wan_2.1',
        width: 1024,
        height: 576,
      },
      tasks: [randomUUID()],
    },
    {
      projectId: projectId,
      type: 'video',
      location: '/placeholder.svg',
      params: {
        prompt: 'Camera movement through mystical realm',
        frames: 60,
        model: 'travel_between_images',
        inputImages: 2,
      },
      tasks: [randomUUID()],
    },
    {
      projectId: projectId,
      type: 'image',
      location: '/placeholder.svg',
      params: {
        prompt: 'A peaceful sunset over calm waters',
        seed: 98765,
        steps: 20,
        model: 'wan_2.1',
        width: 1024,
        height: 576,
      },
      tasks: [randomUUID()],
    },
  ];
  
  const insertedGenerations = await db.insert(schema.generations).values(generationsData).returning();
  return insertedGenerations.map(gen => gen.id);
}

async function linkGenerationsToShots(db: ReturnType<typeof drizzle>, shotIds: string[], generationIds: string[]): Promise<void> {
  const shotGenData: schema.NewShotGeneration[] = [];
  
  // Link first few generations to shots with positions
  for (let i = 0; i < Math.min(shotIds.length, generationIds.length - 1); i++) {
    shotGenData.push({
      shotId: shotIds[i],
      generationId: generationIds[i],
      position: i, // Positioned generations
    });
  }
  
  // Add one unpositioned generation (for testing the new feature)
  if (shotIds.length > 0 && generationIds.length > 0) {
    shotGenData.push({
      shotId: shotIds[0], // Add to first shot
      generationId: generationIds[generationIds.length - 1], // Last generation
      position: null, // Unpositioned!
    });
  }
  
  if (shotGenData.length > 0) {
    await db.insert(schema.shotGenerations).values(shotGenData);
  }
}

async function createSampleTaskCostConfigs(db: ReturnType<typeof drizzle>): Promise<void> {
  const configs = [
    {
      taskType: 'single_image',
      baseCostPerSecond: '0.000278',
    },
    {
      taskType: 'travel_between_images',
      baseCostPerSecond: '0.001000',
    },
    {
      taskType: 'ai_prompt_enhancement',
      baseCostPerSecond: '0.000100',
    },
  ];
  
  // Insert only if they don't exist
  for (const config of configs) {
    const existing = await db.select()
      .from(schema.taskCostConfigs)
      .where(eq(schema.taskCostConfigs.taskType, config.taskType))
      .limit(1);
    
    if (existing.length === 0) {
      await db.insert(schema.taskCostConfigs).values(config);
    }
  }
}

async function createSampleCredits(db: ReturnType<typeof drizzle>, userId: string): Promise<void> {
  // Add some sample credit history
  const creditEntries = [
    {
      userId: userId,
      amount: '50.000',
      type: 'stripe' as const,
      description: 'Initial credit purchase',
      stripePaymentIntentId: 'pi_sample_123',
    },
    {
      userId: userId,
      amount: '50.000',
      type: 'manual' as const,
      description: 'Welcome bonus credits',
    },
    {
      userId: userId,
      amount: '-5.000',
      type: 'spend' as const,
      description: 'Image generation task',
    },
  ];
  
  // Only add if no credit history exists
  const existingCredits = await db.select()
    .from(schema.creditsLedger)
    .where(eq(schema.creditsLedger.userId, userId))
    .limit(1);
  
  if (existingCredits.length === 0) {
    await db.insert(schema.creditsLedger).values(creditEntries);
  }
}

// Run the seed function
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}

export default seed; 