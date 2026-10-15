import { z } from 'zod';

import type { RuntimeCapability } from '@/tools/video-editor/data/bridgeContract.ts';

export type DeclaredActionInputType = 'number' | 'integer' | 'string' | 'json';

export interface DeclaredActionInput {
  name: string;
  type: DeclaredActionInputType;
  required: boolean;
  description?: string;
  default?: unknown;
}

export interface DeclaredActionOutput {
  name: string;
  type: string;
  artifact_type?: string;
  description?: string;
}

/** The UI-safe projection of the V3 action declaration's display metadata. */
export interface DeclaredActionFormDeclaration {
  kind?: 'action' | 'generator';
  name?: string;
  short_description?: string;
  description?: string;
  keywords?: string[];
  inputs: DeclaredActionInput[];
  outputs: DeclaredActionOutput[];
}

export type DeclaredActionDeclarationResult =
  | { ok: true; declaration: DeclaredActionFormDeclaration }
  | {
      ok: false;
      code: 'invalid-declaration' | 'unsupported-input-type' | 'host-owned-output-input';
      message: string;
    };

const actionInputSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean(),
  description: z.string().optional(),
  default: z.unknown().optional(),
});

const actionOutputSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  artifact_type: z.string().min(1).optional(),
  description: z.string().optional(),
});

// z.object strips the producer's execution and output-location fields. The
// renderer receives only display metadata and can never expose path_template,
// argv, `out`, or a local output path as an editable control.
const actionDeclarationSchema = z.object({
  kind: z.enum(['action', 'generator']).optional(),
  name: z.string().optional(),
  short_description: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  inputs: z.array(actionInputSchema).optional(),
  outputs: z.array(actionOutputSchema).optional(),
});

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function defaultMatchesType(type: DeclaredActionInputType, value: unknown): boolean {
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'string':
      return typeof value === 'string';
    case 'json':
      return isJsonValue(value);
  }
}

function isHostOwnedOutputInput(name: string): boolean {
  const normalized = name.toLowerCase().replace(/-/g, '_');
  return normalized === 'out'
    || normalized === 'output'
    || normalized === 'output_policy'
    || normalized === 'path_template'
    || normalized === 'path'
    || normalized === 'file_path'
    || normalized === 'local_path'
    || normalized === 'filename'
    || normalized === 'file_name'
    || normalized === 'local_filename'
    || normalized === 'output_filename'
    || normalized === 'output_file'
    || normalized === 'output_path'
    || normalized === 'output_dir'
    || normalized === 'output_directory';
}

export function parseDeclaredActionDeclaration(value: unknown): DeclaredActionDeclarationResult {
  const parsed = actionDeclarationSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid-declaration',
      message: 'The action declaration does not match the supported V3 input/output shape.',
    };
  }

  const inputs: DeclaredActionInput[] = [];
  const names = new Set<string>();
  for (const input of parsed.data.inputs ?? []) {
    if (names.has(input.name)) {
      return { ok: false, code: 'invalid-declaration', message: `The action declares ${input.name} more than once.` };
    }
    names.add(input.name);
    if (isHostOwnedOutputInput(input.name)) {
      return {
        ok: false,
        code: 'host-owned-output-input',
        message: `The action input ${input.name} is host-owned output routing and cannot be edited in the form.`,
      };
    }
    if (!['number', 'integer', 'string', 'json'].includes(input.type)) {
      return {
        ok: false,
        code: 'unsupported-input-type',
        message: `The action input ${input.name} uses unsupported type ${input.type}.`,
      };
    }
    const type = input.type as DeclaredActionInputType;
    if (input.default !== undefined && !defaultMatchesType(type, input.default)) {
      return {
        ok: false,
        code: 'invalid-declaration',
        message: `The declared default for ${input.name} does not match its ${type} type.`,
      };
    }
    inputs.push({
      name: input.name,
      type,
      required: input.required,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.default !== undefined ? { default: input.default } : {}),
    });
  }

  const outputNames = new Set<string>();
  for (const output of parsed.data.outputs ?? []) {
    if (outputNames.has(output.name)) {
      return { ok: false, code: 'invalid-declaration', message: `The action declares output ${output.name} more than once.` };
    }
    outputNames.add(output.name);
  }

  return {
    ok: true,
    declaration: {
      ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.short_description !== undefined ? { short_description: parsed.data.short_description } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.keywords !== undefined ? { keywords: parsed.data.keywords } : {}),
      inputs,
      outputs: parsed.data.outputs ?? [],
    },
  };
}

function formatDefault(input: DeclaredActionInput): string {
  if (input.default === undefined) return '';
  if (input.type === 'json') return JSON.stringify(input.default, null, 2);
  return String(input.default);
}

export function createDeclaredActionInitialValues(
  declaration: DeclaredActionFormDeclaration,
): Record<string, string> {
  return Object.fromEntries(declaration.inputs.map((input) => [input.name, formatDefault(input)]));
}

export type DeclaredActionValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value === 'string' ? value.trim().length > 0 : true;
}

export function validateDeclaredActionValues(
  declaration: DeclaredActionFormDeclaration,
  rawValues: Record<string, unknown>,
): DeclaredActionValidationResult {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const input of declaration.inputs) {
    const raw = rawValues[input.name];
    if (!hasValue(raw)) {
      if (input.required) errors[input.name] = `${input.name} is required.`;
      continue;
    }

    switch (input.type) {
      case 'string':
        if (typeof raw !== 'string') errors[input.name] = `${input.name} must be text.`;
        else values[input.name] = raw;
        break;
      case 'number': {
        const numberValue = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(numberValue)) errors[input.name] = `${input.name} must be a finite number.`;
        else values[input.name] = numberValue;
        break;
      }
      case 'integer': {
        const integerValue = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isSafeInteger(integerValue)) errors[input.name] = `${input.name} must be a whole number.`;
        else values[input.name] = integerValue;
        break;
      }
      case 'json': {
        if (typeof raw !== 'string') {
          if (isJsonValue(raw)) values[input.name] = raw;
          else errors[input.name] = `${input.name} must be valid JSON.`;
          break;
        }
        try {
          const jsonValue: unknown = JSON.parse(raw);
          if (!isJsonValue(jsonValue)) errors[input.name] = `${input.name} must be valid JSON.`;
          else values[input.name] = jsonValue;
        } catch {
          errors[input.name] = `${input.name} must be valid JSON.`;
        }
        break;
      }
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}

export type DeclaredActionExecutionRefusal = {
  status: 'refused';
  code: 'action-declaration-unavailable' | 'capability-unavailable' | 'capability-mismatch' | 'action-host-unsupported';
  message: string;
};

/**
 * Refuse before task admission until App has a source-backed mapping from this
 * declaration's values to the authenticated task input and managed media result.
 */
export function declaredActionExecutionRefusal(
  actionId: string,
  capability: RuntimeCapability | null | undefined,
  declaration: DeclaredActionFormDeclaration | null,
): DeclaredActionExecutionRefusal {
  if (declaration === null) {
    return {
      status: 'refused',
      code: 'action-declaration-unavailable',
      message: `Runtime has no action declaration for ${actionId}; the catalog entry contains summary metadata only.`,
    };
  }
  if (!capability || capability.status !== 'ready') {
    return {
      status: 'refused',
      code: 'capability-unavailable',
      message: capability?.unavailable_reason
        ? `Runtime capability ${actionId} is unavailable: ${capability.unavailable_reason}.`
        : `Runtime capability ${actionId} is not ready.`,
    };
  }
  if (capability.capability_id !== actionId) {
    return {
      status: 'refused',
      code: 'capability-mismatch',
      message: `Runtime returned ${capability.capability_id} for action ${actionId}.`,
    };
  }
  if (!capability.action_declaration) {
    return {
      status: 'refused',
      code: 'action-declaration-unavailable',
      message: `Runtime capability ${actionId} has no action declaration projection bound to its definition digest.`,
    };
  }
  return {
    status: 'refused',
    code: 'action-host-unsupported',
    message: `The App has no source-backed mapping from ${actionId}'s declared inputs to the authenticated task admission spec and managed project-media result path.`,
  };
}
