import { AstridComponentControls } from './AstridComponentControls.tsx';
import { MediaVariantPicker } from '@/shared/components/MediaVariantPicker.tsx';
import { EffectCreatorPanel } from '@/tools/video-editor/components/EffectCreatorPanel.tsx';
import { useEffectResources } from '@/tools/video-editor/hooks/useEffectResources.ts';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { ClipPanelBody, type ClipPanelProps } from './ClipPanelBody.tsx';
import { AstridElementParams } from './AstridElementParams.tsx';
import { resolveAstridElementParamDescriptor } from './astrid-element-param-descriptor.ts';

export { getVisibleClipTabs, FieldLabel, NO_EFFECT, NO_TRANSITION, TAB_COLUMNS_CLASS } from './ClipPanelBody.tsx';
export type { ClipPanelProps } from './ClipPanelBody.tsx';

/** Installed resource and variant adapter around the shared inspector body. */
export function ClipPanel(props: ClipPanelProps) {
  const effectResources = useEffectResources();
  const runtime = useVideoEditorRuntime();
  const astridElementParamDescriptor = resolveAstridElementParamDescriptor(
    props.clip,
    runtime.astridElementHost?.descriptors ?? [],
    props.readOnly,
    runtime.timelineEditability,
  );
  return (
    <>
      <ClipPanelBody
        {...props}
        hasActiveAstridElementParams={Boolean(astridElementParamDescriptor)}
        effectResources={effectResources}
        VariantPicker={MediaVariantPicker}
        EffectCreator={EffectCreatorPanel}
      />
      <AstridElementParams {...props} />
      <AstridComponentControls {...props} />
    </>
  );
}
