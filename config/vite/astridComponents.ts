import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Trusted build configuration only. Pack paths never arrive from browser data. */
export function createAstridComponentsPlugin(sourceRoot: string, env: NodeJS.ProcessEnv): Plugin {
  const virtual = 'virtual:astrid-components';
  let projection: {module: string; files: Record<string, string>} | undefined;
  return {
    name: 'astrid-v3-components',
    buildStart() {
      projection = undefined;
      if (!env.ASTRID_COMPONENTS) return;
      if (!env.ASTRID_COMPONENT_PACK_ROOTS || !env.ASTRID_COMPONENT_STAGE_DIR) {
        throw new Error('Configured components require explicit trusted roots and a private staging directory');
      }
      const result = spawnSync(env.ASTRID_COMPONENT_PYTHON || 'python3', ['-m', 'astrid.core.pack.component_consumer'], {
        cwd: path.dirname(sourceRoot),
        env: {...env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: path.dirname(sourceRoot)},
        encoding: 'utf8',
        input: JSON.stringify({requests: JSON.parse(env.ASTRID_COMPONENTS),
          trusted_roots: JSON.parse(env.ASTRID_COMPONENT_PACK_ROOTS),
          output: env.ASTRID_COMPONENT_STAGE_DIR, host: 'app'}),
      });
      if (result.error || result.status !== 0) throw new Error(`Component admission failed: ${result.error ?? result.stderr}`);
      projection = JSON.parse(result.stdout);
    },
    resolveId(id) { if (id === virtual) return '\0' + virtual; },
    load(id) {
      if (id === '\0' + virtual) return projection
        ? `export {componentBindings} from ${JSON.stringify(projection.module)};`
        : 'export const componentBindings = [];';
      const filename = id.split('?')[0];
      if (projection && Object.hasOwn(projection.files, filename)) {
        const bytes = fs.readFileSync(filename);
        if (createHash('sha256').update(bytes).digest('hex') !== projection.files[filename]) {
          throw new Error(`Stale staged component source: ${filename}`);
        }
        return bytes.toString('utf8');
      }
    },
  };
}
