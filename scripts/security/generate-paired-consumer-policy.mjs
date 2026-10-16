/** Offline generation: execute only current App client operations against a fake transport. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WorkspaceClient } from '../../src/integrations/runtime/generated.ts';

const project = 'fixture-project', timeline = 'fixture-timeline', revision = 'fixture-revision';
const object = 'fixture-object', task = 'fixture-task', generation = 'fixture-generation';
const key = 'disposable-key';
// Optional arguments deliberately exercise consumer-produced headers, including media metadata.
const fixtures = {
  health: [], handshake: ['reigh-browser', 'fixture', []], getRealm: [],
  listProjects: [], getProject: [project], updateProject: [project, key, 1, 'Disposable'],
  listTimelines: [project], getProjectTimeline: [project, timeline],
  inspectTimeline: [project, timeline, {}], publishParentComposition: [project, timeline, {}, key],
  listProjectParentCompositionRevisions: [project, timeline],
  getProjectParentCompositionRevision: [project, timeline, revision],
  restoreProjectParentCompositionRevision: [project, timeline, revision, null, key],
  getProjectShotRevision: [project, 'fixture-shot', revision],
  getProjectTimelineRevision: [project, timeline, revision],
  updateTimelineDocument: [project, timeline, 1, key, {}, {}],
  commitTimeline: [{
    api_version: 1, project_id: project, timeline_id: timeline, request_id: key,
    session_id: 'disposable-session', session_sequence: 1,
    base_revision_id: revision, base_publication_id: null,
    scope: { target: 'parent', complete: [], projection_version: 1 },
    change: { commands: [] }, source: { via: 'app' }, dry_run: false,
  }],
  ingestProjectObject: [project, new Uint8Array([0]), 'image/png', key, 'disposable.png'],
  importProjectMedia: [project, new Uint8Array([0]), 'image/png', key, { filename: 'disposable.png', expectedDigest: 'sha256:fixture', width: 1, height: 1, durationSeconds: 1 }],
  getProjectMediaImport: [project, 'fixture-import'], getProjectObjectLocation: [project, object],
  listGenerations: [project], getGeneration: [generation], listVariants: [generation],
  markVariantViewed: ['fixture-variant', key], markGenerationVariantsViewed: [generation, key],
  listCapabilities: [], admitTask: [{ capability_id: 'fixture', capability_digest: 'fixture', input_object_ids: [] }, key],
  getTask: [task], listProjectTasks: [project], listEvents: [undefined, 50, task],
  cancelTask: [task, key, 1], retryTask: [task, key, 1],
  listManagedOutputs: [task], getManagedOutput: ['fixture-output'], exportManagedOutput: ['fixture-output', 'disposable.png', key],
  getSourceFrameThumbnail: [project, object, 0], ensureSourceFrameThumbnail: [project, {}, key],
  getObject: [object, [0, 1]], headObject: [object, [0, 1]],
};
const root = new URL('../../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
const productSource = source('src/integrations/runtime/client.ts');
const used = [...new Set([...productSource.matchAll(/this\.client\.(\w+)\(/g)].map(m => m[1]))].sort();
if (JSON.stringify(used) !== JSON.stringify(Object.keys(fixtures).sort())) throw new Error('Product client operation set changed: review fixtures before regenerating');

const ids = new Map([[project, ':project'], [timeline, ':timeline'], [revision, ':revision'], [object, ':object'], [task, ':task'], [generation, ':generation'], ['fixture-shot', ':shot'], ['fixture-import', ':import'], ['fixture-variant', ':variant'], ['fixture-output', ':output']]);
const normalize = path => path.split('?', 1)[0].split('/').map(part => part.startsWith('timeline%3A') ? 'timeline%3A:timeline' : ids.get(part) ?? part).join('/');
const records = [];
let operation;
const client = new WorkspaceClient('', undefined, async (method, path, headers) => {
  records.push({ operation, method, path: normalize(path), headers: Object.keys(headers).map(h => h.toLowerCase()).sort() });
  return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify({ content: {}, version: 1, data: {}, receipt: {}, items: [], next_cursor: null, thumbnail: null })) };
});
for (const [name, args] of Object.entries(fixtures)) { operation = name; await client[name](...args); }
// Astrid's workspace.v1 consumers share these generated contracts, plus project creation.
// Retired legacy bridge paths and diagnostic endpoints have no admitted producer here.
const astridOperations = new Set(['health', 'listProjects', 'updateProject', 'listTimelines', 'getProjectTimeline', 'ingestProjectObject', 'getObject', 'headObject', 'admitTask', 'getTask', 'listProjectTasks', 'listEvents', 'cancelTask', 'listGenerations', 'getGeneration', 'listVariants', 'listCapabilities']);
operation = 'createProject';
await client.createProject('Disposable', key, 'disposable');
astridOperations.add(operation);
operation = 'listProjectObjects';
await client.listProjectObjects(project);
astridOperations.add(operation);
const entries = records.flatMap(record => [
  ...(['createProject', 'listProjectObjects'].includes(record.operation) ? [] : [{ service: 'runtime', ...record }]),
  ...(astridOperations.has(record.operation) ? [{ service: 'astrid', ...record }] : []),
]);
const inputs = ['src/integrations/runtime/generated.ts', 'src/integrations/runtime/client.ts', 'src/integrations/astrid/projectRoutes.ts', 'src/integrations/astrid/taskRoutes.ts', 'src/integrations/astrid/objectRoutes.ts', 'src/integrations/astrid/galleryRoutes.ts', 'src/integrations/astrid/workspaceV1.ts', 'src/shared/auth/bridgeSession.ts', 'src/integrations/astrid/mediaRoutes.ts', 'src/integrations/astrid/capabilityCensus.ts', 'src/integrations/astrid/catalogRoutes.ts', 'src/integrations/astrid/timelineRoutes.ts', 'src/integrations/astrid/transport.ts', 'src/shared/lib/taskCreation/imageGeneration.ts', 'config/vite/astridGenerationCompose.ts'];
const digests = Object.fromEntries(inputs.map(path => [path, createHash('sha256').update(source(path)).digest('hex')]));
const composeRoute = source('src/shared/lib/taskCreation/imageGeneration.ts').match(/const IMAGE_COMPOSE_ROUTE = '([^']+)'/)[1];
if (!source('config/vite/astridGenerationCompose.ts').includes(`ASTRID_GENERATION_COMPOSE_ROUTE = '${composeRoute}'`)) throw new Error('Compose consumer/producer route mismatch');
const output = `// Generated by scripts/security/generate-paired-consumer-policy.mjs; do not edit.\n// Routes are observed from the generated client with disposable offline fixtures.\nexport const PAIRED_COMPOSE_ROUTE = ${JSON.stringify(composeRoute)};\nexport const PAIRED_CONSUMER_SOURCE_DIGESTS = ${JSON.stringify(digests, null, 2)} as const;\nexport const PAIRED_CONSUMER_ROUTES = [\n${entries.map(entry => '  ' + JSON.stringify(entry)).join(',\n')}\n] as const;\n`;
const destination = new URL('config/vite/pairedConsumerPolicy.generated.ts', root);
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output) throw new Error('Consumer policy is stale; regenerate and review route/header changes');
} else writeFileSync(destination, output);
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Generated'} ${entries.length} consumer route observations (${used.length} product operations)`);
