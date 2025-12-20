# 🛠️ Adding a New Tool

> **⚡ Quick Guide**: Follow these steps and your tool will be auto-wired into the system (routing, persistence, UI visibility).

---

## 📋 Step-by-Step Checklist

### 1️⃣ Create Tool Structure

Create your tool directory with this layout:

```
src/tools/my-new-tool/
├── pages/
│   └── MyNewToolPage.tsx      # Primary UI component
├── components/                 # Tool-specific widgets
├── hooks/                      # Custom hooks (optional)
└── settings.ts                 # Config & defaults
```

### 2️⃣ Define Tool Settings

Create `settings.ts` with your tool's configuration:

```typescript
// src/tools/my-new-tool/settings.ts
export const myNewToolSettings = {
  id: 'my-new-tool',
  scope: ['project'] as const,     // Can be: ['user'], ['project'], ['shot'], or combinations
  defaults: {
    // Your strongly-typed default values
    enableFeatureX: true,
    maxItems: 10,
    apiEndpoint: 'https://api.example.com',
  },
};

// TypeScript type for your settings
export type MyNewToolSettings = typeof myNewToolSettings.defaults;
```

### 3️⃣ Register in Tool Manifest

Add your tool to the global registry:

```typescript
// src/tools/index.ts

// 1. Export your settings
export { myNewToolSettings } from './my-new-tool/settings';

// 2. Add to manifest array
toolsManifest.push(myNewToolSettings);

// 3. Add UI metadata
toolsUIManifest.push({
  id: myNewToolSettings.id,
  name: 'My New Tool',               // Display name
  path: '/tools/my-new-tool',        // Route path
  icon: SomeIcon,                    // Lucide icon component
  description: 'Tool description',   // Optional
  category: 'generation',            // Optional categorization
});
```

### 4️⃣ Add Route

Register the route in the app router:

```typescript
// src/app/routes.tsx

// Import your page component
import { MyNewToolPage } from '@/tools/my-new-tool/pages/MyNewToolPage';

// Add to routes array
{
  path: '/tools/my-new-tool',
  element: <MyNewToolPage />
}
```

### 5️⃣ Implement Tool UI

Create your main page component:

```typescript
// src/tools/my-new-tool/pages/MyNewToolPage.tsx
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { myNewToolSettings } from '../settings';

export function MyNewToolPage() {
  const { state, updateState, isLoading } = usePersistentToolState(
    myNewToolSettings.id,
    myNewToolSettings.defaults
  );

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <h1>My New Tool</h1>
      {/* Your tool UI here */}
    </div>
  );
}
```

### 6️⃣ (Optional) Add Backend Logic

If your tool needs server-side processing:

#### Option A: Edge Function
```bash
# Create new Edge Function
supabase functions new my-tool-process

# Implement in supabase/functions/my-tool-process/index.ts
# Deploy with: supabase functions deploy my-tool-process
```

#### Option B: Express Route
```typescript
// src/server/routes/my-tool.ts
// Add Express routes for backend processing
```

---

## ✅ That's It!

Your tool now has:
- 🔧 Automatic settings persistence via `useToolSettings`
- 💾 Local state management via `usePersistentToolState`
- 🎨 Automatic appearance in Tool Selector
- 🔄 Cross-device settings sync
- 📱 Mobile-responsive layout support

## 🎯 Pro Tips

1. **Settings Scope**: Choose scope based on where settings should persist:
   - `user`: Global user preferences
   - `project`: Project-specific config
   - `shot`: Shot-level overrides

2. **State Management**: Use `markAsInteracted()` after programmatic changes to ensure saves

3. **Testing**: Check your tool appears in `/tools` selector and settings persist across refreshes

4. **Icons**: Browse available icons at [lucide.dev](https://lucide.dev)

---

<div align="center">

**📚 Related Docs**

[Back to Structure](../../structure.md) • [Tool Settings](./data_persistence.md) • [Design Guidelines](./design_motion_guidelines.md)

</div> 