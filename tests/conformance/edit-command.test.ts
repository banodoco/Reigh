// App consumer only; fixtures stay in the selected Runtime source worktree.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseEditCommand } from '../../src/tools/video-editor/commands/types.ts';
import { WorkspaceClient } from '../../src/integrations/runtime/generated.ts';
import { readPlacements } from '../../src/shared/lib/placement/documentPlacement.ts';

const fixture = JSON.parse(readFileSync(join(process.env.CONTRACT_COMMAND_RUNTIME_ROOT!, 'conformance/fixtures/edit-command-candidate.json'), 'utf8'));
for (const c of fixture.command_cases) {
  test(`APP-${c.id}`, () => {
    const value = structuredClone(c.value);
    if (c.valid) {
      assert.equal(parseEditCommand(value), value); // adapter keeps resolved/output metadata, no defaulting
      assert.deepEqual(value, c.value);
      assert.deepEqual(JSON.parse(c.raw), value);
      assert.equal(createHash('sha256').update(c.raw).digest('hex'), c.sha256);
    } else assert.throws(() => parseEditCommand(value), TypeError);
    assert.deepEqual(value, c.value);
  });
}
test('APP-NON-JSON', () => {
  for (const value of [NaN, Infinity, undefined]) assert.throws(() => parseEditCommand({ op: 'clip.set', select: null, args: { value } }), TypeError);
});
function frameAt(seconds: number, fps: number) {
  const config = { output: { fps }, clips: [{ id: 'clip-1', at: seconds, hold: 1, asset: 'asset-1' }], pinnedShotGroups: [{ shotId: 'shot-1', clipIds: ['clip-1'], poolGenerationIds: [] }] };
  return readPlacements(config as any, { assets: { 'asset-1': { generationId: 'generation-1' } } } as any).get('shot-1')![0].timelineFrame;
}
for (const c of fixture.frames) {
  test(`APP-${c.id}`, () => {
    assert.equal(frameAt(c.seconds, c.fps), c.frame);
    assert.equal(frameAt(c.frame / c.fps, c.fps), c.frame);
  });
}
for (const c of fixture.anchors) {
  test(`APP-${c.id}`, () => {
    // Astrid owns anchor resolution/flooring; App receives its compiled frame clock.
    assert.equal(frameAt(c.frame / c.fps, c.fps), c.frame);
  });
}
for (const c of fixture.exchanges) {
  test(`APP-${c.id}`, async () => {
    const bodies: Uint8Array[] = [];
    const client = new WorkspaceClient('http://unused', 'synthetic', async (_method, _path, _headers, body) => {
      bodies.push(body!);
      return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify(c.result)) };
    });
    assert.deepEqual(await client.commitTimeline(c.request), c.result);
    assert.deepEqual(await client.commitTimeline(c.request), c.result);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(bodies[0])), c.request);
  });
}
