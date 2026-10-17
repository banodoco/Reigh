import { validateEditCommand, type EditCommand } from '@/integrations/runtime/generated.ts';
import { MANUAL_TEXT_REF, manualTextPatch, manualTextParams, geometryOf, record, same, tagged } from './manualText.ts';
import type { TimelineClip } from '../types/index.ts';

const scoped = (v: unknown): v is string => typeof v === 'string' && /^(?:parent|occurrence:[^/\s]+)\/clip:[^/\s]+$/.test(v);
const state = (v: unknown): boolean => record(v) && (v.state === 'absent' ? Object.keys(v).length === 1
  : v.state === 'present' && Object.keys(v).length === 2 && Object.prototype.hasOwnProperty.call(v, 'value'));
const fields = ['clipType', 'text', 'elementRef', 'params', ...['text', 'size', 'color', 'align', 'fontFamily', 'bold', 'italic', 'reveal', 'tracking', 'lineHeight'].map(k => `params.${k}`)];
type Write = { id: string; path: string; before: NonNullable<EditCommand['expect']>[string]; after: NonNullable<EditCommand['expect']>[string] };
const wire = (command: EditCommand) => { try { validateEditCommand(command); return true; } catch { return false; } };
export function isManualTextBatch(commands: readonly EditCommand[]): boolean {
  return commands.length > 0 && commands.every(call => wire(call) && (call.op === 'clip.set-text'
    && scoped(call.select) && call.resolved?.length === 1 && call.resolved[0] === call.select
    && Object.keys(call.args).sort().join(',') === 'elementRef,text' && record(call.args.text) && same(call.args.elementRef, MANUAL_TEXT_REF)
    && call.expect?.['']?.state === 'present' && record(call.expect[''].value)
    && same(manualTextPatch(call.expect[''].value as TimelineClip, call.args.text)?.text, call.args.text)))
    && new Set(commands.map(call => call.select)).size === commands.length
    && new Set(commands.map(call => call.select!.split('/')[0])).size === 1;
}
export function isManualTextCreation(commands: readonly EditCommand[]): boolean {
  if (commands.length !== 1) return false;
  const call = commands[0];
  const a = call.args;
  return wire(call) && call.op === 'timeline.add' && call.select === null && call.created?.length === 1
    && scoped(call.created[0]) && call.created[0].startsWith('parent/') && a.clip_id === call.created[0].split('/clip:')[1]
    && Object.keys(a).sort().join(',') === 'action,clip_id,clip_order,element,elementRef,expected_order,geometry,opacity,text,time_domain,track'
    && a.element === 'am-type' && same(a.elementRef, MANUAL_TEXT_REF) && record(a.geometry) && !!manualTextParams(a.text, a.geometry)
    && typeof a.track === 'string' && !!a.track && !a.track.includes('/')
    && Object.keys(a.geometry as Record<string, unknown>).sort().join(',') === 'height,width,x,y'
    && a.time_domain === 'timeline-seconds' && record(a.action) && Object.keys(a.action).sort().join(',') === 'effectId,end,id,start'
    && a.action.id === a.clip_id && a.action.effectId === `effect-${a.clip_id}`
    && typeof a.action.start === 'number' && Number.isFinite(a.action.start) && a.action.start >= 0
    && typeof a.action.end === 'number' && Number.isFinite(a.action.end) && a.action.end > a.action.start
    && typeof a.opacity === 'number' && Number.isFinite(a.opacity) && a.opacity >= 0 && a.opacity <= 1
    && Array.isArray(a.expected_order) && a.expected_order.every(id => typeof id === 'string' && !!id && !id.includes('/'))
    && new Set(a.expected_order).size === a.expected_order.length && !a.expected_order.includes(a.clip_id)
    && same(a.clip_order, [...a.expected_order, a.clip_id])
    && call.expect?.[`${call.created[0]}::`]?.state === 'absent';
}
export function isManualTextInverse(command: EditCommand | undefined): command is EditCommand & { args: { publication: string; writes: Write[] } } {
  if (!command || !wire(command) || command.op !== 'timeline.inverse' || command.select !== null
    || Object.keys(command.args).sort().join(',') !== 'publication,writes'
    || typeof command.args.publication !== 'string' || !command.args.publication
    || !Array.isArray(command.args.writes) || !command.args.writes.length) return false;
  const writes = command.args.writes;
  return writes.every((w: unknown) => record(w) && Object.keys(w).sort().join(',') === 'after,before,id,path'
    && scoped(w.id) && (fields.includes(String(w.path)) || w.path === '' && [w.before, w.after].some(s => record(s)
      && s.state === 'present' && record(s.value) && s.value.clipType === 'am-type' && same(s.value.elementRef, MANUAL_TEXT_REF) && record(s.value.text)))
    && state(w.before) && state(w.after) && !same(w.before, w.after))
    && new Set(writes.map(w => `${w.id}::${w.path}`)).size === writes.length
    && new Set(writes.map(w => w.id.split('/')[0])).size === 1;
}
export function manualTextInverse(commands: readonly EditCommand[], result: {
  status: string; accepted_publication_id: string | null; change: { direct_writes: unknown[] };
}): EditCommand | null | undefined {
  const edit = isManualTextBatch(commands), add = isManualTextCreation(commands);
  const undo = commands.length === 1 && isManualTextInverse(commands[0]);
  if (!edit && !add && !undo) return;
  const writes = result.change.direct_writes;
  if (!Array.isArray(writes)) return;
  const expected: Write[] = undo ? commands[0].args.writes as Write[] : edit ? commands.flatMap(call => {
    const captured = call.expect![''];
    if (captured.state !== 'present') return [];
    const source = captured.value as TimelineClip;
    const patch = manualTextPatch(source, call.args.text)!;
    const paths = ['clipType', 'text', 'elementRef', ...(source.params === undefined ? ['params'] : Object.keys(manualTextParams(call.args.text, geometryOf(source))!).map(k => `params.${k}`))];
    return paths.map(path => {
      const before = path.startsWith('params.') ? source.params?.[path.slice(7)] : source[path as keyof TimelineClip];
      const after = path.startsWith('params.') ? patch.params?.[path.slice(7)] : patch[path as keyof TimelineClip];
      return { id: call.select!, path, before: tagged(before), after: tagged(after) };
    }).filter(w => !same(w.before, w.after));
  }) : [];
  if (result.status === 'no_change') return !add && expected.length === 0 && writes.length === 0 ? null : undefined;
  if (result.status !== 'accepted' || !result.accepted_publication_id
    || undo && result.accepted_publication_id === commands[0].args.publication) return;
  if (add) {
    const call = commands[0], a = call.args, w = writes[0];
    if (writes.length !== 1 || !record(w) || w.id !== call.created![0] || w.path !== '' || !same(w.before, { state: 'absent' })
      || !record(w.after) || w.after.state !== 'present' || !record(w.after.value)) return;
    const made = w.after.value;
    if (made.id !== a.clip_id || made.clipType !== 'am-type' || made.track !== a.track
      || !same(made.text, a.text) || !same(made.elementRef, a.elementRef) || !same(geometryOf(made), a.geometry)
      || !same(made.params, manualTextParams(a.text, a.geometry as Record<string, unknown>)) || made.opacity !== a.opacity
      || made.at !== (a.action as Record<string, number>).start
      || made.hold !== (a.action as Record<string, number>).end - (a.action as Record<string, number>).start) return;
  } else if (writes.length !== expected.length || !writes.every(w => expected.some(row => same(row, w)))) return;
  const inverse: EditCommand = { op: 'timeline.inverse', select: null, args: { publication: result.accepted_publication_id,
    writes: writes.map(w => { const row = w as Write; return { ...structuredClone(row), before: structuredClone(row.after), after: structuredClone(row.before) }; }) } };
  return isManualTextInverse(inverse) ? inverse : undefined;
}
