import express, { Request, Response, NextFunction } from 'express';
import { db } from '../../lib/db/index'; // Fixed relative path
import { projects as projectsTable, users as usersTable, ProjectUpdate } from '../../../db/schema/schema';
import { eq, asc, desc, and } from 'drizzle-orm';
import { Project } from '@/types/project';
import { authenticate } from '../middleware/auth';

const projectsRouter = express.Router();

// Apply authentication middleware to all routes
projectsRouter.use(authenticate);

// Define an asyncHandler to wrap async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// GET /api/projects
projectsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  // console.log(`[API] GET /api/projects: Querying projects for user: ${userId}`);

  try {
    let fetchedData = await db.select({
      id: projectsTable.id,
      name: projectsTable.name,
      userId: projectsTable.userId,
      aspectRatio: projectsTable.aspectRatio,
    })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId))
      .orderBy(asc(projectsTable.name));

    // console.log(`[API] GET /api/projects: Found ${fetchedData.length} existing projects.`);

    if (fetchedData.length === 0) {
      // console.log('[API] GET /api/projects: No projects found. Creating a default project.');
      const defaultProject = {
        name: 'Default Project',
        userId: userId,
        aspectRatio: '16:9', // or some other sensible default
      };
      
      const newProject = await db
        .insert(projectsTable)
        .values(defaultProject)
        .returning();
      
      fetchedData = newProject;
      // console.log('[API] GET /api/projects: Default project created successfully.');
    }

    // console.log('[API] GET /api/projects: Mapping data for response.');
    const projects: Project[] = fetchedData.map(p => ({
      id: p.id,
      name: p.name,
      user_id: p.userId,
      aspectRatio: p.aspectRatio,
    }));

    // console.log('[API] GET /api/projects: Sending successful response.');
    res.status(200).json(projects);
  } catch (error) {
    console.error('[API] Error fetching or creating projects:', error);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
}));

// POST /api/projects
projectsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  let projectNameFromRequest: string | undefined;
  let aspectRatioFromRequest: string | undefined;
  try {
    const { name, aspectRatio } = req.body;
    projectNameFromRequest = name;
    aspectRatioFromRequest = aspectRatio;

    if (!projectNameFromRequest || typeof projectNameFromRequest !== 'string' || !projectNameFromRequest.trim()) {
      return res.status(400).json({ message: 'Project name is required and must be a non-empty string' });
    }
    const trimmedProjectName = projectNameFromRequest.trim();

    if (!aspectRatioFromRequest || typeof aspectRatioFromRequest !== 'string' || !aspectRatioFromRequest.trim()) {
      // For now, let's make aspect ratio optional on the backend, 
      // or set a default if not provided, though the frontend should always send it.
      // If it becomes strictly required, this check can be enforced.
      // return res.status(400).json({ message: 'Aspect ratio is required and must be a non-empty string' });
    }

    // Ensure the user exists before creating a project
    const existingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (existingUser.length === 0) {
      console.log(`[API] User ${userId} not found, creating it.`);
      await db.insert(usersTable).values({ id: userId, name: 'Default User' });
    }

    const newProjects = await db.insert(projectsTable).values({
      name: trimmedProjectName,
      userId: userId,
      aspectRatio: aspectRatioFromRequest, // Save aspectRatio
    }).returning({
      id: projectsTable.id,
      name: projectsTable.name,
      userId: projectsTable.userId,
      aspectRatio: projectsTable.aspectRatio,
    });

    if (!newProjects || newProjects.length === 0) {
      throw new Error('Failed to create new project');
    }

    // API response should match client expectation (user_id)
    const newProjectResponse = {
      id: newProjects[0].id,
      name: newProjects[0].name,
      user_id: newProjects[0].userId,
      aspectRatio: newProjects[0].aspectRatio,
    };
    // delete newProjectResponse.userId; // If client only expects user_id

    res.status(201).json(newProjectResponse);
  } catch (error: any) {
    console.error('[API] Error creating project:', error);
    // Handle potential unique constraint violation for name if your schema enforces it
    if (error.code === '23505') { 
      return res.status(409).json({ message: `Project with name "${projectNameFromRequest}" already exists.` });
    }
    res.status(500).json({ message: 'Failed to create new project' });
  }
}));

// PUT /api/projects/:id
// Update an existing project's name and/or aspectRatio
projectsRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const projectId = req.params.id;
  const { name, aspectRatio } = req.body as { name?: string; aspectRatio?: string };

  if (!projectId) {
    return res.status(400).json({ message: 'Project ID is required in the URL' });
  }

  if (!name && !aspectRatio) {
    return res.status(400).json({ message: 'At least one of name or aspectRatio must be provided' });
  }

  const updates: ProjectUpdate = {};
  
  // Validate and add name to updates if provided
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Project name must be a non-empty string' });
    }
    updates.name = name.trim();
  }
  
  // Add aspectRatio to updates if provided (optional validation)
  if (aspectRatio !== undefined) {
    if (typeof aspectRatio !== 'string' || !aspectRatio.trim()) {
      return res.status(400).json({ message: 'Aspect ratio must be a non-empty string' });
    }
    updates.aspectRatio = aspectRatio.trim();
  }

  try {
    const updatedProjects = await db.update(projectsTable)
      .set(updates)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId))) // Ensure user owns project
      .returning({
        id: projectsTable.id,
        name: projectsTable.name,
        userId: projectsTable.userId,
        aspectRatio: projectsTable.aspectRatio,
      });

    if (!updatedProjects || updatedProjects.length === 0) {
      return res.status(404).json({ message: 'Project not found or user not authorized to update' });
    }
    
    // API response should match client expectation (user_id)
    const updatedProjectResponse = {
      id: updatedProjects[0].id,
      name: updatedProjects[0].name,
      user_id: updatedProjects[0].userId,
      aspectRatio: updatedProjects[0].aspectRatio,
    };
    // delete updatedProjectResponse.userId; // If client only expects user_id

    res.status(200).json(updatedProjectResponse);
  } catch (error: any) {
    console.error('[API Error Updating Project]', error);
    // Handle potential unique constraint violation for name if your schema enforces it project-wide or user-wide
    if (error.code === '23505') { 
      return res.status(409).json({ message: `Project with name "${updates.name}" already exists.` });
    }
    res.status(500).json({ message: 'Failed to update project' });
  }
}));

// A very simple synchronous test route
projectsRouter.get('/ping', (req: Request, res: Response) => {
  res.status(200).json({ message: 'pong' });
});

export default projectsRouter; 