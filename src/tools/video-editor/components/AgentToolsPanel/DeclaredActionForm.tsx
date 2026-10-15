import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import type { RuntimeCapability } from '@/tools/video-editor/data/bridgeContract.ts';
import {
  createDeclaredActionInitialValues,
  declaredActionExecutionRefusal,
  parseDeclaredActionDeclaration,
  validateDeclaredActionValues,
  type DeclaredActionExecutionRefusal,
} from '@/tools/video-editor/data/declaredActionForm.ts';

export interface DeclaredActionFormProps {
  actionId: string;
  capability: RuntimeCapability | null;
}

export function DeclaredActionForm({ actionId, capability }: DeclaredActionFormProps) {
  const capabilityMismatch = capability !== null && capability.capability_id !== actionId;
  const declaration = !capabilityMismatch ? capability?.action_declaration ?? null : null;
  const parsedDeclaration = useMemo(
    () => declaration === null
      ? null
      : parseDeclaredActionDeclaration(declaration),
    [declaration],
  );
  const action = parsedDeclaration?.ok ? parsedDeclaration.declaration : null;
  const initialValues = useMemo(
    () => action ? createDeclaredActionInitialValues(action) : {},
    [action],
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [executionRefusal, setExecutionRefusal] = useState<DeclaredActionExecutionRefusal | null>(null);
  const formDeclaration = action;

  useEffect(() => {
    setValues(initialValues);
    setValidationErrors({});
    setExecutionRefusal(null);
  }, [initialValues]);

  if (!formDeclaration || !parsedDeclaration?.ok) {
    const message = capabilityMismatch
      ? `Runtime returned ${capability.capability_id} for action ${actionId}.`
      : parsedDeclaration && !parsedDeclaration.ok
        ? parsedDeclaration.message
        : `Runtime has no action declaration for ${actionId}; the catalog entry contains summary metadata only.`;
    const unavailableCode = capabilityMismatch
      ? 'capability-mismatch'
      : parsedDeclaration?.ok === false
        ? parsedDeclaration.code
        : 'action-declaration-unavailable';
    return (
      <section
        className="space-y-1 rounded border border-yellow-500/20 bg-yellow-500/5 px-3 py-2"
        aria-label={`Declared action ${actionId}`}
        data-video-editor-declared-action="true"
        data-video-editor-declared-action-state={capabilityMismatch || parsedDeclaration?.ok === false ? 'unsupported' : 'unavailable'}
        data-video-editor-declared-action-code={unavailableCode}
      >
        <h3 className="text-[11px] font-medium text-zinc-300">{actionId}</h3>
        <p role="status" className="text-[10px] text-yellow-300">
          {message}
        </p>
      </section>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExecutionRefusal(null);
    if (!formDeclaration) return;
    const validation = validateDeclaredActionValues(formDeclaration, values);
    if (!validation.ok) {
      setValidationErrors(validation.errors);
      return;
    }
    setValidationErrors({});
    setExecutionRefusal(declaredActionExecutionRefusal(actionId, capability, formDeclaration));
  }

  return (
    <section
      className="space-y-2 rounded border border-white/10 bg-zinc-950/60 px-3 py-2"
      aria-label={`Declared action ${actionId}`}
      data-video-editor-declared-action="true"
      data-video-editor-declared-action-state="inspectable"
    >
      <header className="space-y-0.5">
        {action.kind && <p className="text-[9px] uppercase tracking-wide text-zinc-600">{action.kind}</p>}
        <h3 className="text-[11px] font-medium text-zinc-200">{action.name ?? actionId}</h3>
        {action.short_description && <p className="text-[10px] text-zinc-400">{action.short_description}</p>}
        {action.description && <p className="text-[10px] text-zinc-500">{action.description}</p>}
      </header>

      <form className="space-y-2" noValidate onSubmit={handleSubmit}>
        <div className="space-y-2">
          {formDeclaration.inputs.map((input) => {
            const id = `declared-action-${actionId}-${input.name}`;
            const common = {
              id,
              name: input.name,
              required: input.required,
              'aria-invalid': validationErrors[input.name] ? true : undefined,
              'aria-describedby': [
                input.description ? `${id}-description` : undefined,
                validationErrors[input.name] ? `${id}-error` : undefined,
              ].filter(Boolean).join(' ') || undefined,
              'data-testid': `declared-action-input-${input.name}`,
              className: 'w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-200',
              value: values[input.name] ?? '',
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const nextValue = event.currentTarget.value;
                setValues((current) => ({ ...current, [input.name]: nextValue }));
                setValidationErrors((current) => {
                  if (!current[input.name]) return current;
                  const next = { ...current };
                  delete next[input.name];
                  return next;
                });
                setExecutionRefusal(null);
              },
            };

            return (
              <div key={input.name} className="space-y-0.5">
                <label htmlFor={id} className="flex items-center gap-1 text-[10px] text-zinc-300">
                  <span>{input.name}</span>
                  <span className="font-mono text-zinc-600">{input.type}</span>
                  {input.required && <span className="text-yellow-400">required</span>}
                </label>
                {input.type === 'json' ? (
                  <textarea {...common} rows={4} spellCheck={false} />
                ) : (
                  <input
                    {...common}
                    type={input.type === 'string' ? 'text' : 'number'}
                    step={input.type === 'integer' ? '1' : 'any'}
                  />
                )}
                {input.description && (
                  <p id={`${id}-description`} className="text-[9px] text-zinc-500">{input.description}</p>
                )}
                {validationErrors[input.name] && (
                  <p id={`${id}-error`} className="text-[9px] text-red-300" role="alert">
                    {validationErrors[input.name]}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-1 border-t border-white/5 pt-2" data-video-editor-declared-action-outputs="true">
          <h4 className="text-[10px] font-medium text-zinc-400">Declared outputs</h4>
          {formDeclaration.outputs.map((output) => (
            <div key={output.name} className="rounded bg-zinc-900/70 px-2 py-1" data-video-editor-declared-action-output={output.name}>
              <div className="text-[10px] text-zinc-300">
                <span className="font-medium">{output.name}</span>
                <span className="ml-1 font-mono text-zinc-500">{output.type}</span>
                {output.artifact_type && <span className="ml-1 text-zinc-500">({output.artifact_type})</span>}
              </div>
              {output.description && <p className="text-[9px] text-zinc-500">{output.description}</p>}
            </div>
          ))}
          <p className="text-[9px] text-zinc-600">Output locations are managed by the host.</p>
        </div>

        <button
          type="submit"
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700"
          data-video-editor-declared-action-run="true"
        >
          Run action
        </button>
      </form>

      {executionRefusal && (
        <p
          role="status"
          className="rounded border border-yellow-500/20 bg-yellow-500/5 px-2 py-1 text-[10px] text-yellow-300"
          data-video-editor-declared-action-state="refused"
          data-video-editor-declared-action-code={executionRefusal.code}
        >
          {executionRefusal.message}
        </p>
      )}
    </section>
  );
}
