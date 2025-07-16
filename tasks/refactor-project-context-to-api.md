# Refactoring ProjectContext.tsx to Use an API Layer

**Status:** Proposed
**Owner:** @frontend-team / @backend-infra
**Related RFCs:** `tasks/db_structure.md`

## 1. Objective

To refactor `ProjectContext.tsx` to fetch and manage project data through a dedicated API layer instead of direct Drizzle ORM client usage within the browser. This change is crucial for:
1.  Correctly implementing the dual database strategy (SQLite for local Node.js environments, Supabase/Postgres for web Node.js environments) as outlined in `db_structure.md`.
2.  Resolving runtime errors caused by attempting to use Node.js-specific Drizzle drivers in the browser.
3.  Improving security by not exposing database interaction logic or direct database client instances to the browser.
4.  Establishing a clear separation of concerns between client-side state management and server-side data persistence.

## 2. Current Problem

The current implementation in `ProjectContext.tsx` directly imports and uses the `db` object from `src/lib/db/index.ts`.
- When running in a browser environment (e.g., `npm run dev` with Vite), `src/lib/db/index.ts` is configured to provide a Supabase JS Client instance.
- However, `ProjectContext.tsx` attempts to use this instance with Drizzle ORM methods (e.g., `db.select().from()`, `db.insert().values()`). These methods do not exist on the Supabase JS Client, leading to runtime errors.
- The Drizzle drivers for SQLite (`drizzle-orm/libsql` or `drizzle-orm/better-sqlite3`) and direct Postgres (`drizzle-orm/node-postgres`) are designed for Node.js environments and cannot run in the browser due to dependencies on Node.js APIs (filesystem, TCP networking).
- Casting `db as any` in `ProjectContext.tsx` silences TypeScript errors but does not fix the underlying runtime incompatibility.

## 3. Proposed Solution: API Layer

We will introduce a server-side API layer that `ProjectContext.tsx` will communicate with. This API layer will be responsible for all database interactions using Drizzle ORM.

### 3.1 API Technology Choice

For this project, a **Dedicated Node.js API Server** (utilizing a framework such as Express.js or Fastify) is the chosen technology for implementing the API layer. This decision is based on the following key requirements:

1.  **Combined CRUD and Background Task Processing:** The server must not only handle synchronous CRUD API requests (e.g., for managing projects) but also be capable of managing and executing asynchronous background tasks (e.g., processing items from the `tasks` database table). A persistent Node.js server provides the necessary environment and control for both types of operations.
2.  **Dual Database Environment:** The server will use Drizzle ORM to interact with SQLite during local development and Supabase/Postgres in the cloud, aligning with `tasks/db_structure.md`.
3.  **Scalability and Flexibility:** This server model offers a solid foundation for future scaling and provides flexibility in how background jobs are managed.

While other options exist, they are less suited for the project's full scope:
*   **Vercel/Netlify Serverless Functions:** These are excellent for stateless CRUD APIs but present more complexity for managing persistent background worker processes that are anticipated for task processing.
*   **Next.js API Routes:** While capable for CRUD and extendable for background tasks (often with additional setup for persistent workers), a dedicated Node.js server offers a more decoupled and potentially simpler backend architecture when the frontend is already established with Vite and doesn't require a full Next.js migration.

Therefore, the development will proceed with establishing a dedicated Node.js API server.

### 3.2 API Endpoint Design (Project-related)

The following RESTful API endpoints will be created to manage projects:

1.  **`GET /api/projects`**
    *   **Action:** Fetches all projects for the authenticated user (currently DUMMY_USER_ID).
    *   **Response:** `200 OK` with JSON array of projects: `[{ id, name, user_id }, ...]`
    *   **Error:** `500 Internal Server Error` if database query fails.

2.  **`POST /api/projects`**
    *   **Action:** Creates a new project for the authenticated user.
    *   **Request Body (JSON):** `{ "name": "New Project Name" }`
    *   **Response:** `201 Created` with JSON of the new project: `{ id, name, user_id }`
    *   **Error:** `400 Bad Request` if name is missing. `500 Internal Server Error` if database insert fails.

*(Further endpoints for specific project retrieval, updates, or deletions can be added as needed.)*

### 3.3 Consideration: Extending for Background Task Processing

Given the future requirement for a server to process background tasks (e.g., items added to the `tasks` database table), the Dedicated Node.js API Server will be extended for this dual role. This involves:

1.  **CRUD Operations:** Serving the RESTful API endpoints for `projects` (and other entities) as described in section 3.2.
2.  **Task Processing Extension:**
    *   **Worker Component:** The server will include a worker module (or internal process) that monitors the `tasks` table. Initially, this may be achieved through database polling, with the potential to evolve to an event-driven mechanism (e.g., database triggers or a lightweight message queue) as the system matures.

This integrated approach centralizes backend logic, leveraging the same Drizzle `db` instance and infrastructure for both immediate API responses and longer-running background work.

**Example API Handler Snippet (conceptual for a Node.js framework like Express.js):**
```typescript
// e.g., src/server/routes/projects.ts (using Express.js style)
import express from 'express';
import { db } from '@/lib/db'; // Path to your Drizzle instance
import { projects as projectsTable } from '../../../db/schema/schema'; // Path to your schema
import { eq, asc, desc, and } from 'drizzle-orm';

const projectsRouter = express.Router();
const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000';

projectsRouter.get('/', async (req, res) => {
  try {
    const fetchedData = await db.select({
      id: projectsTable.id,
      name: projectsTable.name,
      userId: projectsTable.userId,
    })
    .from(projectsTable)
    .where(eq(projectsTable.userId, DUMMY_USER_ID))
    .orderBy(asc(projectsTable.name));
    res.status(200).json(fetchedData);
  } catch (error) {
    console.error('API Error fetching projects:', error);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
});

projectsRouter.post('/', async (req, res) => {
  try {
    const { name: projectName } = req.body;
    if (!projectName || typeof projectName !== 'string' || !projectName.trim()) {
      return res.status(400).json({ message: 'Project name is required' });
    }

    await db.insert(projectsTable).values({
      name: projectName,
      userId: DUMMY_USER_ID,
    });
    
    const newDbProject = await db.query.projects.findFirst({
        columns: { id: true, name: true, userId: true, createdAt: true },
        where: and(eq(projectsTable.name, projectName), eq(projectsTable.userId, DUMMY_USER_ID)),
        orderBy: [desc(projectsTable.createdAt)],
      });

    if (!newDbProject) {
        // This should ideally not happen if insert was successful and query is correct
        console.error('Failed to confirm project creation after insert');
        return res.status(500).json({ message: 'Failed to confirm project creation' });
    }
    const createdProject = { id: newDbProject.id, name: newDbProject.name, user_id: newDbProject.userId };

    res.status(201).json(createdProject);
  } catch (error) {
    console.error('API Error creating project:', error);
    res.status(500).json({ message: 'Failed to create project' });
  }
});

export default projectsRouter;
```

## 4. Server-Side API Handler Logic

-   API handlers (e.g., serverless functions) will reside in the backend environment.
-   They will import the Drizzle `db` instance from `src/lib/db/index.ts`. In this server-side context, `db` will be correctly configured as a Drizzle client for either SQLite (local dev) or Postgres (production/web), based on server environment variables (e.g., `APP_ENV` or lack of `window`).
-   Handlers will use Drizzle ORM syntax to execute database queries (selects, inserts).
-   Handlers will be responsible for input validation and error handling.

**Example API Handler Snippet (conceptual):**
```typescript
// e.g., api/projects.ts (if using a serverless function pattern)
import { db } from '@/lib/db'; // Path to your Drizzle instance
import { projects as projectsTable } from '../../db/schema/schema'; // Path to your schema
import { eq, asc, desc, and } from 'drizzle-orm';

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function GET(request: Request) {
  try {
    const fetchedData = await db.select({
      id: projectsTable.id,
      name: projectsTable.name,
      userId: projectsTable.userId,
    })
    .from(projectsTable)
    .where(eq(projectsTable.userId, DUMMY_USER_ID))
    .orderBy(asc(projectsTable.name));
    return new Response(JSON.stringify(fetchedData), { status: 200 });
  } catch (error) {
    console.error('API Error fetching projects:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch projects' }), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name: projectName } = await request.json();
    if (!projectName || typeof projectName !== 'string' || !projectName.trim()) {
      return new Response(JSON.stringify({ message: 'Project name is required' }), { status: 400 });
    }

    // Note: Drizzle handles default UUID generation based on schema for `id`
    await db.insert(projectsTable).values({
      name: projectName,
      userId: DUMMY_USER_ID,
    });
    
    // Fetch the newly created project to return it (ideally using .returning() if fully supported and consistent)
    // For simplicity here, we might re-query, or rely on the client to refetch.
    // Best practice: use Drizzle's .returning() if available and works for both DBs, or query by name and user ordered by creation time.
    const newDbProject = await db.query.projects.findFirst({
        columns: { id: true, name: true, userId: true, createdAt: true },
        where: and(eq(projectsTable.name, projectName), eq(projectsTable.userId, DUMMY_USER_ID)),
        orderBy: [desc(projectsTable.createdAt)],
      });

    if (!newDbProject) {
        throw new Error('Failed to confirm project creation');
    }
    const createdProject = { id: newDbProject.id, name: newDbProject.name, user_id: newDbProject.userId };

    return new Response(JSON.stringify(createdProject), { status: 201 });
  } catch (error) {
    console.error('API Error creating project:', error);
    return new Response(JSON.stringify({ message: 'Failed to create project' }), { status: 500 });
  }
}
```

## 5. Refactoring `ProjectContext.tsx`

The existing `fetchProjects` and `addNewProject` functions in `ProjectContext.tsx` will be modified:
-   Remove direct Drizzle ORM calls.
-   Replace them with `fetch` calls to the new API endpoints (`/api/projects`).
-   Handle API responses (success and error states).
-   Update React state (`projects`, `selectedProjectId`, `isLoadingProjects`, `isCreatingProject`) based on API call lifecycle.

**Example `fetchProjects` in `ProjectContext.tsx` (conceptual):**
```typescript
const fetchProjects = async (selectProjectIdAfterFetch?: string | null) => {
  setIsLoadingProjects(true);
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    const fetchedData: Project[] = await response.json(); // Assuming Project type matches API output

    if (fetchedData.length === 0) {
      // Option 1: Client initiates default project creation via API - This path will not be taken.
      // Option 2: Server-side handles default project creation if GET /api/projects returns empty.
      // This is the chosen approach. The API GET /api/projects will create and return the default if none exist.
      // The client will then receive the default project in the fetchedData.
      setProjects(fetchedData); // If API created default, it will be here

    } else {
      // ... (existing logic for setting projects and selectedProjectId based on fetchedData) ...
      setProjects(fetchedData);
      // ... rest of selection logic ...
    }
  } catch (error: any) {
    console.error('Error fetching projects via API:', error);
    toast.error(`Failed to load projects: ${error.message}`);
    setProjects([]);
    setSelectedProjectIdState(null);
  }
  setIsLoadingProjects(false);
};
```
**Example `addNewProject` in `ProjectContext.tsx` (conceptual):**
```typescript
const addNewProject = async (projectName: string): Promise<Project | null> => {
  if (!projectName.trim()) {
    toast.error("Project name cannot be empty.");
    return null;
  }
  setIsCreatingProject(true);
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    const newProject: Project = await response.json(); // Assuming Project type matches API output

    setProjects(prevProjects => [...prevProjects, newProject].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedProjectIdState(newProject.id);
    localStorage.setItem('selectedProjectId', newProject.id);
            // Project created and selected
    return newProject;
  } catch (err: any) {
    console.error("Exception during project creation via API:", err);
    toast.error(`An unexpected error occurred: ${err.message}`);
    return null;
  } finally {
    setIsCreatingProject(false);
  }
};
```
**Default Project Creation Strategy**: The API endpoint `GET /api/projects` will handle the creation of a "Default Project" if no projects exist for the user. This keeps the client-side logic simpler. The client requests projects, and if none exist, the API creates and returns the default one as part of the initial project list.

## 6. Authentication and Authorization

-   Initially, the API handlers will continue to use the `DUMMY_USER_ID`.
-   Future work will involve integrating proper user authentication (e.g., Supabase Auth). The API layer will then need to verify user sessions/tokens and scope database queries to the authenticated user ID.

## 7. Benefits

-   **Correct Dual Database Operation:** The server-side API can use Drizzle with Node.js drivers for SQLite locally and Postgres in production.
-   **Improved Security:** Database credentials and complex query logic are not exposed to the browser.
-   **Clear Separation of Concerns:** Client-side UI/state management is decoupled from server-side data persistence.
-   **Testability:** API endpoints and client-side fetching logic can be tested independently.
-   **Scalability:** An API layer is a standard pattern for scalable web applications.

## 8. Implementation Tasks - Mark Complete As You Complete Them

1.  **[Backend]** Set up the Dedicated Node.js API server (e.g., using Express.js or Fastify).
    *   Integrate necessary middleware (e.g., JSON parsing, CORS if needed).
    *   Establish a connection to the Drizzle `db` instance.
2.  **[Backend]** Define the file structure for API route handlers within the Node.js server (e.g., `src/server/routes/projects.ts`, `src/server/controllers/projectController.ts`).
3.  **[Frontend]** Refactor `fetchProjects` in `ProjectContext.tsx` to call `GET /api/projects`.
    *   Adjust logic for handling the initial empty state, relying on the API to provide the default project.
4.  **[Frontend]** Refactor `addNewProject` in `ProjectContext.tsx` to call `POST /api/projects`.
5.  **[Testing]** Thoroughly test project listing, creation, and selection in both local (expecting SQLite via API) and a simulated web environment (if possible, to ensure API structure is sound for later Supabase connection).
6.  **[Docs]** Update `structure.md` or other relevant documentation to reflect the new API layer.

## 9. Considerations

-   **Error Handling:** Implement robust error handling and user feedback for API request failures.
-   **Loading States:** Ensure appropriate loading indicators are displayed during API requests.
-   **Optimistic Updates:** For a smoother UX, consider implementing optimistic updates in `ProjectContext.tsx` after the initial refactor.
-   **Environment Variables:** Ensure server-side API handlers have access to necessary environment variables (like database connection strings) securely. Frontend will continue to use `VITE_` prefixed variables for its own configuration if needed, but API keys for backend services should not be `VITE_` prefixed.
-   **Local Development for API:** Ensure the Dedicated Node.js API server has a good local development workflow with Vite (e.g., using Vite's proxy feature to route `/api` requests to the Node.js server, and running both servers concurrently during development).

## 10. Cloud Deployment Considerations

While the immediate focus is local development, deploying this system to the cloud introduces further considerations for robustness, scalability, and maintainability. The Dedicated Node.js API Server model provides a good foundation.

1.  **Scalability & Resource Management:**
    *   **API Server Instances:** The Node.js API server might need to be scaled out to multiple instances behind a load balancer to handle concurrent user requests.
    *   **Task Processing Workers:** Resource-intensive tasks (CPU, memory) may require dedicated, potentially more powerful, server instances for the worker components. These workers could be scaled independently of the API request-handling instances.
    *   **Database Capacity:** The cloud database (e.g., Supabase Postgres) must be provisioned to handle the combined load from API requests and task worker operations.

2.  **Job Queues (Strongly Recommended for Task Processing):**
    *   **Decoupling:** Instead of workers directly polling the database, using a dedicated message queue (e.g., RabbitMQ, Redis with BullMQ, AWS SQS, Google Cloud Pub/Sub) is highly recommended for cloud deployments.
    *   **Workflow:** API receives a task -> adds a job message to the queue -> worker processes pick up jobs from the queue -> worker updates database upon completion/failure.
    *   **Benefits:** Improves resilience (tasks are persisted in the queue if workers fail), enables easier retries and dead-letter queue handling for failed jobs, allows independent scaling of task ingestion (API) and task processing (workers), and reduces direct database load from polling.

3.  **Error Handling, Retries, and Idempotency for Tasks:**
    *   Define strategies for handling transient vs. permanent task failures.
    *   Implement retry mechanisms (e.g., exponential backoff) for tasks that might succeed on a subsequent attempt.
    *   Ensure tasks are idempotent where possible, meaning processing the same task multiple times (e.g., after a retry) produces the same result without unintended side effects.

4.  **Security:**
    *   **Authentication & Authorization:** Robust authentication for all API endpoints and authorization to ensure users can only access/manage their own data and tasks.
    *   **Credential Management:** Securely manage database credentials, API keys for third-party services, and any other sensitive configuration using cloud provider secret management services.
    *   **Network Security:** Configure firewalls and network access controls appropriately.

5.  **Deployment & CI/CD:**
    *   Automated CI/CD (Continuous Integration/Continuous Deployment) pipelines for deploying the API server and worker components.
    *   Strategies for database schema migrations in the cloud environment.

6.  **Logging & Monitoring:**
    *   Comprehensive, structured logging for both API requests and task processing lifecycle.
    *   Monitoring dashboards to track API performance, server health, task queue lengths, task success/failure rates, and resource utilization.
    *   Alerting for critical errors or performance degradation.

7.  **Cost Management:**
    *   Be mindful of the costs associated with persistent servers, databases, message queues, data storage, and network egress in the cloud. Choose appropriate instance sizes and services.

Adopting these practices will lead to a more robust, scalable, and maintainable application in a cloud environment. 