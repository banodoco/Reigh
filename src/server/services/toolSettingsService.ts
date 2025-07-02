import { db } from '../../lib/db';
import { users, projects, shots } from '../../../db/schema/schema';
import { eq } from 'drizzle-orm';
import { toolsManifest } from '../../tools';

// Tool defaults registry - automatically populated from tools manifest
export const toolDefaults: Record<string, unknown> = Object.fromEntries(
  toolsManifest.map(toolSettings => [toolSettings.id, toolSettings.defaults])
);

// Deep merge helper
function deepMerge(target: any, ...sources: any[]): any {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export interface ToolSettingsContext {
  userId: string;
  projectId?: string;
  shotId?: string;
}

export async function resolveToolSettings(
  toolId: string,
  ctx: ToolSettingsContext
): Promise<unknown> {
  console.log('[ToolSettingsDebug] DB-resolve', { toolId, ...ctx });
  const [user, project, shot] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, ctx.userId) }),
    ctx.projectId ? db.query.projects.findFirst({ where: eq(projects.id, ctx.projectId) }) : null,
    ctx.shotId ? db.query.shots.findFirst({ where: eq(shots.id, ctx.shotId) }) : null,
  ]);

  const userSettings = (user?.settings as any)?.[toolId] ?? {};
  const projectSettings = (project?.settings as any)?.[toolId] ?? {};
  const shotSettings = (shot?.settings as any)?.[toolId] ?? {};

  return deepMerge(
    {},
    toolDefaults[toolId] ?? {},
    userSettings,
    projectSettings,
    shotSettings
  );
}

export type SettingsScope = 'user' | 'project' | 'shot';

export interface UpdateToolSettingsParams {
  scope: SettingsScope;
  id: string; // userId, projectId, or shotId depending on scope
  toolId: string;
  patch: unknown;
}

export async function updateToolSettings(params: UpdateToolSettingsParams): Promise<void> {
  const { scope, id, toolId, patch } = params;

  switch (scope) {
    case 'user': {
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) throw new Error('User not found');
      
      const currentSettings = (user.settings as any) ?? {};
      console.log('[ToolSettingsDebug] DB-update', { scope: 'user', id, toolId, patch });
      const toolSettings = currentSettings[toolId] ?? {};
      const updatedToolSettings = deepMerge({}, toolSettings, patch);
      
      await db.update(users)
        .set({ settings: { ...currentSettings, [toolId]: updatedToolSettings } })
        .where(eq(users.id, id));
      break;
    }
    
    case 'project': {
      const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
      if (!project) throw new Error('Project not found');
      
      const currentSettings = (project.settings as any) ?? {};
      console.log('[ToolSettingsDebug] DB-update', { scope: 'project', id, toolId, patch });
      const toolSettings = currentSettings[toolId] ?? {};
      const updatedToolSettings = deepMerge({}, toolSettings, patch);
      
      await db.update(projects)
        .set({ settings: { ...currentSettings, [toolId]: updatedToolSettings } })
        .where(eq(projects.id, id));
      break;
    }
    
    case 'shot': {
      const shot = await db.query.shots.findFirst({ where: eq(shots.id, id) });
      if (!shot) throw new Error('Shot not found');
      
      const currentSettings = (shot.settings as any) ?? {};
      console.log('[ToolSettingsDebug] DB-update', { scope: 'shot', id, toolId, patch });
      const toolSettings = currentSettings[toolId] ?? {};
      const updatedToolSettings = deepMerge({}, toolSettings, patch);
      
      await db.update(shots)
        .set({ settings: { ...currentSettings, [toolId]: updatedToolSettings } })
        .where(eq(shots.id, id));
      break;
    }
    
    default:
      throw new Error(`Invalid scope: ${scope}`);
  }
} 