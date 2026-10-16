import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = path.join(ROOT, 'scripts/patches/remotion-4.0.509-audio-resume.mjs');
const ACTUAL_ROOT = process.env.REMOTION_509_CHECK_ROOT || ROOT;
const HAS_REMOTION_SOURCE = fs.existsSync(path.join(ACTUAL_ROOT, 'node_modules/remotion/package.json'));
const TARGETS = [
  {
    relativePath: 'dist/cjs/audio/shared-audio-tags.js',
    upstreamSha256: '471b33916a91f5b9529c477bdf0ec586cb700d5a7179ab910a82dd932e172f6c',
    patchedSha256: '949ccec3419398183e8e22f63820a4a57cb8379befb184fbac9a3acde040c5b8',
  },
  {
    relativePath: 'dist/esm/index.mjs',
    upstreamSha256: '9fdfe58f3f34e6a72564a811ac5d374d1c97a0f535e2a0e3aac198670d9b7ff8',
    patchedSha256: '5a1584f7660fa8fffa7eb8fe016b82a4d719e67d4b7904d4fa4f299eb1355f28',
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(action, root) {
  return spawnSync(process.execPath, [SCRIPT, action, '--root', root], { encoding: 'utf8' });
}

function fixture(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remotion-509-guard-'));
  const packageRoot = path.join(root, 'node_modules/remotion');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'remotion', version }),
  );
  return { root, packageRoot };
}

test(
  'the exact 4.0.509 CJS and ESM source patch applies and remains stable',
  { skip: !HAS_REMOTION_SOURCE },
  () => {
    const files = TARGETS.map((target) =>
      path.join(ACTUAL_ROOT, 'node_modules/remotion', target.relativePath),
    );
    const before = files.map((file) => sha256(fs.readFileSync(file)));
    before.forEach((digest, index) => {
      assert.ok(
        [TARGETS[index].upstreamSha256, TARGETS[index].patchedSha256].includes(digest),
        'target must be exact upstream or patched 4.0.509 bytes',
      );
    });

    const apply = run('--apply', ACTUAL_ROOT);
    assert.equal(apply.status, 0, apply.stdout + apply.stderr);
    const patched = files.map((file) => sha256(fs.readFileSync(file)));
    assert.deepEqual(patched, TARGETS.map((target) => target.patchedSha256));

    const check = run('--check', ACTUAL_ROOT);
    assert.equal(check.status, 0, check.stdout + check.stderr);
    const repeatApply = run('--apply', ACTUAL_ROOT);
    assert.equal(repeatApply.status, 0, repeatApply.stdout + repeatApply.stderr);
    assert.deepEqual(files.map((file) => sha256(fs.readFileSync(file))), patched);
  },
);

test('unknown Remotion file bytes refuse before either file is changed', (t) => {
  const { root, packageRoot } = fixture('4.0.509');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = TARGETS.map((target) => {
    const file = path.join(packageRoot, target.relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'unknown fixture bytes for ' + target.relativePath + '\n');
    return file;
  });
  const before = files.map((file) => fs.readFileSync(file));
  const result = run('--apply', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown content/i);
  assert.deepEqual(files.map((file) => fs.readFileSync(file)), before);
});

test('unknown Remotion version refuses before target files are read or written', (t) => {
  const { root, packageRoot } = fixture('4.0.508');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = run('--apply', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected remotion@4\.0\.509/i);
  assert.deepEqual(
    fs.readdirSync(packageRoot),
    ['package.json'],
    'version preflight must stop before touching either CJS or ESM file',
  );
});
