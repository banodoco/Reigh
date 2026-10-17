import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { MANUAL_TEXT_REF, manualTextPatch, setManualTextCommand } from './manualText.ts';
import { isManualTextBatch, isManualTextInverse, manualTextInverse } from './manualTextHistory.ts';
import type { TimelineClip } from '../types/index.ts';

beforeAll(() => {
  const sdk = process.env.ASTRID_CHECKOUT!;
  expect(sdk).toBe('/Users/peteromalley/Documents/reigh-workspace/Astrid/.otto/clones/timeline-r4-portfolio-20261015-Astrid.git/.otto/worktrees/timeline-r4-E-W30-MANUAL-TEXT-CONSUMER-001-SDK-E30-READER-001');
  expect(execFileSync('git', ['-C', sdk, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe('e30f8d27a436299852c536f36bc93abc06d90366');
  const catalog = readFileSync(`${sdk}/astrid/packs/rendering/elements/catalog.ts`, 'utf8');
  const start = catalog.indexOf('"componentPath": "packs/astrid_motion/rendering/elements/effects/am-type/component.tsx"');
  expect(catalog.slice(start).match(/"revision": "([^"]+)"/)?.[1]).toBe(MANUAL_TEXT_REF.revision);
});
const source: TimelineClip = { id: 'a', clipType: 'text', track: 'V1', at: 1, hold: 5, x: 120, y: 120, width: 640, height: 180,
  text: { content: 'Old', fontSize: 64, color: '#ffffff', align: 'center' }, params: { opaque: [null, 7] }, app: { unknown: { keep: true } } };
const call = () => setManualTextCommand(source, 'parent/clip:a', { content: 'New', bold: true })!;
function receipt() {
  const patch = manualTextPatch(source, call().args.text)!;
  const writes = ['clipType', 'text', 'elementRef', ...Object.keys(patch.params!).filter(k => k !== 'opaque').map(k => `params.${k}`)].map(path => ({
    id: 'parent/clip:a', path,
    before: path.startsWith('params.') || path === 'elementRef' ? { state: 'absent' as const } : { state: 'present' as const, value: source[path as keyof TimelineClip] },
    after: { state: 'present' as const, value: path.startsWith('params.') ? patch.params![path.slice(7)] : patch[path as keyof TimelineClip] },
  }));
  return { status: 'accepted', accepted_publication_id: 'publication-2', change: { direct_writes: writes } };
}
describe('W30 exact text receipt boundary', () => {
  it('validates every projected write and emits receipt-only inverses', () => {
    expect(isManualTextBatch([call()])).toBe(true);
    const result = receipt(); const inverse = manualTextInverse([call()], result)!;
    expect(isManualTextInverse(inverse)).toBe(true);
    expect(inverse.args.writes).toEqual(result.change.direct_writes.map(w => ({ ...w, before: w.after, after: w.before })));
    const redo = manualTextInverse([inverse], { ...result, accepted_publication_id: 'publication-3', change: { direct_writes: inverse.args.writes as never } })!;
    expect(redo.args.writes).toEqual(result.change.direct_writes);
  });
  it.each(['missing', 'duplicate', 'wrong before', 'wrong after', 'foreign member', 'extra path'] as const)('rejects %s receipts', mode => {
    const result = receipt(); const writes = result.change.direct_writes;
    if (mode === 'missing') writes.pop();
    if (mode === 'duplicate') writes.push(writes[0]);
    if (mode === 'wrong before') writes[0].before = { state: 'absent' };
    if (mode === 'wrong after') writes[0].after.value = 'wrong';
    if (mode === 'foreign member') writes[0].id = 'parent/clip:other';
    if (mode === 'extra path') writes[0].path = 'opacity';
    expect(manualTextInverse([call()], result)).toBeUndefined();
  });
  it('accepts no-change only with complete matching expectations and zero direct writes', () => {
    const projected = { ...source, ...manualTextPatch(source, source.text) } as TimelineClip;
    const unchanged = setManualTextCommand(projected, 'parent/clip:a', projected.text)!;
    const result = { status: 'no_change', accepted_publication_id: null, change: { direct_writes: [] } };
    expect(manualTextInverse([unchanged], result)).toBeNull();
    expect(manualTextInverse([call()], result)).toBeUndefined();
  });
  it.each([{ fontSize: 0 }, { color: null }, { align: 'justify' }, { bold: 'true' }, { italic: null }, { fontFamily: 7 }, { content: null }])('refuses malformed style %j', patch => {
    expect(setManualTextCommand(source, 'parent/clip:a', patch)).toBeUndefined();
  });
  it.each([{ height: 0 }, { width: 0.5 }, { x: NaN }, { y: Infinity }])('refuses malformed canonical geometry %j', geometry => {
    expect(setManualTextCommand({ ...source, ...geometry }, 'parent/clip:a', { content: 'New' })).toBeUndefined();
  });
});

describe('W30 existing presentation', () => {
  it('keeps the text inspector and prevents a second element-params text surface after adoption', async () => {
    const { inlineTextUIType } = await import('../clip-types/runtime.ts');
    const { resolveAstridElementParamDescriptor } = await import('../components/PropertiesPanel/astrid-element-param-descriptor.ts');
    const bound = { ...source, ...manualTextPatch(source, source.text) } as TimelineClip;
    expect(inlineTextUIType(bound)).toBe('text');
    const descriptor = { ...MANUAL_TEXT_REF, componentPath: 'real-component', schema: { type: 'object', properties: { text: { type: 'string' } } } };
    expect(resolveAstridElementParamDescriptor(bound, [descriptor], false, undefined)).toBeUndefined();
    expect(inlineTextUIType({ clipType: 'am-type', params: { text: 'Editorial' } } as TimelineClip)).toBe('am-type');
    expect(resolveAstridElementParamDescriptor({ id: 'editorial', track: 'V1', elementRef: { ...MANUAL_TEXT_REF }, clipType: 'am-type' }, [descriptor], false, undefined)).toEqual(descriptor);
  });
});
