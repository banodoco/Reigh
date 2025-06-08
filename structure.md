# Project Structure & High-Level Overview (Restructured)

## 1. Tech Stack & Ports

### Frontend
- Vite + React + TypeScript (Bundling & UI Framework)
- TailwindCSS + shadcn-ui (Styling & Component Primitives)
- @tanstack/react-query (Server-State Caching)
- react-router-dom (Client-Side Routing)
- @dnd-kit/core & @dnd-kit/sortable (Drag-and-Drop Interactions)
- Sonner (customized) (Notifications)

### Backend
- Express.js (Node.js) (API Server & Backend Logic)
- Supabase (Postgres DB, Storage, Typed Client)
- FAL-AI Cloud API (Image Generation)

### Database
- Drizzle ORM (Schema, Migrations, Data Access - PG & SQLite)

### Ports
- Frontend (Vite): 2222 (Development Server)
- Backend (Express): 8085 (env: PORT) (API Server)

## 2. Directory Layout

### Top-Level Structure
| Path | Purpose |
|------|---------|
| /src/app | Core app setup (entrypoint, global providers, routing shell) |
| /src/pages | Top-level page components (Tool Selector, NotFound, etc.) |
| /src/tools | Parent directory for distinct tool modules |
| /src/shared | Shared components, hooks, utilities, contexts, layouts |
| /src/server | Backend API server (Express.js) |
| /src/types | Shared TypeScript interfaces |
| /src/integrations | Supabase & FAL-AI client setup |
| /db | Drizzle ORM setup (schema, migrations, seed) |
| /public | Static assets |
| /supabase | Supabase CLI/config |
| /dist | Build output (auto-generated) |

### 2.1 Database (Drizzle ORM: PostgreSQL & SQLite)
- Schema: `/db/schema/schema.ts` (Canonical, PostgreSQL-first)
- Configs:
  - `drizzle.config.ts`: PostgreSQL (Supabase) migrations
  - `drizzle-sqlite.config.ts`: SQLite (local) migrations
- Migrations:
  - PostgreSQL: `/db/migrations/`
  - SQLite: `/db/migrations-sqlite/`
- Seeding: `/db/seed.ts`
- DAL: `/src/lib/db/index.ts`

## 3. Source Code Breakdown

### 3.1 Core Application (src/app/)
- `main.tsx`: Mounts <App/>
- `App.tsx`: Global providers
- `routes.tsx`: Centralized routing
- `Layout.tsx`: Main layout components

#### 3.1.1 Environment Configuration
- `VITE_APP_ENV`: (dev, local, web)
- `VITE_API_TARGET_URL`: Vite proxy target
- Tool Visibility: Controlled by AppEnv[]

### 3.2 Top-Level Pages (src/pages/)
- `ToolSelectorPage.tsx`: Main entry
- `NotFoundPage.tsx`: 404 fallback
- `ShotsPage.tsx`: Project shots listing
- `GenerationsPage.tsx`: Project media gallery

### 3.3 Tool Modules (src/tools/)

#### 3.3.1 Image Generation
- Main components in `src/tools/image-generation/`
- Handles image generation workflow
- Includes form controls and gallery display

#### 3.3.2 Video Travel
- Located in `src/tools/video-travel/`
- Manages video generation from image sequences
- Includes shot management and editing

#### 3.3.3 Edit Travel
- Found in `src/tools/edit-travel/`
- Handles image editing and transformations
- Integrates with Fal API

### 3.4 Shared Elements (src/shared/)
- Components: UI elements, modals, galleries
- Hooks: Data management, WebSocket handling
- Contexts: Global state management
- Libraries: Utilities and helpers

### 3.5 Integrations
- Supabase client configuration
- Fal-AI integration
- Type definitions

## 4. High-Level Data Flow
- Project Management
- Tool-specific workflows
- Real-time updates
- Data persistence

## 5. Real-time Features
- Task Processing
- WebSocket Updates
- UI Synchronization

## 6. Persistence Layers
### Database Tables
- users
- shots
- shot_generations
- tasks
- generations

### Storage
- Supabase storage for media files

## 7. API Endpoints
Comprehensive REST API covering:
- Project management
- Shot operations
- Generation handling
- Task management
- Media processing
