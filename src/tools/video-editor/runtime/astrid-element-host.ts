import type { AdmittedComponent } from './astrid-components.ts';
import type { ComponentType, ReactNode } from 'react';
import type { ModifierFinding, ModifierRegistry, RuntimeTheme } from '@banodoco/timeline-composition/theme-api';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

export type AstridElementKind = 'effect' | 'animation' | 'transition';

export type AstridElementComponentProps = {
  clip: ResolvedTimelineClip;
  params: Record<string, unknown>;
  theme: RuntimeTheme;
  fps: number;
  /** Existing root frame; independent of clip-local/transition pose time. */
  globalFrame?: number;
  assetEntry?: ResolvedTimelineClip['assetEntry'];
  children?: ReactNode;
};

export type AstridElementDescriptor = {
  id: string;
  kind: AstridElementKind;
  packId?: string;
  /** Selected host schema only; public consumers never read an installed catalog. */
  schema?: object;
  revision: string;
  componentPath: string;
};

export type AstridDynamicSequenceEntry = {
  clipType: string;
  component: ComponentType<any>;
  schemaJson?: object;
  themeId?: string;
};

export type AstridSequenceRegistryEntry = {
  component?: unknown;
  themeId?: string;
  source?: string;
};

export type AstridClipCapabilityDescriptor = {
  clipType: string;
  source: string;
  capabilities: {
    preview: 'browser' | 'placeholder';
    previewFallbackReason?: 'worker_only' | 'unsupported';
    browserRender: boolean;
    workerRender: boolean;
    externalRender: boolean;
  };
};

export interface AstridElementHost {
  readonly components?: readonly AdmittedComponent[];
  /** Explicit declarations for this renderer host; absent uses the shared empty registry. */
  readonly modifierRegistry?: ModifierRegistry;
  readonly onModifierFinding?: (finding: ModifierFinding) => void;
  readonly descriptors: readonly AstridElementDescriptor[];
  readonly sequenceRegistry: Readonly<Record<string, AstridSequenceRegistryEntry | undefined>>;
  resolveComponent(
    elementId: string,
    kind: AstridElementKind,
    packId?: string,
  ): ComponentType<AstridElementComponentProps> | undefined;
  resolveSequenceClipEntry(
    clipType: string | undefined,
    dynamicEntries: readonly AstridDynamicSequenceEntry[],
  ): AstridDynamicSequenceEntry | undefined;
  describeClipCapability(
    clip: {clipType?: string} | null | undefined,
    dynamicEntries: readonly AstridDynamicSequenceEntry[],
  ): AstridClipCapabilityDescriptor | undefined;
}

export function requireAstridElementHost(
  host: AstridElementHost | null | undefined,
): AstridElementHost {
  if (!host) {
    throw new Error('TimelineRenderer requires an explicit AstridElementHost');
  }
  return host;
}
