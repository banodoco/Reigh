/**
 * Shared utilities for extracting data from task params
 *
 * This module provides a single source of truth for parsing task parameters,
 * ensuring consistent behavior across TasksPane, MediaLightbox, and other components.
 */

/**
 * Parse task params, handling both string and object formats
 */
export function parseTaskParams(params: any): Record<string, any> {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      return JSON.parse(params);
    } catch {
      return {};
    }
  }
  return params;
}

/**
 * Derive input images from task params
 *
 * For segment tasks (has segment_index): Only returns segment-specific images
 * For orchestrated tasks: Returns all images from orchestrator
 * For other tasks: Checks various image field locations
 *
 * @param parsedParams - Already-parsed task params object
 * @returns Array of image URLs
 */
export function deriveInputImages(parsedParams: Record<string, any>): string[] {
  const p = parsedParams;
  const od = p?.orchestrator_details;
  const op = p?.full_orchestrator_payload;
  const isp = p?.individual_segment_params;

  // Check if this is a segment task (individual segment of a larger generation)
  const isSegmentTask = p?.segment_index !== undefined;

  // For segment tasks, ONLY use segment-specific images (not the full orchestrator list)
  if (isSegmentTask) {
    // Priority: individual_segment_params > top-level input_image_paths_resolved
    if (Array.isArray(isp?.input_image_paths_resolved) && isp.input_image_paths_resolved.length > 0) {
      return isp.input_image_paths_resolved.filter((x: any) => typeof x === 'string');
    }
    // Fallback to start/end image URLs
    if (isp?.start_image_url || isp?.end_image_url) {
      const urls: string[] = [];
      if (typeof isp?.start_image_url === 'string') urls.push(isp.start_image_url);
      if (typeof isp?.end_image_url === 'string') urls.push(isp.end_image_url);
      return urls;
    }
    // Fallback to top-level (which should be segment-specific for segment tasks)
    if (Array.isArray(p?.input_image_paths_resolved)) {
      return p.input_image_paths_resolved.filter((x: any) => typeof x === 'string');
    }
    return [];
  }

  // For non-segment tasks, collect from all locations
  const urls: string[] = [];

  // Image edit task paths
  if (typeof p?.image_url === 'string') urls.push(p.image_url);
  if (typeof p?.image === 'string') urls.push(p.image);
  if (typeof p?.input_image === 'string') urls.push(p.input_image);
  if (typeof p?.init_image === 'string') urls.push(p.init_image);
  if (typeof p?.control_image === 'string') urls.push(p.control_image);
  if (Array.isArray(p?.images)) urls.push(...p.images.filter((x: any) => typeof x === 'string'));
  if (Array.isArray(p?.input_images)) urls.push(...p.input_images.filter((x: any) => typeof x === 'string'));
  if (typeof p?.mask_url === 'string') urls.push(p.mask_url);

  // Travel/video task paths - orchestrator details contain all images for full timeline
  if (Array.isArray(od?.input_image_paths_resolved)) {
    urls.push(...od.input_image_paths_resolved.filter((x: any) => typeof x === 'string'));
  } else if (Array.isArray(op?.input_image_paths_resolved)) {
    urls.push(...op.input_image_paths_resolved.filter((x: any) => typeof x === 'string'));
  } else if (Array.isArray(p?.input_image_paths_resolved)) {
    urls.push(...p.input_image_paths_resolved.filter((x: any) => typeof x === 'string'));
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

/**
 * Extract prompt from task params
 *
 * For segment tasks: Checks individual_segment_params first
 * For orchestrated tasks: Checks orchestrator details
 * For other tasks: Falls back to top-level prompt
 *
 * @param parsedParams - Already-parsed task params object
 * @returns The prompt string or null
 */
export function derivePrompt(parsedParams: Record<string, any>): string | null {
  const p = parsedParams;
  const od = p?.orchestrator_details;
  const op = p?.full_orchestrator_payload;
  const isp = p?.individual_segment_params;

  const isSegmentTask = p?.segment_index !== undefined;

  // For segment tasks, prefer individual_segment_params first
  if (isSegmentTask) {
    return isp?.base_prompt ||
      p?.base_prompt ||
      p?.prompt ||
      od?.base_prompt ||
      null;
  }

  // For full timeline/orchestrated tasks
  return od?.base_prompts_expanded?.[0] ||
    op?.base_prompts_expanded?.[0] ||
    od?.base_prompt ||
    op?.base_prompt ||
    p?.base_prompt ||
    p?.prompt ||
    null;
}
