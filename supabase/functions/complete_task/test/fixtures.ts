/**
 * Test fixtures for complete_task edge function
 * Covers all major code paths and edge cases
 */

import { MockConfig } from './mocks.ts';

// Common UUIDs for consistency
export const IDS = {
  USER_1: '11111111-1111-1111-1111-111111111111',
  PROJECT_1: '22222222-2222-2222-2222-222222222222',
  TASK_SIMPLE_IMAGE: '33333333-3333-3333-3333-333333333333',
  TASK_VIDEO_I2V: '44444444-4444-4444-4444-444444444444',
  TASK_TRAVEL_SEGMENT: '55555555-5555-5555-5555-555555555555',
  TASK_ORCHESTRATOR: '66666666-6666-6666-6666-666666666666',
  TASK_INPAINT: '77777777-7777-7777-7777-777777777777',
  TASK_UPSCALE: '88888888-8888-8888-8888-888888888888',
  TASK_TRAVEL_STITCH: '99999999-9999-9999-9999-999999999999',
  GENERATION_SOURCE: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  GENERATION_PARENT: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  SHOT_1: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  // New IDs for additional test scenarios
  TASK_JOIN_CLIPS_SINGLE: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  TASK_JOIN_CLIPS_ORCHESTRATOR: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  TASK_BAD_SHOT: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  TASK_SEGMENT_WITH_EXPANSION: '11111111-2222-3333-4444-555555555555',
  INVALID_SHOT: 'not-a-valid-uuid',
  NONEXISTENT_SHOT: 'deadbeef-dead-beef-dead-beefdeadbeef',
};

// Base mock config with common data
export const baseMockConfig: MockConfig = {
  tasks: {
    [IDS.TASK_SIMPLE_IMAGE]: {
      id: IDS.TASK_SIMPLE_IMAGE,
      task_type: 'single_image',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        prompt: 'A beautiful sunset',
      },
    },
    [IDS.TASK_VIDEO_I2V]: {
      id: IDS.TASK_VIDEO_I2V,
      task_type: 'wan_2_2_i2v',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        prompt: 'Camera pans slowly',
        shot_id: IDS.SHOT_1,
        orchestrator_details: {
          shot_id: IDS.SHOT_1,
        },
      },
    },
    [IDS.TASK_TRAVEL_SEGMENT]: {
      id: IDS.TASK_TRAVEL_SEGMENT,
      task_type: 'travel_segment',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        segment_index: 0,
        orchestrator_task_id: IDS.TASK_ORCHESTRATOR,
        orchestrator_run_id: 'run-123',
        orchestrator_details: {
          orchestrator_task_id: IDS.TASK_ORCHESTRATOR,
          run_id: 'run-123',
          num_new_segments_to_generate: 3,
        },
      },
    },
    [IDS.TASK_ORCHESTRATOR]: {
      id: IDS.TASK_ORCHESTRATOR,
      task_type: 'travel_orchestrator',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        orchestrator_details: {
          num_new_segments_to_generate: 3,
          shot_id: IDS.SHOT_1,
        },
      },
    },
    [IDS.TASK_INPAINT]: {
      id: IDS.TASK_INPAINT,
      task_type: 'image_inpaint',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        based_on: IDS.GENERATION_SOURCE,
        prompt: 'Remove the person',
        mask: 'base64mask...',
      },
    },
    [IDS.TASK_UPSCALE]: {
      id: IDS.TASK_UPSCALE,
      task_type: 'image_upscale',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        generation_id: IDS.GENERATION_SOURCE,
        image: 'https://example.com/original.png',
        model: 'real-esrgan',
      },
    },
    [IDS.TASK_TRAVEL_STITCH]: {
      id: IDS.TASK_TRAVEL_STITCH,
      task_type: 'travel_stitch',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        orchestrator_task_id: IDS.TASK_ORCHESTRATOR,
        parent_generation_id: IDS.GENERATION_PARENT,
        orchestrator_details: {
          parent_generation_id: IDS.GENERATION_PARENT,
        },
        full_orchestrator_payload: {
          thumbnail_url: null,
        },
      },
    },
    // New test tasks for additional coverage
    [IDS.TASK_JOIN_CLIPS_SINGLE]: {
      id: IDS.TASK_JOIN_CLIPS_SINGLE,
      task_type: 'join_clips_segment',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        segment_index: 0,
        join_index: 0,
        is_first_join: true,
        is_last_join: true, // Single join = 2 clips
        orchestrator_task_id: IDS.TASK_JOIN_CLIPS_ORCHESTRATOR,
        orchestrator_details: {
          orchestrator_task_id: IDS.TASK_JOIN_CLIPS_ORCHESTRATOR,
          parent_generation_id: IDS.GENERATION_PARENT,
        },
        full_orchestrator_payload: {
          tool_type: 'join-clips',
        },
      },
    },
    [IDS.TASK_JOIN_CLIPS_ORCHESTRATOR]: {
      id: IDS.TASK_JOIN_CLIPS_ORCHESTRATOR,
      task_type: 'join_clips_orchestrator',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        orchestrator_details: {
          clip_list: ['clip1.mp4', 'clip2.mp4'],
          parent_generation_id: IDS.GENERATION_PARENT,
        },
      },
    },
    [IDS.TASK_BAD_SHOT]: {
      id: IDS.TASK_BAD_SHOT,
      task_type: 'single_image',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        prompt: 'Image with invalid shot',
        shot_id: IDS.INVALID_SHOT, // Invalid UUID format
      },
    },
    [IDS.TASK_SEGMENT_WITH_EXPANSION]: {
      id: IDS.TASK_SEGMENT_WITH_EXPANSION,
      task_type: 'travel_segment',
      project_id: IDS.PROJECT_1,
      user_id: IDS.USER_1,
      status: 'In Progress',
      params: {
        segment_index: 1,
        orchestrator_task_id: IDS.TASK_ORCHESTRATOR,
        orchestrator_details: {
          orchestrator_task_id: IDS.TASK_ORCHESTRATOR,
          num_new_segments_to_generate: 3,
          base_prompts_expanded: ['Prompt for segment 0', 'Prompt for segment 1', 'Prompt for segment 2'],
          negative_prompts_expanded: ['Neg 0', 'Neg 1', 'Neg 2'],
          segment_frames_expanded: [81, 97, 81],
          frame_overlap_expanded: [5, 5, 5],
        },
      },
    },
  },
  taskTypes: {
    'single_image': {
      name: 'single_image',
      category: 'generation',
      tool_type: 'image-generation',
      content_type: 'image',
      is_active: true,
    },
    'wan_2_2_i2v': {
      name: 'wan_2_2_i2v',
      category: 'generation',
      tool_type: 'image-to-video',
      content_type: 'video',
      is_active: true,
    },
    'travel_segment': {
      name: 'travel_segment',
      category: 'generation',
      tool_type: 'travel-between-images',
      content_type: 'video',
      is_active: true,
    },
    'travel_orchestrator': {
      name: 'travel_orchestrator',
      category: 'orchestration',
      tool_type: 'travel-between-images',
      content_type: 'video',
      is_active: true,
    },
    'image_inpaint': {
      name: 'image_inpaint',
      category: 'processing',
      tool_type: 'magic-edit',
      content_type: 'image',
      is_active: true,
    },
    'image_upscale': {
      name: 'image_upscale',
      category: 'upscale',
      tool_type: 'upscale',
      content_type: 'image',
      is_active: true,
    },
    'travel_stitch': {
      name: 'travel_stitch',
      category: 'processing',
      tool_type: 'travel-between-images',
      content_type: 'video',
      is_active: true,
    },
    'join_clips_segment': {
      name: 'join_clips_segment',
      category: 'generation',
      tool_type: 'join-clips',
      content_type: 'video',
      is_active: true,
    },
    'join_clips_orchestrator': {
      name: 'join_clips_orchestrator',
      category: 'orchestration',
      tool_type: 'join-clips',
      content_type: 'video',
      is_active: true,
    },
  },
  generations: {
    [IDS.GENERATION_SOURCE]: {
      id: IDS.GENERATION_SOURCE,
      project_id: IDS.PROJECT_1,
      location: 'https://example.com/source.png',
      thumbnail_url: 'https://example.com/source_thumb.jpg',
      type: 'image',
      params: { prompt: 'Original image' },
      tasks: [],
    },
    [IDS.GENERATION_PARENT]: {
      id: IDS.GENERATION_PARENT,
      project_id: IDS.PROJECT_1,
      location: null, // Placeholder
      thumbnail_url: null,
      type: 'video',
      params: { tool_type: 'travel-between-images' },
      tasks: [IDS.TASK_ORCHESTRATOR],
    },
  },
  shots: {
    [IDS.SHOT_1]: {
      id: IDS.SHOT_1,
      name: 'Shot 1',
      project_id: IDS.PROJECT_1,
    },
  },
  existingFiles: [],
};

// ============ TEST SCENARIOS ============

export interface TestScenario {
  name: string;
  description: string;
  request: {
    task_id: string;
    file_data?: string;
    filename?: string;
    first_frame_data?: string;
    first_frame_filename?: string;
    storage_path?: string;
    thumbnail_storage_path?: string;
  };
  mockConfig: MockConfig;
  expectedStatusCode: number;
  // What operations we expect (high-level)
  expectedBehavior: string[];
}

// Simple base64 image data (1x1 red PNG)
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const TEST_SCENARIOS: TestScenario[] = [
  // ============ MODE 1: Base64 Upload ============
  {
    name: 'mode1_simple_image',
    description: 'MODE 1: Simple image generation task with base64 upload',
    request: {
      task_id: IDS.TASK_SIMPLE_IMAGE,
      file_data: TINY_PNG_BASE64,
      filename: 'output.png',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload file to storage',
      'auto-generate thumbnail',
      'create generation record',
      'mark task Complete',
      'trigger cost calculation',
    ],
  },
  
  {
    name: 'mode1_video_i2v',
    description: 'MODE 1: Image-to-video task with thumbnail',
    request: {
      task_id: IDS.TASK_VIDEO_I2V,
      file_data: TINY_PNG_BASE64, // Pretend it's video data
      filename: 'output.mp4',
      first_frame_data: TINY_PNG_BASE64,
      first_frame_filename: 'thumb.png',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload video to storage',
      'upload provided thumbnail',
      'create generation record with type=video',
      'link to shot',
      'mark task Complete',
    ],
  },
  
  // ============ MODE 3: Pre-signed URL ============
  {
    name: 'mode3_presigned',
    description: 'MODE 3: File already uploaded via pre-signed URL',
    request: {
      task_id: IDS.TASK_SIMPLE_IMAGE,
      storage_path: `${IDS.USER_1}/tasks/${IDS.TASK_SIMPLE_IMAGE}/output.png`,
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'get public URL (no upload)',
      'create generation record',
      'mark task Complete',
    ],
  },
  
  {
    name: 'mode3_with_thumbnail',
    description: 'MODE 3: Pre-signed with separate thumbnail',
    request: {
      task_id: IDS.TASK_VIDEO_I2V,
      storage_path: `${IDS.USER_1}/tasks/${IDS.TASK_VIDEO_I2V}/output.mp4`,
      thumbnail_storage_path: `${IDS.USER_1}/tasks/${IDS.TASK_VIDEO_I2V}/thumbnails/thumb.jpg`,
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'get video public URL',
      'get thumbnail public URL',
      'create generation with thumbnail',
    ],
  },
  
  // ============ INPAINT / EDIT (creates variant) ============
  {
    name: 'inpaint_creates_variant',
    description: 'Inpaint task with based_on creates variant on source generation',
    request: {
      task_id: IDS.TASK_INPAINT,
      file_data: TINY_PNG_BASE64,
      filename: 'inpainted.png',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload file',
      'fetch source generation',
      'create variant on source (NOT new generation)',
      'mark task Complete',
    ],
  },
  
  // ============ UPSCALE ============
  {
    name: 'upscale_creates_primary_variant',
    description: 'Upscale task creates new primary variant',
    request: {
      task_id: IDS.TASK_UPSCALE,
      file_data: TINY_PNG_BASE64,
      filename: 'upscaled.png',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload upscaled file',
      'fetch source generation',
      'create upscaled variant as PRIMARY',
      'mark task Complete',
    ],
  },
  
  // ============ ORCHESTRATOR SEGMENTS ============
  {
    name: 'travel_segment_creates_child',
    description: 'Travel segment creates child generation linked to parent',
    request: {
      task_id: IDS.TASK_TRAVEL_SEGMENT,
      file_data: TINY_PNG_BASE64,
      filename: 'segment_0.mp4',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload segment video',
      'get or create parent generation',
      'create child generation with parent_generation_id',
      // NOTE: We no longer create variants for child segments - children are tracked via parent_generation_id
      'check if all siblings complete',
    ],
  },
  
  {
    name: 'travel_stitch_updates_parent',
    description: 'Travel stitch creates variant on parent generation',
    request: {
      task_id: IDS.TASK_TRAVEL_STITCH,
      file_data: TINY_PNG_BASE64,
      filename: 'stitched.mp4',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload stitched video',
      'create variant on parent generation',
      'update parent location',
      'mark task Complete',
    ],
  },
  
  // ============ ERROR CASES ============
  {
    name: 'error_missing_task_id',
    description: 'Request without task_id should fail',
    request: {
      task_id: '', // Empty
      file_data: TINY_PNG_BASE64,
      filename: 'output.png',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 400,
    expectedBehavior: ['return error response'],
  },
  
  {
    name: 'error_missing_file_data',
    description: 'MODE 1 without file_data should fail',
    request: {
      task_id: IDS.TASK_SIMPLE_IMAGE,
      filename: 'output.png',
      // file_data missing
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 400,
    expectedBehavior: ['return error response'],
  },
  
  {
    name: 'error_invalid_base64',
    description: 'Invalid base64 should fail',
    request: {
      task_id: IDS.TASK_SIMPLE_IMAGE,
      file_data: 'not-valid-base64!!!',
      filename: 'output.png',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 400,
    expectedBehavior: ['return error response'],
  },
  
  // ============ ADDITIONAL COVERAGE: Join Clips ============
  {
    name: 'join_clips_single_creates_parent_variant',
    description: 'Single join (2 clips) creates variant on parent instead of child generation',
    request: {
      task_id: IDS.TASK_JOIN_CLIPS_SINGLE,
      file_data: TINY_PNG_BASE64,
      filename: 'joined.mp4',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload joined video',
      'detect is_first_join && is_last_join (single join)',
      'create variant on parent generation',
      'mark orchestrator task generation_created',
      'mark task Complete',
    ],
  },
  
  // ============ ADDITIONAL COVERAGE: Shot Validation ============
  {
    name: 'invalid_shot_uuid_cleaned',
    description: 'Invalid shot_id UUID format is cleaned from params',
    request: {
      task_id: IDS.TASK_BAD_SHOT,
      file_data: TINY_PNG_BASE64,
      filename: 'output.png',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload file',
      'detect invalid shot_id UUID format',
      'remove shot_id from params',
      'create generation without shot link',
      'mark task Complete',
    ],
  },
  
  // ============ ADDITIONAL COVERAGE: Segment Param Expansion ============
  {
    name: 'segment_uses_expanded_params',
    description: 'Travel segment extracts segment-specific params from expanded arrays',
    request: {
      task_id: IDS.TASK_SEGMENT_WITH_EXPANSION,
      file_data: TINY_PNG_BASE64,
      filename: 'segment_1.mp4',
    },
    mockConfig: baseMockConfig,
    expectedStatusCode: 200,
    expectedBehavior: [
      'upload segment video',
      'extract prompt from base_prompts_expanded[1]',
      'extract negative_prompt from negative_prompts_expanded[1]',
      'extract num_frames from segment_frames_expanded[1]',
      'create child generation with segment-specific params',
    ],
  },
];

// Export scenario by name for easy lookup
export const getScenario = (name: string): TestScenario | undefined => {
  return TEST_SCENARIOS.find(s => s.name === name);
};

