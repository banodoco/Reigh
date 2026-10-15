import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./remotion-4.0.503-audio-resume.mjs', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_ROOT = process.env.REMOTION_AUDIO_RESUME_PACKAGE_ROOT
  ? resolve(process.env.REMOTION_AUDIO_RESUME_PACKAGE_ROOT)
  : join(REPO_ROOT, 'node_modules', 'remotion');
const TARGETS_BY_VERSION = {
  '4.0.503': [
    {
      relativePath: 'dist/cjs/audio/shared-audio-tags.js',
      originalSha256: '71bb40afee1be9a9d24fc2ca97dae78428d79270179945f3455d5ef1b68241ea',
      patchedSha256: '4fbf66aac63105d6ecd8c036b7d6db8cb0f800429be6e4a1633a0584994564c5',
    },
    {
      relativePath: 'dist/esm/index.mjs',
      originalSha256: '2fb803a18bd355a3b7dde45fdd0ff857acc6602ba521bf015cca27908285d872',
      patchedSha256: '447802377a5ecf17b7c224d8a209b4a3c92a29e8efb8ee679a283a48ffc0d9a2',
    },
  ],
  '4.0.509': [
    {
      relativePath: 'dist/cjs/audio/shared-audio-tags.js',
      originalSha256: '471b33916a91f5b9529c477bdf0ec586cb700d5a7179ab910a82dd932e172f6c',
      patchedSha256: '949ccec3419398183e8e22f63820a4a57cb8379befb184fbac9a3acde040c5b8',
    },
    {
      relativePath: 'dist/esm/index.mjs',
      originalSha256: '9fdfe58f3f34e6a72564a811ac5d374d1c97a0f535e2a0e3aac198670d9b7ff8',
      patchedSha256: '5a1584f7660fa8fffa7eb8fe016b82a4d719e67d4b7904d4fa4f299eb1355f28',
    },
  ],
};
const VERSION = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
assert.ok(Object.hasOwn(TARGETS_BY_VERSION, VERSION), `unsupported fixture version ${VERSION}`);
const TARGETS = TARGETS_BY_VERSION[VERSION];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(action, root) {
  return spawnSync(process.execPath, [SCRIPT, action, '--root', root], {
    encoding: 'utf8',
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'remotion-audio-resume-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = join(root, 'node_modules', 'remotion');
  await mkdir(packageRoot, { recursive: true });
  await copyFile(join(PACKAGE_ROOT, 'package.json'), join(packageRoot, 'package.json'));
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.name, 'remotion');
  assert.equal(packageJson.version, VERSION);

  // Copy only the two target files. Revert in this isolated fixture so tests
  // always begin with exact pristine bytes, even after the installed package
  // has been patched by its single owner.
  for (const target of TARGETS) {
    const source = join(PACKAGE_ROOT, target.relativePath);
    const destination = join(packageRoot, target.relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  assertSuccess(run('--revert', root));
  for (const target of TARGETS) {
    assert.equal(
      sha256(await readFile(join(packageRoot, target.relativePath))),
      target.originalSha256,
      `${target.relativePath} fixture must start with exact pristine bytes`,
    );
  }
  return { root, packageRoot };
}

test('two-file fixture: check is readonly; apply is exact/idempotent; revert restores pristine bytes', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const paths = TARGETS.map((target) => join(packageRoot, target.relativePath));
  const pristineBytes = await Promise.all(paths.map((path) => readFile(path)));

  assertSuccess(run('--check', root));
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), pristineBytes);

  assertSuccess(run('--apply', root));
  for (let index = 0; index < paths.length; index += 1) {
    assert.equal(sha256(await readFile(paths[index])), TARGETS[index].patchedSha256);
  }

  const beforeIdempotentApply = await Promise.all(paths.map((path) => stat(path)));
  assertSuccess(run('--apply', root));
  const afterIdempotentApply = await Promise.all(paths.map((path) => stat(path)));
  assert.deepEqual(
    afterIdempotentApply.map(({ ino }) => ino),
    beforeIdempotentApply.map(({ ino }) => ino),
    'idempotent apply must not rewrite already-patched files',
  );

  assertSuccess(run('--check', root));
  assertSuccess(run('--revert', root));
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), pristineBytes);
  const beforeIdempotentRevert = await Promise.all(paths.map((path) => stat(path)));
  assertSuccess(run('--revert', root));
  assert.deepEqual(
    (await Promise.all(paths.map((path) => stat(path)))).map(({ ino }) => ino),
    beforeIdempotentRevert.map(({ ino }) => ino),
    'idempotent revert must not rewrite pristine files',
  );
});

test('unknown content refuses before either target is written', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const firstPath = join(packageRoot, TARGETS[0].relativePath);
  const secondPath = join(packageRoot, TARGETS[1].relativePath);
  const firstBefore = await readFile(firstPath);
  const secondBefore = Buffer.concat([
    await readFile(secondPath),
    Buffer.from('\n// unknown fixture content\n'),
  ]);
  await writeFile(secondPath, secondBefore);

  const result = run('--apply', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown content/i);
  assert.deepEqual(await readFile(firstPath), firstBefore);
  assert.deepEqual(await readFile(secondPath), secondBefore);
});

test('unknown version refuses before either target is written', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const packageJsonPath = join(packageRoot, 'package.json');
  const paths = TARGETS.map((target) => join(packageRoot, target.relativePath));
  const before = await Promise.all(paths.map((path) => readFile(path)));
  await writeFile(packageJsonPath, JSON.stringify({ name: 'remotion', version: '4.0.504' }));

  const result = run('--apply', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected remotion@4\.0\.503 or remotion@4\.0\.509/i);
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), before);
});


test('unsupported version and wrong package name refuse without target writes', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const paths = TARGETS.map((target) => join(packageRoot, target.relativePath));
  const before = await Promise.all(paths.map((path) => readFile(path)));
  for (const identity of [
    { name: 'remotion', version: '4.0.510' },
    { name: 'not-remotion', version: VERSION },
    { name: 'remotion', version: [VERSION] },
    { name: 'remotion', version: '__proto__' },
    { name: 'remotion', version: null },
  ]) {
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify(identity));
    for (const action of ['--apply', '--check', '--revert']) {
      const result = run(action, root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /expected remotion@4\.0\.503 or remotion@4\.0\.509/i);
      assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), before);
    }
  }
});

test('known mixed states converge exactly without rewriting the target already in state', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const paths = TARGETS.map((target) => join(packageRoot, target.relativePath));
  const pristineBytes = await Promise.all(paths.map((path) => readFile(path)));
  assertSuccess(run('--apply', root));
  await writeFile(paths[1], pristineBytes[1]);
  assertSuccess(run('--check', root));
  const firstBefore = await stat(paths[0]);
  assertSuccess(run('--apply', root));
  assert.equal((await stat(paths[0])).ino, firstBefore.ino);
  for (let index = 0; index < paths.length; index += 1) {
    assert.equal(sha256(await readFile(paths[index])), TARGETS[index].patchedSha256);
  }
  await writeFile(paths[0], pristineBytes[0]);
  const pristineFirstBefore = await stat(paths[0]);
  assertSuccess(run('--revert', root));
  assert.equal((await stat(paths[0])).ino, pristineFirstBefore.ino);
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(path))), pristineBytes);
});
