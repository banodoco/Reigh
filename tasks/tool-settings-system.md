# Tool-Scoped Settings System

_Design document – phase 1 implementation_

## 1  Problem
Tools (Image Generation, Video Travel, Edit Travel, …) all need to remember user choices, but **the correct persistence scope differs**:

* some values apply globally for the user or installation (e.g. preferred theme)
* others should be unique for a project (e.g. default aspect-ratio)
* some belong to an individual shot (e.g. batch frame count)

Today these preferences are scattered (`localStorage`, component state, etc.).  We need a single, type-safe, database-backed mechanism.

## 2  Solution in one picture
```
┌───────────────────────────────┐
│   toolDefaults/<module>       │           hard-coded in codebase
└──────────────┬────────────────┘
               │ overrides ↓
┌──────────────┴────────────────┐
│ user.settings   (users.json)  │           applies to all projects
└──────────────┬────────────────┘
               │ overrides ↓
┌──────────────┴────────────────┐
│ project.settings (projects)   │           applies to all shots in project
└──────────────┬────────────────┘
               │ overrides ↓
┌──────────────┴────────────────┐
│  shot.settings   (shots)      │           most-specific layer
└───────────────────────────────┘
result = deepMerge(default, user, project, shot)
```
The merge is performed server-side and returned to the client in one request.

## 3  Database changes (Drizzle)
Each relevant table gets an additional `settings` column that stores **JSON**:
```sql
ALTER TABLE users    ADD COLUMN settings json;
ALTER TABLE projects ADD COLUMN settings json;
ALTER TABLE shots    ADD COLUMN settings json;
```
Structure of the blob:
```ts
interface SettingsBlob {
  [toolId: string]: unknown;   // e.g. "video-travel": { galleryColumns: 3 }
}
```
Namespacing by `toolId` prevents collisions.

### Why not a separate table?
* Simpler joins (none).  A single row fetch gives you everything.
* SQLite → easy JSON querying with `json_extract` if ever needed.

## 4  Server service
File: `src/server/services/toolSettingsService.ts`
```ts
export async function resolveToolSettings(toolId: string, ctx: {
  userId: string; projectId?: string; shotId?: string;
}) {
  const [user, project, shot] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, ctx.userId) }),
    ctx.projectId ? db.query.projects.findFirst({ where: eq(projects.id, ctx.projectId) }) : null,
    ctx.shotId    ? db.query.shots.findFirst({ where: eq(shots.id, ctx.shotId) })         : null,
  ]);

  return deepMerge(
    toolDefaults[toolId],
    user?.settings?.[toolId]    ?? {},
    project?.settings?.[toolId] ?? {},
    shot?.settings?.[toolId]    ?? {},
  );
}
```
HTTP API:
* `GET /api/tool-settings/resolve?toolId=&projectId=&shotId=`
* `PATCH /api/tool-settings` -> `{ scope: 'user'|'project'|'shot', id: string, toolId, patch }`

## 5  Front-end hook
`src/shared/hooks/useToolSettings.ts`:
```ts
export function useToolSettings(toolId: string, ids: {
  projectId?: string; shotId?: string;
}) {
  const { data } = useQuery({
    queryKey: ['tool-settings', toolId, ids],
    queryFn: () => api.getToolSettings(toolId, ids),
  });

  const update = (patch: unknown, scope: 'user'|'project'|'shot') =>
    api.patchToolSettings({ scope, toolId, patch, id: ids[scope + 'Id'] });

  return { settings: data, update };
}
```
### Loading values from a **previous shot**
Because the hook just needs an arbitrary `shotId`, a tool can present a "Copy settings from…" UI:
```ts
const prev = await api.getToolSettings('video-travel', { shotId: previousShotId });
update(prev, 'shot'); // overwrite current shot settings
```
That is already what Image-Generation does today when you click "Use These Settings" in the Task Details modal – the new system simply replaces hard-coded field lists with a single blob.

## 6  Module descriptor per tool
Every tool ships `settings.ts`:
```ts
export const imageGenerationSettings = {
  id: 'image-generation',
  scope: ['project', 'shot'],
  defaults: {
    sampler: 'DDIM',
    negativePrompt: '',
    ui: { galleryColumns: 4 },
  },
} as const;
```
Collected centrally:
```ts
export const toolDefaults = {
  'image-generation': imageGenerationSettings.defaults,
  // ...other tools
};
```

## 7  Adoption plan
1. Write DB migration & regenerate Drizzle types.
2. Implement server service + REST routes.
3. Add `useToolSettings` hook.
4. Replace localStorage code in **Image Generation** as pilot.
5. Port remaining tools incrementally.

## 8  Benefits
* Single source-of-truth for user preferences.
* Per-tool isolation – no accidental key clashes.
* Cheap to query and mutate.
* Flexible layering makes "load previous shot's settings" a one-liner.
* Clean path to sync across devices because it lives in the DB.

---
_© Reigh Architects, 2025_ 