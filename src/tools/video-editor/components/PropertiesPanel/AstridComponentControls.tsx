import { useState } from 'react';
import { CodePathParamEditor } from '../SequenceCreator/CodePathParamEditor.tsx';
import { useVideoEditorRuntime } from '../../contexts/VideoEditorRuntimeContext.tsx';
import { useTimelineEditorData, useTimelineEditorOps } from '../../hooks/timelineStore.ts';
import { componentEditCommand } from '../../commands/semanticGestures.ts';
import type { AdmittedComponent } from '../../runtime/astrid-components.ts';
import type { ClipPanelProps } from './ClipPanelBody.tsx';

export function ComponentAddForm({components, onAdd, registry}: {
  components: readonly AdmittedComponent[];
  onAdd: (component: AdmittedComponent, instanceId: string, params: Record<string, unknown>) => void;
  registry: object;
}) {
  const [identity, setIdentity] = useState('');
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const selected = components.find(c => c.identity === identity);
  return <section aria-label="Add component">
    <label>Component<select aria-label="Component" value={identity} onChange={e => {
      setIdentity(e.target.value); setParams({}); setError('');
    }}><option value="">Choose component</option>{components.map(c =>
      <option key={c.identity} value={c.identity}>{c.descriptor.label}</option>)}</select></label>
    {selected && <>
      <CodePathParamEditor schemaJson={selected.descriptor.params} values={params}
        allowedAssetKeys={Object.keys(registry)} onChange={setParams} />
      <button type="button" onClick={() => {
        try {
          selected.validateParams(params);
          onAdd(selected, crypto.randomUUID(), params); setError('');
        } catch (reason) { setError(String(reason)); }
      }}>Add component</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

/** Installed editable inspector only. The public provider never mounts this. */
export function AstridComponentControls({clip, readOnly, registry}: Pick<ClipPanelProps, 'clip' | 'readOnly' | 'registry'>) {
  const runtime = useVideoEditorRuntime();
  const {dataRef} = useTimelineEditorData();
  const {applyEdit} = useTimelineEditorOps();
  const [error, setError] = useState('');
  const components = runtime.astridElementHost.components ?? [];
  if (!clip || readOnly || !components.length || runtime.provider.semanticCommandSaving !== true
    || runtime.timelineEditability?.checkTimeline?.().allowed === false
    || runtime.timelineEditability?.check({clipId: clip.id, sourceTrackId: clip.track, targetTrackId: clip.track}).allowed === false) return null;
  const submit = (component: AdmittedComponent, id: string, params: Record<string, unknown>, add: boolean) => {
    const current = dataRef.current;
    if (!current || !runtime.astridElementHost.components?.includes(component)) return;
    try {
      const edit = componentEditCommand(current, clip.id, component, id, params, add);
      applyEdit({type: 'commands'}, {editCommands: [edit], semantic: true});
      setError('');
    } catch (reason) { setError(String(reason)); }
  };
  return <>
    <ComponentAddForm components={components} registry={registry}
      onAdd={(component, id, params) => submit(component, id, params, true)} />
    {clip.modifiers?.map(row => {
      const component = components.find(c => c.identity === row.element);
      return component && <section key={row.id} aria-label={`${component.descriptor.label} parameters`}>
        <CodePathParamEditor schemaJson={component.descriptor.params} values={row.params}
          allowedAssetKeys={Object.keys(registry)} onChange={params => submit(component, row.id, params, false)} />
      </section>;
    })}
    {error && <p role="alert">{error}</p>}
  </>;
}
