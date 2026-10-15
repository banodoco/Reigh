#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { open, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

// Keep this entrypoint stable for both exact admitted package consumers.
const PACKAGE_RELATIVE = join('node_modules', 'remotion');
const TARGETS_BY_VERSION = {
  '4.0.503': [
    {
      relativePath: join('dist', 'cjs', 'audio', 'shared-audio-tags.js'),
      originalSha256: '71bb40afee1be9a9d24fc2ca97dae78428d79270179945f3455d5ef1b68241ea',
      patchedSha256: '4fbf66aac63105d6ecd8c036b7d6db8cb0f800429be6e4a1633a0584994564c5',
      originalLine:
        '(0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(ctxAndGain.audioContext, logLevel).then(resolve);',
      patchedLine:
        'resumePromise.then(() => (0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(ctxAndGain.audioContext, logLevel).then(resolve), () => {});',
    },
    {
      relativePath: join('dist', 'esm', 'index.mjs'),
      originalSha256: '2fb803a18bd355a3b7dde45fdd0ff857acc6602ba521bf015cca27908285d872',
      patchedSha256: '447802377a5ecf17b7c224d8a209b4a3c92a29e8efb8ee679a283a48ffc0d9a2',
      originalLine:
        'waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel).then(resolve);',
      patchedLine:
        'resumePromise.then(() => waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel).then(resolve), () => {});',
    },
  ],
  '4.0.509': [
    {
      relativePath: join('dist', 'cjs', 'audio', 'shared-audio-tags.js'),
      originalSha256: '471b33916a91f5b9529c477bdf0ec586cb700d5a7179ab910a82dd932e172f6c',
      patchedSha256: '949ccec3419398183e8e22f63820a4a57cb8379befb184fbac9a3acde040c5b8',
      originalLine:
        '(0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve);',
      patchedLine:
        'resumePromise.then(() => (0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve), () => {});',
    },
    {
      relativePath: join('dist', 'esm', 'index.mjs'),
      originalSha256: '9fdfe58f3f34e6a72564a811ac5d374d1c97a0f535e2a0e3aac198670d9b7ff8',
      patchedSha256: '5a1584f7660fa8fffa7eb8fe016b82a4d719e67d4b7904d4fa4f299eb1355f28',
      originalLine:
        'waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve);',
      patchedLine:
        'resumePromise.then(() => waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve), () => {});',
    },
  ],
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function replaceExactlyOnce(bytes, from, to, label) {
  const text = bytes.toString('utf8');
  const occurrences = text.split(from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected one exact patch line, found ${occurrences}`);
  }
  return Buffer.from(text.replace(from, to), 'utf8');
}

async function preflight(projectRoot) {
  const packageRoot = resolve(projectRoot, PACKAGE_RELATIVE);
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const targets = typeof packageJson.version === 'string' && Object.hasOwn(TARGETS_BY_VERSION, packageJson.version)
    ? TARGETS_BY_VERSION[packageJson.version]
    : null;
  if (packageJson.name !== 'remotion' || !targets) {
    throw new Error(
      `Refusing Remotion ${packageJson.name ?? '(unnamed)'}@${packageJson.version ?? '(unknown)'}; expected ${Object.keys(TARGETS_BY_VERSION).map((version) => `remotion@${version}`).join(' or ')}`,
    );
  }

  // Read and classify every target before any caller can write either file.
  return Promise.all(
    targets.map(async (target) => {
      const absolutePath = join(packageRoot, target.relativePath);
      const [bytes, fileStat] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
      const digest = sha256(bytes);
      let state;
      if (digest === target.originalSha256) state = 'pristine';
      else if (digest === target.patchedSha256) state = 'patched';
      else {
        throw new Error(
          `Refusing unknown content at ${absolutePath} (sha256 ${digest}); no files were written`,
        );
      }
      return { ...target, version: packageJson.version, absolutePath, bytes, mode: fileStat.mode & 0o777, state };
    }),
  );
}

function transformedBytes(entry, direction) {
  const toPatched = direction === 'apply';
  const bytes = replaceExactlyOnce(
    entry.bytes,
    toPatched ? entry.originalLine : entry.patchedLine,
    toPatched ? entry.patchedLine : entry.originalLine,
    entry.absolutePath,
  );
  const expectedDigest = toPatched ? entry.patchedSha256 : entry.originalSha256;
  const actualDigest = sha256(bytes);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `${entry.absolutePath}: transformed bytes did not match expected sha256 ${expectedDigest} (got ${actualDigest})`,
    );
  }
  return bytes;
}

async function stageFile(targetPath, bytes, mode) {
  const tempPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.remotion-audio-resume-${process.pid}-${randomBytes(6).toString('hex')}.tmp`,
  );
  const handle = await open(tempPath, 'wx', mode);
  try {
    await handle.writeFile(bytes);
    await handle.chmod(mode);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(tempPath, { force: true });
    throw error;
  }
  await handle.close();
  return tempPath;
}

async function replaceAtomically(targetPath, bytes, mode) {
  const tempPath = await stageFile(targetPath, bytes, mode);
  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function changeFiles(projectRoot, entries, direction) {
  const sourceState = direction === 'apply' ? 'pristine' : 'patched';
  const updated = entries
    .filter((entry) => entry.state === sourceState)
    .map((entry) => ({ ...entry, nextBytes: transformedBytes(entry, direction) }));
  if (updated.length === 0) return false;

  // Stage every new file before the first rename. All content/version guards
  // have already passed for both files.
  const staged = [];
  try {
    for (const entry of updated) {
      staged.push({ ...entry, tempPath: await stageFile(entry.absolutePath, entry.nextBytes, entry.mode) });
    }
  } catch (error) {
    await Promise.all(staged.map(({ tempPath }) => rm(tempPath, { force: true })));
    throw error;
  }

  const committed = [];
  try {
    for (const entry of staged) {
      await rename(entry.tempPath, entry.absolutePath);
      committed.push(entry);
    }
    const finalEntries = await preflight(projectRoot);
    const wanted = direction === 'apply' ? 'patched' : 'pristine';
    if (finalEntries.some((entry) => entry.state !== wanted)) {
      throw new Error('Post-write verification did not reach the requested exact state');
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of [...committed].reverse()) {
      try {
        await replaceAtomically(entry.absolutePath, entry.bytes, entry.mode);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    await Promise.all(
      staged
        .filter((entry) => !committed.includes(entry))
        .map(({ tempPath }) => rm(tempPath, { force: true })),
    );
    const suffix = rollbackErrors.length ? `; rollback errors: ${rollbackErrors.join('; ')}` : '';
    throw new Error(`${error.message}${suffix}`);
  }
  return true;
}

function parseArgs(argv) {
  let action;
  let projectRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (['--apply', '--check', '--revert'].includes(arg)) {
      if (action) throw new Error('Choose exactly one of --apply, --check, or --revert');
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
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!action) throw new Error('Choose one of --apply, --check, or --revert');
  return { action, projectRoot };
}

function usage() {
  return [
    'Usage: node scripts/patches/remotion-4.0.503-audio-resume.mjs --apply|--check|--revert [--root <project-root>]',
    '--check is read-only and accepts only the exact known pristine or patched 4.0.503/4.0.509 files.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const entries = await preflight(args.projectRoot);
  const states = entries.map((entry) => `${entry.relativePath}=${entry.state}`).join(', ');
  if (args.action === 'check') {
    process.stdout.write(`Read-only preflight passed for remotion@${entries[0].version}: ${states}\n`);
    return;
  }

  const changed = await changeFiles(args.projectRoot, entries, args.action);
  const finalEntries = await preflight(args.projectRoot);
  const finalStates = finalEntries.map((entry) => `${entry.relativePath}=${entry.state}`).join(', ');
  process.stdout.write(
    `${changed ? (args.action === 'apply' ? 'Applied' : 'Reverted') : 'Already in requested state'} exact Remotion ${entries[0].version} audio-resume patch: ${finalStates}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Remotion audio-resume patch refused/failed: ${error.message}\n`);
  process.exitCode = 1;
});
