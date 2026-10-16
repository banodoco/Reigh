import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {AstridComponentControls} from '../components/PropertiesPanel/AstridComponentControls.tsx';

const fixture = vi.hoisted(() => ({runtime: {} as any, data: {} as any, applyEdit: vi.fn()}));
vi.mock('../contexts/VideoEditorRuntimeContext.tsx', () => ({useVideoEditorRuntime: () => fixture.runtime}));
vi.mock('../hooks/timelineStore.ts', () => ({
  useTimelineEditorData: () => ({dataRef: {current: fixture.data}}),
  useTimelineEditorOps: () => ({applyEdit: fixture.applyEdit}),
}));

describe('editable component command boundary', () => {
  it('submits a pure canonical command and preserves the public permission boundary', () => {
    const identity = 'timeline.component/test.shade';
    const component = {identity, implementationDigest: 'a'.repeat(64), validateParams: vi.fn(),
      descriptor: {label: 'Shade', params: {type: 'object', properties: {}}}};
    const clip = {id: 'target', track: 'V1', modifiers: []};
    fixture.data = {config: {clips: [clip]}};
    fixture.runtime = {astridElementHost: {components: [component]}, provider: {semanticCommandSaving: true}};
    fixture.applyEdit.mockClear();
    const {rerender} = render(<AstridComponentControls clip={clip as any} registry={{}} />);
    fireEvent.change(screen.getByLabelText('Component'), {target: {value: identity}});
    fireEvent.click(screen.getByRole('button', {name: 'Add component'}));
    expect(fixture.applyEdit).toHaveBeenCalledOnce();
    const [mutation, options] = fixture.applyEdit.mock.calls[0];
    expect(mutation).toEqual({type: 'commands'});
    expect(options.semantic).toBe(true);
    expect(options.editCommands[0]).toMatchObject({op: 'clip.set-param', select: 'parent/clip:target',
      args: {value: {element: identity, params: {}}}});
    expect(options.editCommands[0].expect[options.editCommands[0].args.path]).toEqual({state: 'absent'});
    fixture.runtime.provider.semanticCommandSaving = false;
    rerender(<AstridComponentControls clip={clip as any} registry={{}} />);
    expect(screen.queryByLabelText('Component')).toBeNull();
  });
});
