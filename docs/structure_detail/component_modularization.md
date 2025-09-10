# Component Modularization

## Overview

This document describes the shared, reusable UI components that display detailed information in a structured, consistent format across the application.

## Shared Detail Components

### SharedTaskDetails

**Location**: `src/tools/travel-between-images/components/SharedTaskDetails.tsx`

**Purpose**: Displays comprehensive task details including input images, prompts, and technical settings.

**Variants**:
- `hover`: Compact view for tooltip hover states
- `modal`: Medium view for modal dialogs  
- `panel`: Full view for panel/sidebar display

**Key Features**:
- Responsive image grids with overflow handling
- Expandable prompt text with "Show More" functionality
- Technical settings in organized grid layout
- LoRA display with truncation for long names
- Model name mapping (e.g., `vace_14B` → `Wan 2.1`)

### SharedMetadataDetails

**Location**: `src/shared/components/SharedMetadataDetails.tsx`

**Purpose**: Displays generation metadata for individual images in a structured format, replacing the previous text-based display.

**Variants**:
- `hover`: Compact view for desktop tooltips
- `modal`: Medium view for modal dialogs
- `panel`: Full view for mobile popovers and panels

**Key Features**:
- Structured display of prompts, negative prompts, and generation settings
- Reference image display when available
- LoRA information with strength percentages
- Technical parameters (seed, dimensions, steps, guidance, scheduler)
- Additional settings (depth strength, soft edge strength)
- Responsive design with mobile optimizations

**Usage Example**:
```tsx
<SharedMetadataDetails
  metadata={image.metadata}
  variant="hover"
  isMobile={false}
  showUserImage={true}
  showFullPrompt={showFullPrompt}
  onShowFullPromptChange={setShowFullPrompt}
/>
```

## Design Patterns

### Variant-Based Configuration

Both components use a configuration object pattern based on the `variant` prop:

```tsx
const config = {
  hover: {
    textSize: 'text-xs',
    fontWeight: 'font-light',
    // ... other compact settings
  },
  modal: {
    textSize: 'text-sm',
    // ... medium settings
  },
  panel: {
    textSize: 'text-sm',
    // ... full settings with mobile considerations
  }
}[variant];
```

### Progressive Disclosure

- Text content can be truncated with "Show More" buttons
- Image collections show limited items with overflow indicators
- LoRA lists are capped with "+N more" indicators

### Responsive Design

- Mobile-specific configurations in `panel` variant
- Grid layouts adapt to screen size
- Touch-friendly controls on mobile

## Integration Points

### ImageGallery Integration

The `SharedMetadataDetails` component is integrated into `ImageGalleryItem.tsx`:

- **Desktop**: Shows in tooltip on info button hover
- **Mobile**: Shows in popover on info button tap
- **Performance**: Only renders when tooltip/popover is open

### TaskItem Integration

The `SharedTaskDetails` component is used in travel task tooltips in `TaskItem.tsx`.

## Migration Notes

### From Text-Based to Component-Based

The `formatMetadataForDisplay` function in `ImageGallery.tsx` has been replaced by the `SharedMetadataDetails` component:

- **Before**: Plain text with emoji headers and line breaks
- **After**: Structured component with proper typography and responsive design
- **Performance**: Metadata formatting only occurs when UI is visible

### Backward Compatibility

The legacy `formatMetadataForDisplay` function is kept as a private function in case any other code still depends on it, but it's no longer exported.

## Best Practices

1. **Use appropriate variant**: Choose `hover` for tooltips, `panel` for mobile, `modal` for dialogs
2. **Handle missing data**: Both components gracefully handle undefined or missing metadata
3. **Performance**: Only render when needed (tooltip/popover open)
4. **Accessibility**: Proper heading structure and keyboard navigation
5. **Consistency**: Use the same component across similar display contexts

## Future Enhancements

- Add `onApplySettings` callback support to `SharedMetadataDetails`
- Consider creating a base `DetailComponent` interface for consistency
- Add theme/style variants for different contexts (dark mode, high contrast)
- Implement keyboard navigation for expandable sections