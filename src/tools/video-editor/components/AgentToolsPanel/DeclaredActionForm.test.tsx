import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { DeclaredActionForm } from '@/tools/video-editor/components/AgentToolsPanel/DeclaredActionForm';
import {
  createDeclaredActionInitialValues,
  parseDeclaredActionDeclaration,
  validateDeclaredActionValues,
} from '@/tools/video-editor/data/declaredActionForm';
import type { RuntimeCapability } from '@/tools/video-editor/data/bridgeContract';

const taskMocks = vi.hoisted(() => ({ admit: vi.fn() }));
vi.mock('@/integrations/astrid/bridgeTaskReads', () => ({
  getBridgeTaskClient: () => ({ tasks: { admit: taskMocks.admit } }),
  mapBridgeTaskStatus: vi.fn(),
}));
vi.mock('@/shared/lib/taskCreation/createTask', () => ({
  createTask: taskMocks.admit,
}));

function chiptuneDeclaration() {
  return {
    kind: 'generator' as const,
    name: 'Chiptune Compose',
    short_description: 'Compose a short chiptune track.',
    description: 'Compose a tempo-locked NES-style cue.',
    keywords: ['music', 'chiptune'],
    invocation: {
      kind: 'command',
      command: { argv: ['{python_exec}', '-m', 'compose', '--out', '{out}'] },
    },
    inputs: [
      { name: 'duration_s', type: 'number', required: true, description: 'Exact cue length in seconds.' },
      { name: 'bpm', type: 'integer', required: false, default: 132, description: 'Tempo locked to the beat grid.' },
      { name: 'key', type: 'string', required: false, default: 'A minor', description: 'Tonic and mode.' },
      { name: 'seed', type: 'integer', required: false, default: 1, description: 'Seed for deterministic motifs.' },
      { name: 'sections', type: 'json', required: true, description: 'Array of cue sections.' },
      { name: 'hits', type: 'json', required: false, description: 'Accent times or hit objects.' },
      { name: 'duck', type: 'json', required: false, description: 'Explicit gain dips.' },
      { name: 'vo_mask', type: 'json', required: false, description: 'Speech spans to duck.' },
      { name: 'mutes', type: 'json', required: false, description: 'Hard-mute windows.' },
      { name: 'duck_db', type: 'number', required: false, default: -10, description: 'Gain applied under voice spans.' },
      { name: 'master_db', type: 'number', required: false, default: -16, description: 'RMS target in dBFS.' },
      { name: 'style', type: 'string', required: false, default: 'nes', description: 'Synthesis style.' },
    ],
    outputs: [
      {
        name: 'music', type: 'file', artifact_type: 'audio',
        description: '48 kHz stereo 16-bit WAV.', path_template: '$PATH/music.wav',
      },
      {
        name: 'beats', type: 'file', artifact_type: 'application/json',
        description: 'JSON beat, downbeat, bar and section data.', path_template: '$PATH/beats.json',
      },
    ],
  };
}

function runtimeProjection() {
  const source = chiptuneDeclaration();
  return {
    kind: source.kind,
    name: source.name,
    short_description: source.short_description,
    description: source.description,
    keywords: source.keywords,
    inputs: source.inputs,
    outputs: source.outputs.map(({ name, type, artifact_type, description }) => ({
      name, type, artifact_type, description,
    })),
  };
}

function capability(overrides: Partial<RuntimeCapability> = {}): RuntimeCapability {
  return {
    capability_id: 'chiptune.compose',
    definition_digest: `sha256:${'a'.repeat(64)}`,
    status: 'ready',
    required_resource_keys: [],
    estimated_scratch_bytes: 0,
    estimated_output_bytes: 0,
    ...overrides,
  };
}

describe('DeclaredActionForm', () => {
  it('derives supported controls, defaults and output descriptions from the V3 declaration', () => {
    const parsed = parseDeclaredActionDeclaration(chiptuneDeclaration());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const defaults = createDeclaredActionInitialValues(parsed.declaration);
    expect(defaults).toMatchObject({
      duration_s: '',
      bpm: '132',
      key: 'A minor',
      seed: '1',
      sections: '',
      duck_db: '-10',
      master_db: '-16',
      style: 'nes',
    });

    render(
      <DeclaredActionForm
        actionId="chiptune.compose"
        capability={capability({ action_declaration: runtimeProjection() })}
      />,
    );

    expect(screen.getByLabelText(/duration_s/).getAttribute('required')).not.toBeNull();
    expect((screen.getByTestId('declared-action-input-bpm') as HTMLInputElement).value).toBe('132');
    expect(screen.getByText('Exact cue length in seconds.')).toBeTruthy();
    expect(screen.getByText('Tempo locked to the beat grid.')).toBeTruthy();
    expect(screen.getByText('generator')).toBeTruthy();
    expect(screen.getByText('Compose a short chiptune track.')).toBeTruthy();
    expect(screen.getByText('music')).toBeTruthy();
    expect(screen.getByText('beats')).toBeTruthy();
    expect(screen.getByText('48 kHz stereo 16-bit WAV.')).toBeTruthy();
    expect(screen.getByText('JSON beat, downbeat, bar and section data.')).toBeTruthy();
    expect(document.querySelector('[data-video-editor-declared-action-output="music"]')?.textContent)
      .toContain('audio');
    expect(document.querySelector('[data-video-editor-declared-action-output="beats"]')?.textContent)
      .toContain('application/json');
    expect(document.querySelector('input[name="out"]')).toBeNull();
    expect(document.body.textContent).not.toContain('$PATH');
    expect(document.body.textContent).not.toContain('path_template');
    expect(document.body.textContent).not.toContain('music.wav');
  });

  it('validates required and typed inputs, then refuses before task admission on this unsupported host', () => {
    const parsed = parseDeclaredActionDeclaration(chiptuneDeclaration());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const invalid = validateDeclaredActionValues(parsed.declaration, {
      duration_s: '',
      sections: '{bad json',
    });
    expect(invalid).toEqual({
      ok: false,
      errors: {
        duration_s: 'duration_s is required.',
        sections: 'sections must be valid JSON.',
      },
    });
    expect(validateDeclaredActionValues(parsed.declaration, {
      duration_s: '4.5',
      bpm: '132.5',
      sections: '[]',
    })).toMatchObject({ ok: false, errors: { bpm: 'bpm must be a whole number.' } });

    render(
      <DeclaredActionForm
        actionId="chiptune.compose"
        capability={capability({ action_declaration: runtimeProjection() })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run action' }));
    expect(screen.getByText('duration_s is required.')).toBeTruthy();
    expect(screen.getByText('sections is required.')).toBeTruthy();

    fireEvent.change(screen.getByTestId('declared-action-input-duration_s'), { target: { value: '4.5' } });
    fireEvent.change(screen.getByTestId('declared-action-input-sections'), { target: { value: '[]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run action' }));

    expect(screen.getByText(/no source-backed mapping .* task admission spec and managed project-media result path/i))
      .toBeTruthy();
    expect(document.querySelector('[data-video-editor-declared-action-code="action-host-unsupported"]'))
      .toBeTruthy();
    expect(taskMocks.admit).not.toHaveBeenCalled();
  });

  it('shows a typed unavailable result for the current metadata-only catalog item', () => {
    render(
      <DeclaredActionForm
        actionId="chiptune.compose"
        capability={capability()}
      />,
    );

    expect(document.querySelector('[data-video-editor-declared-action-code="action-declaration-unavailable"]'))
      .toBeTruthy();
    expect(screen.getByText(/catalog entry contains summary metadata only/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run action' })).toBeNull();
    expect(taskMocks.admit).not.toHaveBeenCalled();
  });

  it('refuses a declaration projected from a different capability identity', () => {
    render(<DeclaredActionForm
      actionId="chiptune.compose"
      capability={capability({
        capability_id: 'another.action',
        action_declaration: runtimeProjection(),
      })}
    />);

    expect(document.querySelector('[data-video-editor-declared-action-code="capability-mismatch"]'))
      .toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run action' })).toBeNull();
    expect(taskMocks.admit).not.toHaveBeenCalled();
  });

  it('rejects declarations containing unsupported input types instead of guessing a control', () => {
    const result = parseDeclaredActionDeclaration({
      inputs: [{ name: 'file', type: 'file', required: true }],
      outputs: [],
    });
    expect(result).toMatchObject({ ok: false, code: 'unsupported-input-type' });

    const outputRouting = parseDeclaredActionDeclaration({
      inputs: [{ name: 'out', type: 'string', required: false }],
      outputs: [],
    });
    expect(outputRouting).toMatchObject({ ok: false, code: 'host-owned-output-input' });
  });
});
