import {createElement} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {configureComponentHost, type BundledComponent} from './astrid-components.ts';
import type {AstridElementHost} from './astrid-element-host.ts';
import {ComponentAddForm} from '../components/PropertiesPanel/AstridComponentControls.tsx';
import {componentEditCommand} from '../commands/semanticGestures.ts';
import type {TimelineData} from '../lib/timeline-data.ts';
const identity = 'timeline.component/test.shade';
const digest = 'a'.repeat(64);
const base: AstridElementHost = {descriptors: [], sequenceRegistry: {}, resolveComponent: () => undefined,
  resolveSequenceClipEntry: () => undefined, describeClipCapability: () => undefined};
function binding(): BundledComponent {
  return {identity, implementation_digest: digest, key: `${identity}@${digest}`,
    descriptor: {point: 'timeline.component', id: 'test.shade', kind: 'modifier', label: 'Shade', description: 'Test',
      params: {type: 'object', required: ['strength'], additionalProperties: false,
        properties: {strength: {type: 'number', minimum: 0, maximum: 1}}},
      hosts: ['app', 'composition'], bounds: 'preserve', alpha: 'preserve', support: 'preserve',
      implementation: {path: 'declared.tsx', export: 'bind'}},
    module: {bind: (api: typeof import('@banodoco/timeline-composition/theme-api'), d: BundledComponent['descriptor']) =>
      api.declareModifier({kind: 'modifier', element: `${d.point}/${d.id}`, hosts: d.hosts,
        bounds: d.bounds ?? 'unknown', alpha: d.alpha, support: d.support,
        component: ({children}: {children: import('react').ReactNode}) => createElement('div', null, children),
        resolveParams: params => params})}};
}
describe('trusted bundled V3 consumer', () => {
  it('binds the declared export using the real Composition API and keeps the descriptor', () => {
    const host = configureComponentHost(base, [binding()]);
    expect(host.modifierRegistry?.[identity].element).toBe(identity);
    expect(host.components?.[0].descriptor.bounds).toBe('preserve');
    expect(() => host.components?.[0].validateParams({strength: 2})).toThrow('invalid component params');
    expect(() => host.components?.[0].validateParams({strength: .6})).not.toThrow();
  });
  it('refuses identity substitution, stale digest, missing export, collision and unsupported host', () => {
    expect(() => configureComponentHost(base, [{...binding(), identity: 'timeline.component/other.shade'}])).toThrow('identity substitution');
    expect(() => configureComponentHost(base, [{...binding(), implementation_digest: 'b'.repeat(64)}])).toThrow('stale');
    expect(() => configureComponentHost(base, [{...binding(), module: {}}])).toThrow('missing component export');
    expect(() => configureComponentHost(base, [binding(), binding()])).toThrow('collision');
    expect(() => configureComponentHost(base, [binding()], 'worker')).toThrow('unsupported');
    const wrong = binding(); wrong.module = {bind: () => ({element: 'other'})};
    expect(() => configureComponentHost(base, [wrong])).toThrow('identity substitution');
    const unsupported = binding(); unsupported.descriptor.hosts = ['composition'];
    expect(() => configureComponentHost(base, [unsupported])).toThrow('unsupported');
  });
  it('omitted descriptor bounds stay unknown', () => {
    const value = binding(); delete value.descriptor.bounds;
    const host = configureComponentHost(base, [value]);
    expect(host.modifierRegistry?.[identity].bounds).toBe('unknown');
  });
  it('the real add form projects the admitted schema and emits a guarded canonical insertion', () => {
    const host = configureComponentHost(base, [binding()]);
    const data = {config: {clips: [{id: 'target', track: 'V1', modifiers: []}]}} as unknown as TimelineData;
    const add = vi.fn((component, id, params) => {
      const op = componentEditCommand(data, 'target', component, id, params, true);
      expect(op.op).toBe('clip.set-param');
      expect(op.select).toBe('parent/clip:target');
      expect(op.expect).toEqual({[op.args.path as string]: {state: 'absent'}});
      expect(op.args.value).toEqual({id, element: identity, params: {strength: .6}});
    });
    render(<ComponentAddForm components={host.components!} onAdd={add} registry={{}} />);
    fireEvent.change(screen.getByLabelText('Component'), {target: {value: identity}});
    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: '0.6'}});
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', {name: 'Add component'}));
    expect(add).toHaveBeenCalledOnce();
  });
});
