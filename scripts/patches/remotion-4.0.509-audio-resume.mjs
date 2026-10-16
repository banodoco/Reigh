#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const EXPECTED_VERSION = '4.0.509';
const PACKAGE_RELATIVE = join('node_modules', 'remotion');
const TARGETS = [
  {
    relativePath: join('dist', 'cjs', 'audio', 'shared-audio-tags.js'),
    upstreamSha256: '471b33916a91f5b9529c477bdf0ec586cb700d5a7179ab910a82dd932e172f6c',
    patchedSha256: '949ccec3419398183e8e22f63820a4a57cb8379befb184fbac9a3acde040c5b8',
    upstreamSnippet:
      '(0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve);',
    patchedSnippet:
      'resumePromise.then(() => (0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve), () => {});',
  },
  {
    relativePath: join('dist', 'esm', 'index.mjs'),
    upstreamSha256: '9fdfe58f3f34e6a72564a811ac5d374d1c97a0f535e2a0e3aac198670d9b7ff8',
    patchedSha256: '5a1584f7660fa8fffa7eb8fe016b82a4d719e67d4b7904d4fa4f299eb1355f28',
    upstreamSnippet:
      'waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve);',
    patchedSnippet:
      'resumePromise.then(() => waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve), () => {});',
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function preflight(projectRoot, action) {
  const packageRoot = resolve(projectRoot, PACKAGE_RELATIVE);
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  if (packageJson.name !== 'remotion' || packageJson.version !== EXPECTED_VERSION) {
    throw new Error(
      'Refusing Remotion ' +
        (packageJson.name ?? '(unnamed)') +
        '@' +
        (packageJson.version ?? '(unknown)') +
        '; expected remotion@' +
        EXPECTED_VERSION,
    );
  }

  const verified = [];
  for (const target of TARGETS) {
    const absolutePath = join(packageRoot, target.relativePath);
    const [bytes, fileStat] = await Promise.all([readFile(absolutePath), lstat(absolutePath)]);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new Error('Refusing non-regular Remotion audio file at ' + absolutePath);
    }

    const digest = sha256(bytes);
    if (digest === target.patchedSha256) {
      if (!bytes.includes(Buffer.from(target.patchedSnippet, 'utf8'))) {
        throw new Error('Patched Remotion 4.0.509 bytes lack the native-resume fence at ' + absolutePath);
      }
      verified.push({ absolutePath, relativePath: target.relativePath, bytes, changed: false });
      continue;
    }

    if (digest !== target.upstreamSha256) {
      throw new Error(
        'Refusing unknown content at ' +
          absolutePath +
          ' (sha256 ' +
          digest +
          '); no files were written',
      );
    }

    const upstreamSnippet = Buffer.from(target.upstreamSnippet, 'utf8');
    const patchedSnippet = Buffer.from(target.patchedSnippet, 'utf8');
    const offset = bytes.indexOf(upstreamSnippet);
    if (offset === -1 || bytes.indexOf(upstreamSnippet, offset + upstreamSnippet.length) !== -1) {
      throw new Error('Known Remotion 4.0.509 source lacks a unique resume site at ' + absolutePath);
    }
    const patchedBytes = Buffer.concat([
      bytes.subarray(0, offset),
      patchedSnippet,
      bytes.subarray(offset + upstreamSnippet.length),
    ]);
    if (sha256(patchedBytes) !== target.patchedSha256) {
      throw new Error('Exact Remotion 4.0.509 source produced an unexpected patch at ' + absolutePath);
    }
    verified.push({ absolutePath, relativePath: target.relativePath, bytes: patchedBytes, changed: true });
  }

  if (action === 'check' && verified.some((target) => target.changed)) {
    const unpatched = verified.filter((target) => target.changed).map((target) => target.relativePath);
    throw new Error('Remotion 4.0.509 audio-resume patch is missing from ' + unpatched.join(', ') + '; no files were written');
  }
  return verified;
}

function parseArgs(argv) {
  let action;
  let projectRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (['--apply', '--check'].includes(arg)) {
      if (action) throw new Error('Choose exactly one of --apply or --check');
      action = arg.slice(2);
      continue;
    }
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--root requires a project root path');
      projectRoot = resolve(value);
      index += 1;
      continue;
    }
    throw new Error('Unknown argument: ' + arg);
  }
  if (!action) throw new Error('Choose one of --apply or --check');
  return { action, projectRoot };
}

function usage() {
  return [
    'Usage: node scripts/patches/remotion-4.0.509-audio-resume.mjs --apply|--check [--root <project-root>]',
    '--check is read-only and accepts only the exact patched 4.0.509 CJS and ESM files.',
    '--apply patches only the exact upstream 4.0.509 files; it is idempotent and refuses unknown bytes.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage() + '\n');
    return;
  }

  const verified = await preflight(args.projectRoot, args.action);
  const changed = verified.filter((target) => target.changed);
  if (args.action === 'apply') {
    for (const target of changed) await writeFile(target.absolutePath, target.bytes);
    process.stdout.write(
      (changed.length ? 'Applied exact 4.0.509 audio-resume patch to ' : 'Verified; no patch needed for ') +
        verified.map((target) => target.relativePath + '=' + sha256(target.bytes)).join(', ') +
        '\n',
    );
    return;
  }

  process.stdout.write(
    'Read-only preflight passed for remotion@' +
      EXPECTED_VERSION +
      ': ' +
      verified.map((target) => target.relativePath + '=' + sha256(target.bytes)).join(', ') +
      '\n',
  );
}

main().catch((error) => {
  process.stderr.write('Remotion 4.0.509 audio-resume guard refused/failed: ' + error.message + '\n');
  process.exitCode = 1;
});
