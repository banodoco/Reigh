import { DisplayableMetadata } from '../ImageGallery';

/**
 * Derive input images from task params
 * Strips any surrounding quotes from URLs that may have been improperly stored
 */
export const deriveInputImages = (task: any): string[] => {
  const cleanUrl = (url: string): string => {
    if (typeof url !== 'string') return url;
    // Remove surrounding quotes if present
    return url.replace(/^["']|["']$/g, '');
  };
  
  const p = task?.params || {};
  if (Array.isArray(p.input_images) && p.input_images.length > 0) {
    return p.input_images.map(cleanUrl);
  }
  if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
    return p.full_orchestrator_payload.input_image_paths_resolved.map(cleanUrl);
  }
  if (Array.isArray(p.input_image_paths_resolved)) {
    return p.input_image_paths_resolved.map(cleanUrl);
  }
  return [];
};

/**
 * Format metadata for display (legacy - being replaced by SharedMetadataDetails component)
 */
export const formatMetadataForDisplay = (metadata: DisplayableMetadata): string => {
  
  let displayText = "";
  
  // PROMPT SECTION
  const prompt = metadata.prompt || 
                 (metadata as any).originalParams?.orchestrator_details?.prompt;
  if (prompt) {
    displayText += `📝 PROMPT\n`;
    displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    displayText += `"${prompt}"\n\n`;
  }
  
  // GENERATION DETAILS SECTION
  displayText += `⚙️ GENERATION DETAILS\n`;
  displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  
  // Extract model from nested structure
  const model = (metadata as any).originalParams?.orchestrator_details?.model || metadata.model;
  if (model) displayText += `Model:       ${model}\n`;
  
  // Extract seed from nested structure if needed
  const seed = metadata.seed || (metadata as any).originalParams?.orchestrator_details?.seed;
  if (seed) displayText += `Seed:        ${seed}\n`;
  
  // Extract dimensions from multiple possible locations
  const resolution = (metadata as any).originalParams?.orchestrator_details?.resolution;
  if (metadata.width && metadata.height) {
    displayText += `Dimensions:  ${metadata.width}×${metadata.height}\n`;
  } else if (resolution) {
    displayText += `Dimensions:  ${resolution}\n`;
  }
  
  if (metadata.num_inference_steps) displayText += `Steps:       ${metadata.num_inference_steps}\n`;
  if (metadata.guidance_scale) displayText += `Guidance:    ${metadata.guidance_scale}\n`;
  if (metadata.scheduler) displayText += `Scheduler:   ${metadata.scheduler}\n`;
  
  // LORAS SECTION
  const additionalLoras = (metadata as any).originalParams?.orchestrator_details?.additional_loras;
  const activeLoras = metadata.activeLoras;
  
  if ((additionalLoras && Object.keys(additionalLoras).length > 0) || (activeLoras && activeLoras.length > 0)) {
    displayText += `\n🎨 LORAS\n`;
    displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (activeLoras && activeLoras.length > 0) {
      // Use structured activeLoras if available
      activeLoras.forEach(lora => {
        const displayName = lora.name || lora.id || 'Unknown';
        displayText += `${displayName} - ${lora.strength}%\n`;
      });
    } else if (additionalLoras) {
      // Fall back to additional_loras from orchestrator_details
      Object.entries(additionalLoras).forEach(([url, strength]) => {
        // Extract a display name from the URL
        const urlParts = url.split('/');
        const filename = urlParts[urlParts.length - 1] || url;
        const displayName = filename.replace(/\.(safetensors|ckpt|pt).*$/i, '').replace(/_/g, ' ');
        displayText += `${displayName} - ${((strength as number) * 100).toFixed(0)}%\n`;
      });
    }
  }
  
  // ADDITIONAL SETTINGS SECTION (if any)
  const hasAdditionalSettings = metadata.depthStrength !== undefined || 
                               metadata.softEdgeStrength !== undefined || 
                               metadata.userProvidedImageUrl;
  
  if (hasAdditionalSettings) {
    displayText += `\n🔧 ADDITIONAL SETTINGS\n`;
    displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (metadata.depthStrength !== undefined) 
      displayText += `Depth Strength:      ${(metadata.depthStrength * 100).toFixed(0)}%\n`;
    
    if (metadata.softEdgeStrength !== undefined) 
      displayText += `Soft Edge Strength:  ${(metadata.softEdgeStrength * 100).toFixed(0)}%\n`;
    
    if (metadata.userProvidedImageUrl) {
      const urlParts = metadata.userProvidedImageUrl.split('/');
      const imageName = urlParts[urlParts.length -1] || metadata.userProvidedImageUrl;
      displayText += `User Image:          ${imageName}\n`;
    }
  }
  
  return displayText.trim() || "No metadata available.";
};
