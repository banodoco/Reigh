# Adding a New Tool to Reigh

This guide explains the steps required to register a brand-new tool in the Reigh code-base.  It is largely unchanged from the original `structure.md` section but lives here so that the main onboarding document stays concise.

---

## 1. Create the directory structure

```text
src/tools/my-new-tool/
├── pages/MyNewToolPage.tsx     # Main tool page component
├── components/                 # Tool-specific components
├── settings.ts                 # Tool settings definition
└── hooks/                      # Tool-specific hooks (optional)
```

## 2. Define tool settings

Create `src/tools/my-new-tool/settings.ts`:

```ts
export interface MyNewToolSettings {
  someProperty: string;
  anotherProperty: number;
}

export const myNewToolSettings = {
  id: 'my-new-tool',
  scope: ['project'] as const, // or ['user', 'project', 'shot']
  defaults: {
    someProperty: 'default value',
    anotherProperty: 42,
  } satisfies MyNewToolSettings,
};
```

## 3. Register in the tools manifest

Edit `src/tools/index.ts`:

```ts
// Add your export
export { myNewToolSettings } from './my-new-tool/settings';

// Add to toolsManifest array
export const toolsManifest = [
  // ... existing tools
  myNewToolSettings,
] as const;

// Add UI definition to toolsUIManifest
export const toolsUIManifest: ToolUIDefinition[] = [
  // ... existing tools
  {
    id: myNewToolSettings.id,
    name: 'My New Tool',
    path: '/tools/my-new-tool',
    description: 'Description of what this tool does.',
    environments: [AppEnv.DEV], // or LOCAL_ENVS for broader visibility
    icon: SomeIcon, // Import from lucide-react
    gradient: 'from-color-1 to-color-2',
    accent: 'color-name',
    ornament: '★',
    badge: 'New', // optional
  },
];
```

## 4. Add a route

In `src/app/routes.tsx`:

```ts
{
  path: '/tools/my-new-tool',
  element: <MyNewToolPage />,
}
```

## 5. Optional server route (if needed)

Create `src/server/routes/myNewTool.ts` and register it in `src/server/index.ts`.

## 6. What happens automatically?

* Tool-settings defaults are registered in `toolSettingsService.ts`.
* The tool appears in the Tool Selector page based on environment configuration.
* Database persistence works via `useToolSettings` or `usePersistentToolState` hooks.
* Settings cascade (app defaults → user → project → shot) works immediately.

## 7. Migration considerations

* Add database migrations in `/db/migrations/` if new tables/columns are required.
* Update `taskConfig.ts` if your tool creates background tasks. 