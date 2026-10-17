import Ajv from 'ajv';
import * as themeApi from '@banodoco/timeline-composition/theme-api';
import type { ModifierDeclaration, ModifierDefinition, ModifierRegistry } from '@banodoco/timeline-composition/theme-api';
import type { AstridElementHost } from './astrid-element-host.ts';

export type ComponentDescriptor = {
  point: 'timeline.component'; id: string; kind: 'modifier'; label: string; description: string;
  params: object; hosts: readonly string[]; bounds?: 'preserve'; alpha: 'preserve'; support: 'preserve';
  implementation: {path: string; export: string};
};
export type BundledComponent = {
  key: string; identity: string; implementation_digest: string;
  descriptor: ComponentDescriptor; module: Record<string, unknown>;
};
export type AdmittedComponent = {
  identity: string; implementationDigest: string; descriptor: ComponentDescriptor;
  validateParams: (params: unknown) => void;
};
const freeze = <T,>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

// Contributed binders can use the React-style Component spelling. Normalize
// it at this consumer boundary before the canonical Composition API captures
// the component in its wrapper; retain an explicitly supplied canonical value.
const componentThemeApi = {
  ...themeApi,
  declareModifier<TParams>(definition: ModifierDefinition<TParams> | (
    Omit<ModifierDefinition<TParams>, 'component'> & {Component: ModifierDefinition<TParams>['component']}
  )): ModifierDeclaration {
    return themeApi.declareModifier('component' in definition
      ? definition
      : {...definition, component: definition.Component});
  },
};

/** Ordinary prebundled modules only; this function cannot import code or expand trust. */
export function configureComponentHost(base: AstridElementHost, bindings: readonly BundledComponent[], host = 'app'): AstridElementHost {
  if (host !== 'app' && host !== 'composition') throw new Error(`unsupported component host: ${host}`);
  const registry: Record<string, ModifierDeclaration> = {...base.modifierRegistry};
  const components: AdmittedComponent[] = [...(base.components ?? [])];
  for (const binding of bindings) {
    const d = freeze(structuredClone(binding.descriptor));
    if (d.point !== 'timeline.component' || d.kind !== 'modifier'
      || binding.identity !== `${d.point}/${d.id}`) throw new Error('component identity substitution');
    if (!/^[a-f0-9]{64}$/.test(binding.implementation_digest)
      || binding.key !== `${binding.identity}@${binding.implementation_digest}`) throw new Error('stale component digest');
    if (Object.hasOwn(registry, binding.identity) || components.some(c => c.identity === binding.identity)) {
      throw new Error(`component collision: ${binding.identity}`);
    }
    if (!d.hosts.includes(host)) throw new Error(`unsupported component host: ${host}`);
    const binder = binding.module[d.implementation.export];
    if (typeof binder !== 'function') throw new Error(`missing component export: ${d.implementation.export}`);
    const declaration = binder(componentThemeApi, d) as ModifierDeclaration;
    if (!declaration || declaration.element !== binding.identity) throw new Error('component identity substitution');
    if (declaration.kind !== 'modifier' || declaration.alpha !== 'preserve' || declaration.support !== 'preserve'
      || declaration.bounds !== (d.bounds ?? 'unknown') || typeof declaration.wrap !== 'function'
      || JSON.stringify(declaration.hosts) !== JSON.stringify(d.hosts)
      || !declaration.hosts.includes(host)) throw new Error('unsupported component host contract');
    const validate = new Ajv({allErrors: true, strict: false}).compile(d.params);
    components.push(freeze({identity: binding.identity, implementationDigest: binding.implementation_digest,
      descriptor: d, validateParams(params: unknown) {
        if (!validate(params)) throw new Error(`invalid component params: ${JSON.stringify(validate.errors)}`);
      }}));
    registry[binding.identity] = Object.freeze(declaration);
  }
  return Object.freeze({...base, modifierRegistry: Object.freeze(registry) as ModifierRegistry,
    components: Object.freeze(components)});
}
