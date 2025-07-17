# 🎨 Image Generation Tool

> **Status**: ✅ Active | **Path**: `/tools/image-generation`

*Wan-local workflow for AI image generation with LoRA support*

---

## 📁 File Structure

```
src/tools/image-generation/
├── pages/
│   └── ImageGenerationToolPage.tsx    # Main UI orchestrator
├── components/
│   ├── ImageGenerationForm.tsx        # Generation settings form
│   ├── PromptGenerationControls.tsx   # Prompt management UI
│   ├── BulkEditControls.tsx          # Batch operations
└── settings.ts                       # Tool configuration
```

---

## 🔧 Key Components

### `ImageGenerationToolPage.tsx`
**Main orchestrator component**
- Manages Wan task creation via `useCreateTask`
- Displays real-time progress bar during generation
- Integrates `ImageGallery` with live updates
- Handles upscaling and deletion operations
- No environment-specific branching (Wan-only)

### `ImageGenerationForm.tsx`
**Simplified generation form**
- **Inputs**: Prompts, images-per-prompt, before/after prompt text
- **Features**: Wan LoRA picker integration
- **Removed**: ControlNet sliders, starting-image inputs
- **State**: Persistent via `usePersistentToolState`

### `PromptGenerationControls.tsx`
**Prompt management interface**
- Add/edit/delete prompts
- Bulk operations support
- Prompt templates
- Real-time validation

---

## 🪝 Custom Hooks

### `useGenerations`
Provides generation management functionality:
```typescript
const {
  generations,      // List of generated images
  isLoading,       // Loading state
  upscale,         // Upscale image function
  deleteGeneration // Delete image function
} = useGenerations(projectId);
```

---

## ⚙️ Settings Schema

```typescript
{
  id: 'image-generation',
  scope: ['project'],
  defaults: {
    prompts: [
      {
        id: 'prompt-1',
        fullPrompt: 'A majestic cat astronaut exploring a vibrant nebula, artstation',
        shortPrompt: 'Cat Astronaut',
      }
    ],
    imagesPerPrompt: 1,
    selectedLorasByMode: {
      'wan-local': [],
      'flux-api': [],
      'hidream-api': []
    },
    depthStrength: 50,
    softEdgeStrength: 20,
    generationMode: 'wan-local',
    beforeEachPromptText: '',
    afterEachPromptText: ''
  }
}
```

---

## 🔄 Generation Workflow

```mermaid
graph TD
    A[User enters prompts] --> B[Select LoRAs]
    B --> C[Configure settings]
    C --> D[Create Wan task]
    D --> E[Show progress bar]
    E --> F[Poll task status]
    F --> G[Display results]
    G --> H[Optional: Upscale]
```

---

## 💡 Usage Tips

1. **LoRA Strength**: Start with 0.5-0.7 for best results
2. **Batch Size**: 4 images per prompt is optimal
3. **Prompts**: Use descriptive, specific language
4. **Before/After Text**: Apply consistent style modifiers

---

<div align="center">

**🔗 Related**

[Tool Settings](../data_persistence.md) • [Adding Tools](../adding_new_tool.md) • [Back to Structure](../structure.md)

</div> 