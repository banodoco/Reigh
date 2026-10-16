import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const INSTALL_ROOT = process.env.REMOTION_509_CHECK_ROOT || ROOT;
const PACKAGE_ROOT = path.join(INSTALL_ROOT, 'node_modules/remotion');
const HAS_REMOTION_SOURCE = fs.existsSync(path.join(PACKAGE_ROOT, 'package.json'));
const TARGETS = [
  {
    form: 'CJS',
    relativePath: 'dist/cjs/audio/shared-audio-tags.js',
    sha256: '949ccec3419398183e8e22f63820a4a57cb8379befb184fbac9a3acde040c5b8',
    requiredLine:
      'resumePromise.then(() => (0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve), () => {});',
  },
  {
    form: 'ESM',
    relativePath: 'dist/esm/index.mjs',
    sha256: '5a1584f7660fa8fffa7eb8fe016b82a4d719e67d4b7904d4fa4f299eb1355f28',
    requiredLine:
      'resumePromise.then(() => waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel, abortController.signal).then(resolve), () => {});',
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let count = 0; count < 12; count += 1) await Promise.resolve();
}

function callbackBody(source, form) {
  const start =
    form === 'CJS'
      ? 'const resume = (0, react_1.useCallback)(() => {'
      : 'const resume = useCallback10(() => {';
  const end = '}, [ctxAndGain, _experimentalKeepAudioContextAlive, logLevel]);';
  const offset = source.indexOf(start);
  assert.notEqual(offset, -1, form + ' resume callback start must remain recognizable');
  const finish = source.indexOf(end, offset);
  assert.notEqual(finish, -1, form + ' resume callback end must remain recognizable');
  return source.slice(offset + start.length, finish);
}

function harness(source, form) {
  const native = deferred();
  const pendingOutput = [];
  const warnings = [];
  const isResuming = { current: null };
  const audioContextIsPlayingEventually = { current: false };
  const audioContext = { currentTime: 0, state: 'suspended' };
  const ctxAndGain = {
    audioContext,
    resume: () => native.promise,
    gainNode: {
      gain: {
        cancelScheduledValues() {},
        setValueAtTime() {},
        linearRampToValueAtTime() {},
      },
    },
  };
  const waitUntilActuallyResumed = (context, _logLevel, signal) => {
    assert.equal(context, audioContext);
    assert.ok(signal instanceof AbortSignal);
    const output = deferred();
    pendingOutput.push(output);
    return output.promise;
  };
  const Log = { warn: (...args) => warnings.push(args) };
  const factory = new Function(
    'ctxAndGain',
    'audioContextIsPlayingEventually',
    'nodesToResume',
    'isResuming',
    'logLevel',
    '_experimentalKeepAudioContextAlive',
    'nextResumeAttemptId',
    'waitUntilActuallyResumed',
    'wait_until_actually_resumed_js_1',
    'Log',
    'log_js_1',
    'AbortController',
    'return function(){' + callbackBody(source, form) + '}',
  );
  const resume = factory(
    ctxAndGain,
    audioContextIsPlayingEventually,
    { current: new Map() },
    isResuming,
    'warn',
    false,
    { current: 0 },
    waitUntilActuallyResumed,
    { waitUntilActuallyResumed },
    Log,
    { Log },
    AbortController,
  );
  return {
    native,
    pendingOutput,
    warnings,
    isResuming,
    resume,
    outputAdvances() {
      pendingOutput.forEach((output) => output.resolve());
    },
  };
}

async function fulfillmentInvariant(source, form) {
  const host = harness(source, form);
  const nativeReturn = host.resume();
  const owner = host.isResuming.current;
  const sharedWait = owner.promise;
  assert.ok(sharedWait);

  let released = false;
  sharedWait.then(() => {
    released = true;
  });

  host.outputAdvances();
  await flush();
  assert.equal(released, false, 'apparent output readiness cannot release before native fulfillment');
  assert.equal(host.pendingOutput.length, 0, 'output sampling starts only after native fulfillment');
  assert.equal(host.isResuming.current, owner);

  host.native.resolve();
  await nativeReturn;
  await flush();
  assert.equal(host.pendingOutput.length, 1);
  assert.equal(released, false, 'native fulfillment alone is not output readiness');

  host.outputAdvances();
  await sharedWait;
  await flush();
  assert.equal(released, true);
  assert.equal(host.isResuming.current, null);
}

async function rejectionInvariant(source, form) {
  const host = harness(source, form);
  const error = new Error('native resume rejected');
  const nativeReturn = host.resume();
  const owner = host.isResuming.current;

  host.native.reject(error);
  await nativeReturn;
  await owner.promise;
  await flush();

  assert.equal(host.isResuming.current, null);
  assert.equal(host.warnings.length, 1);
  assert.equal(host.warnings[0].at(-1), error);
  assert.equal(owner.abortController.signal.aborted, true);
}

test(
  'Remotion 4.0.509 CJS and ESM keep the native-resume fence semantics',
  { skip: !HAS_REMOTION_SOURCE },
  async (t) => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    assert.equal(packageJson.name, 'remotion');
    assert.equal(packageJson.version, '4.0.509');

    for (const target of TARGETS) {
      await t.test(target.form, async () => {
        const file = path.join(PACKAGE_ROOT, target.relativePath);
        const bytes = fs.readFileSync(file);
        const source = bytes.toString('utf8');
        assert.equal(sha256(bytes), target.sha256);
        assert.ok(source.includes(target.requiredLine));
        await fulfillmentInvariant(source, target.form);
        await rejectionInvariant(source, target.form);
      });
    }
  },
);
