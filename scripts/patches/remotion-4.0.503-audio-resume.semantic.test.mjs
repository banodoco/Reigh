import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageRoot = process.env.REMOTION_AUDIO_RESUME_PACKAGE_ROOT
  ? path.resolve(process.env.REMOTION_AUDIO_RESUME_PACKAGE_ROOT)
  : path.join(root, 'node_modules/remotion');
const version = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
assert.ok(['4.0.503', '4.0.509'].includes(version));
const waitArguments = version === '4.0.509'
  ? 'ctxAndGain.audioContext, logLevel, abortController.signal'
  : 'ctxAndGain.audioContext, logLevel';
const script = path.join(root, 'scripts/patches/remotion-4.0.503-audio-resume.mjs');
const targets = [
  ['CJS', 'dist/cjs/audio/shared-audio-tags.js', '(0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)'],
  ['ESM', 'dist/esm/index.mjs', 'waitUntilActuallyResumed'],
];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
const flush = async () => {for (let n = 0; n < 12; n++) await Promise.resolve();};

// Extract the actual generated owner callback, leaving predicate, ramp, nodes,
// native-return promise, rejection handler and finally behavior intact.
function callbackBody(source, form) {
  const start = form === 'CJS'
    ? 'const resume = (0, react_1.useCallback)(() => {'
    : 'const resume = useCallback10(() => {';
  const offset = source.indexOf(start);
  assert.notEqual(offset, -1);
  const end = source.indexOf(version === '4.0.509'
    ? '}, [ctxAndGain, _experimentalKeepAudioContextAlive, logLevel]);'
    : '}, [ctxAndGain, logLevel]);', offset);
  assert.notEqual(end, -1);
  return source.slice(offset + start.length, end);
}

function harness(source, form) {
  const native = deferred(), pendingOutput = [], warnings = [];
  const isResuming = {current: null};
  const audioContextIsPlayingEventually = {current: false};
  const audioContext = {currentTime: 0};
  const ctxAndGain = {audioContext, resume: () => native.promise,
    gainNode: {gain: {cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}}}};
  const wait = (context, logLevel, signal) => {
    if (version === '4.0.509') assert.ok(signal instanceof AbortSignal);
    assert.equal(context, audioContext);
    const output = deferred();
    pendingOutput.push({...output, signal});
    if (signal?.aborted) output.resolve('cancelled');
    else signal?.addEventListener('abort', () => output.resolve('cancelled'), {once: true});
    return output.promise;
  };
  const Log = {warn: (...args) => warnings.push(args)};
  const resume = new Function('ctxAndGain', 'audioContextIsPlayingEventually',
    'nodesToResume', 'isResuming', 'logLevel', 'waitUntilActuallyResumed',
    'wait_until_actually_resumed_js_1', 'Log', 'log_js_1',
    '_experimentalKeepAudioContextAlive', 'nextResumeAttemptId',
    `return function(){${callbackBody(source, form)}}`)(ctxAndGain,
      audioContextIsPlayingEventually, {current: new Map()}, isResuming,
      'warn', wait, {waitUntilActuallyResumed: wait}, Log, {Log}, false, {current: 0});
  return {native, pendingOutput, warnings, isResuming, resume,
    outputAdvances() {audioContext.currentTime += 0.1; pendingOutput.forEach(output => output.resolve());}};
}

async function fulfillmentInvariant(source, form) {
  const h = harness(source, form);
  const nativeReturn = h.resume();
  const sharedWait = h.isResuming.current.promise ?? h.isResuming.current;
  assert.ok(sharedWait);
  let released = false;
  sharedWait.then(() => {released = true;});
  // This real race is the red criterion: output can appear ready while the
  // native resume operation is unresolved. Only already-created waits see it.
  h.outputAdvances();
  await flush();
  assert.equal(released, false, 'apparent output readiness cannot release before native fulfillment');
  assert.equal(h.pendingOutput.length, 0, 'output sampling must start after native fulfillment');
  assert.equal(h.isResuming.current.promise ?? h.isResuming.current, sharedWait);
  h.native.resolve();
  await nativeReturn;
  await flush();
  assert.equal(h.pendingOutput.length, 1);
  if (version === '4.0.509') {
    assert.equal(h.pendingOutput[0].signal, h.isResuming.current.abortController.signal);
  }
  assert.equal(released, false, 'native fulfillment alone is not output readiness');
  h.outputAdvances();
  await sharedWait;
  await flush();
  assert.equal(released, true);
  assert.equal(h.isResuming.current, null);
}

async function rejectionInvariant(source, form) {
  const h = harness(source, form), error = new Error('native resume rejected');
  const nativeReturn = h.resume(), attempt = h.isResuming.current, sharedWait = attempt.promise ?? attempt;
  h.native.reject(error);
  await nativeReturn; // Existing public behavior swallows logged native failure.
  assert.equal(await sharedWait, version === '4.0.509' ? 'failed' : undefined);   // Existing failure behavior releases rather than deadlocks.
  await flush();
  assert.equal(h.isResuming.current, null);
  if (version === '4.0.509') assert.equal(attempt.abortController.signal.aborted, true);
  assert.equal(h.warnings.length, 1);
  assert.equal(h.warnings[0].at(-1), error);
}

test('generated CJS and ESM native-fulfillment fence (original red, candidate green)', async t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'remotion-resume-semantic-'));
  try {
    const original = new Map();
    for (const [form, relative, waitName] of targets) {
      const installed = fs.readFileSync(path.join(packageRoot, relative), 'utf8');
      const before = `${waitName}(${waitArguments}).then(resolve);`;
      const after = `resumePromise.then(() => ${waitName}(${waitArguments}).then(resolve), () => {});`;
      // Allow rerunning after installation; reconstruct ONLY the exact guarded
      // one-line delta. The guard script still validates full-file fingerprints.
      const pristine = installed.includes(after) ? installed.replace(after, before) : installed;
      original.set(form, pristine);
      const file = path.join(fixture, 'node_modules/remotion', relative);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, pristine);
    }
    fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(fixture, 'node_modules/remotion/package.json'));
    execFileSync(process.execPath, [script, '--apply', '--root', fixture], {encoding: 'utf8'});
    for (const [form, relative, waitName] of targets) {
      const pristine = original.get(form), patched = fs.readFileSync(path.join(fixture, 'node_modules/remotion', relative), 'utf8');
      await t.test(`${form}: exact D3 delta only`, () => {
        assert.equal(patched, pristine.replace(
          `${waitName}(${waitArguments}).then(resolve);`,
          `resumePromise.then(() => ${waitName}(${waitArguments}).then(resolve), () => {});`));
      });
      await t.test(`${form}: original MUST fail fulfillment invariant`, async () => {
        await assert.rejects(fulfillmentInvariant(pristine, form), /apparent output readiness cannot release before native fulfillment/);
      });
      await t.test(`${form}: candidate waits native then fresh output advance`, () => fulfillmentInvariant(patched, form));
      await t.test(`${form}: rejection behavior retained in both forms`, async () => {
        await rejectionInvariant(pristine, form);
        await rejectionInvariant(patched, form);
      });
    }
  } finally {
    fs.rmSync(fixture, {recursive: true, force: true});
  }
});
