import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const json = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function files(directory, prefix = '') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    assert.ok(!entry.isSymbolicLink(), `unexpected symlink ${relative}`);
    if (entry.isDirectory()) found.push(...await files(path.join(directory, entry.name), relative));
    else found.push(relative);
  }
  return found.sort();
}

test('vendored Composition bytes match the exact admitted source inventory', async () => {
  const identity = await json('vendor/timeline-composition.source.json');
  assert.equal(identity.source_commit, '3b9640335b9b8c07b350c2e37eea328877b58912');
  assert.equal(identity.source_tree, '28ec5263433998ad75053ca3a02ba33b3533a8a0');
  assert.equal(identity.archive_sha256, '8f48e7d9cddf35621280395f2b8fb6878413a27588f11406bc58313c044221a6');
  assert.equal(identity.required_ref_authenticated, false);
  const vendor = path.join(root, 'vendor/timeline-composition');
  assert.deepEqual(await files(vendor), identity.files.map((file) => file.path).sort());
  assert.equal(identity.files.length, 28);
  for (const file of identity.files) {
    const bytes = await readFile(path.join(vendor, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha256(bytes), file.sha256, file.path);
  }
  const packageJson = await json('vendor/timeline-composition/package.json');
  assert.equal(packageJson.version, '0.0.7');
  assert.equal(packageJson.exports['./evaluation'].import, './typescript/src/evaluation.ts');
});

test('App consumer and exact lock records declare Remotion 4.0.509', async () => {
  const manifest = await json('package.json');
  const lock = await json('package-lock.json');
  for (const section of ['dependencies', 'devDependencies']) {
    assert.deepEqual(lock.packages[''][section], manifest[section]);
    for (const [name, version] of Object.entries(manifest[section])) {
      if (name !== 'remotion' && !name.startsWith('@remotion/')) continue;
      assert.equal(version, '4.0.509', name);
      assert.equal(lock.packages[`node_modules/${name}`].version, version, name);
    }
  }
  assert.equal(lock.packages['node_modules/@remotion/licensing'].version, '4.0.509');
  assert.equal(lock.packages['node_modules/@remotion/media/node_modules/zod'].version,
    lock.packages['node_modules/@remotion/media'].dependencies.zod);
});

test('vendored manifest and linked lock metadata agree without rewriting package bytes', async () => {
  const manifest = await json('vendor/timeline-composition/package.json');
  const lock = await json('package-lock.json');
  const entry = lock.packages['vendor/timeline-composition'];
  for (const key of ['name', 'version', 'dependencies', 'devDependencies', 'peerDependencies']) {
    assert.deepEqual(entry[key], manifest[key], key);
  }
  const schema = lock.packages['vendor/timeline-composition/node_modules/@banodoco/timeline-schema'];
  assert.equal(schema.resolved, manifest.dependencies['@banodoco/timeline-schema']);
  assert.equal(schema.version, '0.0.1');
});

for (const version of ['4.0.509', '4.0.503']) {
  test(`audio patch refuses unauthenticated ${version} bytes without writes`, async (t) => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'renderer-pin-'));
    t.after(() => rm(fixture, { recursive: true, force: true }));
    const packageRoot = path.join(fixture, 'node_modules/remotion');
    await mkdir(packageRoot, { recursive: true });
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'remotion', version }));
    const targets = ['dist/cjs/audio/shared-audio-tags.js', 'dist/esm/index.mjs'];
    const sentinel = Buffer.from('// deliberately unauthenticated synthetic source\n');
    for (const target of targets) {
      await mkdir(path.dirname(path.join(packageRoot, target)), { recursive: true });
      await writeFile(path.join(packageRoot, target), sentinel);
    }
    const result = spawnSync(process.execPath,
      [path.join(root, 'scripts/patches/remotion-4.0.503-audio-resume.mjs'), '--apply', '--root', fixture],
      { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, version === '4.0.509' ? /expected remotion@4\.0\.503/ : /unknown content/);
    for (const target of targets) assert.deepEqual(await readFile(path.join(packageRoot, target)), sentinel);
  });
}
