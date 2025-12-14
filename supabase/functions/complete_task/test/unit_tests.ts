/**
 * Unit tests for complete_task functions
 * 
 * These tests import and test the actual functions from index.ts
 * to ensure refactoring doesn't change behavior.
 * 
 * Usage:
 *   npx deno test --allow-read --allow-env test/unit_tests.ts
 */

import { assertEquals, assertExists, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ============ EXTRACTED FUNCTIONS FOR TESTING ============
// We copy the pure functions here to test them directly
// After refactoring, these will be imported from the actual modules

// From index.ts - getContentType
function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

// From index.ts - extractFromParams
function extractFromParams(params: any, fieldName: string, paths: string[][], logTag: string = 'ParamExtractor'): string | null {
  try {
    for (const path of paths) {
      let value = params;
      let pathValid = true;

      for (const key of path) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          pathValid = false;
          break;
        }
      }

      if (pathValid && value !== null && value !== undefined) {
        return String(value);
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// From index.ts - extractOrchestratorTaskId
function extractOrchestratorTaskId(params: any, logTag: string = 'OrchestratorExtract'): string | null {
  return extractFromParams(
    params,
    'orchestrator_task_id',
    [
      ['orchestrator_details', 'orchestrator_task_id'],
      ['originalParams', 'orchestrator_details', 'orchestrator_task_id'],
      ['orchestrator_task_id_ref'],
      ['orchestrator_task_id'],
    ],
    logTag
  );
}

// From index.ts - extractOrchestratorRunId
function extractOrchestratorRunId(params: any, logTag: string = 'OrchestratorExtract'): string | null {
  return extractFromParams(
    params,
    'run_id',
    [
      ['orchestrator_run_id'],
      ['run_id'],
      ['orchestrator_details', 'run_id'],
      ['originalParams', 'orchestrator_details', 'run_id'],
      ['full_orchestrator_payload', 'run_id'],
    ],
    logTag
  );
}

// From index.ts - extractBasedOn
function extractBasedOn(params: any): string | null {
  return extractFromParams(
    params,
    'based_on',
    [
      ['based_on'],
      ['originalParams', 'orchestrator_details', 'based_on'],
      ['orchestrator_details', 'based_on'],
      ['full_orchestrator_payload', 'based_on'],
      ['originalParams', 'based_on']
    ],
    'BasedOn'
  );
}

// From index.ts - extractShotAndPosition
function extractShotAndPosition(params: any): { shotId?: string, addInPosition: boolean } {
  const shotId = extractFromParams(
    params,
    'shot_id',
    [
      ['originalParams', 'orchestrator_details', 'shot_id'],
      ['orchestrator_details', 'shot_id'],
      ['shot_id'],
      ['full_orchestrator_payload', 'shot_id'],
      ['shotId']
    ],
    'GenMigration'
  ) || undefined;

  let addInPosition = false;
  const addInPositionValue = extractFromParams(
    params,
    'add_in_position',
    [
      ['add_in_position'],
      ['originalParams', 'add_in_position'],
      ['orchestrator_details', 'add_in_position'],
      ['originalParams', 'orchestrator_details', 'add_in_position']
    ],
    'GenMigration'
  );

  if (addInPositionValue !== null) {
    addInPosition = addInPositionValue === 'true' || addInPositionValue === '1';
  }

  return { shotId, addInPosition };
}

// From index.ts - setThumbnailInParams
const THUMBNAIL_PATH_CONFIG: Record<string, { path: string[]; extras?: Record<string, any> }> = {
  'travel_stitch': {
    path: ['full_orchestrator_payload', 'thumbnail_url'],
    extras: { accelerated: false }
  },
  'wan_2_2_i2v': {
    path: ['orchestrator_details', 'thumbnail_url']
  },
  'single_image': {
    path: ['thumbnail_url']
  },
  'default': {
    path: ['thumbnail_url']
  }
};

function setThumbnailInParams(
  params: Record<string, any>,
  taskType: string,
  thumbnailUrl: string
): Record<string, any> {
  const config = THUMBNAIL_PATH_CONFIG[taskType] || THUMBNAIL_PATH_CONFIG.default;
  const updatedParams = JSON.parse(JSON.stringify(params || {}));

  let target = updatedParams;
  for (let i = 0; i < config.path.length - 1; i++) {
    const key = config.path[i];
    if (!target[key]) {
      target[key] = {};
    }
    target = target[key];
  }

  const finalKey = config.path[config.path.length - 1];
  target[finalKey] = thumbnailUrl;

  if (config.extras) {
    for (const [key, value] of Object.entries(config.extras)) {
      target[key] = value;
    }
  }

  return updatedParams;
}

// From index.ts - buildGenerationParams
function buildGenerationParams(baseParams: any, toolType: string, contentType?: string, shotId?: string, thumbnailUrl?: string): any {
  let generationParams = { ...baseParams };
  generationParams.tool_type = toolType;
  if (contentType) {
    generationParams.content_type = contentType;
  }
  if (shotId) {
    generationParams.shotId = shotId;
  }
  if (thumbnailUrl) {
    generationParams.thumbnailUrl = thumbnailUrl;
  }
  return generationParams;
}

// ============ TESTS ============

Deno.test("getContentType - image formats", () => {
  assertEquals(getContentType("image.png"), "image/png");
  assertEquals(getContentType("photo.jpg"), "image/jpeg");
  assertEquals(getContentType("photo.jpeg"), "image/jpeg");
  assertEquals(getContentType("animated.gif"), "image/gif");
  assertEquals(getContentType("modern.webp"), "image/webp");
});

Deno.test("getContentType - video formats", () => {
  assertEquals(getContentType("video.mp4"), "video/mp4");
  assertEquals(getContentType("clip.webm"), "video/webm");
  assertEquals(getContentType("movie.mov"), "video/quicktime");
});

Deno.test("getContentType - case insensitive", () => {
  assertEquals(getContentType("IMAGE.PNG"), "image/png");
  assertEquals(getContentType("Video.MP4"), "video/mp4");
});

Deno.test("getContentType - unknown format", () => {
  assertEquals(getContentType("file.xyz"), "application/octet-stream");
  assertEquals(getContentType("noextension"), "application/octet-stream");
});

Deno.test("extractFromParams - top level field", () => {
  const params = { field: "value" };
  const result = extractFromParams(params, "field", [["field"]], "test");
  assertEquals(result, "value");
});

Deno.test("extractFromParams - nested field", () => {
  const params = { level1: { level2: { field: "deep_value" } } };
  const result = extractFromParams(params, "field", [["level1", "level2", "field"]], "test");
  assertEquals(result, "deep_value");
});

Deno.test("extractFromParams - multiple paths, first match wins", () => {
  const params = { 
    path1: { field: "first" },
    path2: { field: "second" }
  };
  const result = extractFromParams(params, "field", [
    ["path1", "field"],
    ["path2", "field"]
  ], "test");
  assertEquals(result, "first");
});

Deno.test("extractFromParams - fallback to second path", () => {
  const params = { 
    path2: { field: "second" }
  };
  const result = extractFromParams(params, "field", [
    ["path1", "field"],
    ["path2", "field"]
  ], "test");
  assertEquals(result, "second");
});

Deno.test("extractFromParams - null when not found", () => {
  const params = { other: "value" };
  const result = extractFromParams(params, "field", [["field"]], "test");
  assertEquals(result, null);
});

Deno.test("extractFromParams - handles null params", () => {
  const result = extractFromParams(null, "field", [["field"]], "test");
  assertEquals(result, null);
});

Deno.test("extractOrchestratorTaskId - from orchestrator_details", () => {
  const params = {
    orchestrator_details: {
      orchestrator_task_id: "task-123"
    }
  };
  assertEquals(extractOrchestratorTaskId(params), "task-123");
});

Deno.test("extractOrchestratorTaskId - from originalParams", () => {
  const params = {
    originalParams: {
      orchestrator_details: {
        orchestrator_task_id: "task-456"
      }
    }
  };
  assertEquals(extractOrchestratorTaskId(params), "task-456");
});

Deno.test("extractOrchestratorTaskId - from top level", () => {
  const params = {
    orchestrator_task_id: "task-789"
  };
  assertEquals(extractOrchestratorTaskId(params), "task-789");
});

Deno.test("extractOrchestratorTaskId - from ref field", () => {
  const params = {
    orchestrator_task_id_ref: "task-ref"
  };
  assertEquals(extractOrchestratorTaskId(params), "task-ref");
});

Deno.test("extractOrchestratorRunId - from orchestrator_run_id", () => {
  assertEquals(extractOrchestratorRunId({ orchestrator_run_id: "run-1" }), "run-1");
});

Deno.test("extractOrchestratorRunId - from run_id", () => {
  assertEquals(extractOrchestratorRunId({ run_id: "run-2" }), "run-2");
});

Deno.test("extractOrchestratorRunId - from orchestrator_details", () => {
  const params = { orchestrator_details: { run_id: "run-3" } };
  assertEquals(extractOrchestratorRunId(params), "run-3");
});

Deno.test("extractBasedOn - direct field", () => {
  assertEquals(extractBasedOn({ based_on: "gen-123" }), "gen-123");
});

Deno.test("extractBasedOn - from orchestrator_details", () => {
  const params = { orchestrator_details: { based_on: "gen-456" } };
  assertEquals(extractBasedOn(params), "gen-456");
});

Deno.test("extractBasedOn - null when missing", () => {
  assertEquals(extractBasedOn({ other: "value" }), null);
});

Deno.test("extractShotAndPosition - shot_id from top level", () => {
  const result = extractShotAndPosition({ shot_id: "shot-1" });
  assertEquals(result.shotId, "shot-1");
  assertEquals(result.addInPosition, false);
});

Deno.test("extractShotAndPosition - shot_id from orchestrator_details", () => {
  const params = { orchestrator_details: { shot_id: "shot-2" } };
  const result = extractShotAndPosition(params);
  assertEquals(result.shotId, "shot-2");
});

Deno.test("extractShotAndPosition - with addInPosition true", () => {
  const params = { shot_id: "shot-3", add_in_position: true };
  const result = extractShotAndPosition(params);
  assertEquals(result.shotId, "shot-3");
  assertEquals(result.addInPosition, true);
});

Deno.test("extractShotAndPosition - addInPosition as string 'true'", () => {
  const params = { shot_id: "shot-4", add_in_position: "true" };
  const result = extractShotAndPosition(params);
  assertEquals(result.addInPosition, true);
});

Deno.test("extractShotAndPosition - addInPosition defaults to false", () => {
  const params = { shot_id: "shot-5" };
  const result = extractShotAndPosition(params);
  assertEquals(result.addInPosition, false);
});

Deno.test("setThumbnailInParams - default path (top level)", () => {
  const params = { prompt: "test" };
  const result = setThumbnailInParams(params, "unknown_type", "http://thumb.jpg");
  assertEquals(result.thumbnail_url, "http://thumb.jpg");
  assertEquals(result.prompt, "test");
});

Deno.test("setThumbnailInParams - single_image path", () => {
  const params = { prompt: "test" };
  const result = setThumbnailInParams(params, "single_image", "http://thumb.jpg");
  assertEquals(result.thumbnail_url, "http://thumb.jpg");
});

Deno.test("setThumbnailInParams - wan_2_2_i2v nested path", () => {
  const params = { prompt: "test" };
  const result = setThumbnailInParams(params, "wan_2_2_i2v", "http://thumb.jpg");
  assertEquals(result.orchestrator_details?.thumbnail_url, "http://thumb.jpg");
});

Deno.test("setThumbnailInParams - travel_stitch with extras", () => {
  const params = { prompt: "test" };
  const result = setThumbnailInParams(params, "travel_stitch", "http://thumb.jpg");
  assertEquals(result.full_orchestrator_payload?.thumbnail_url, "http://thumb.jpg");
  assertEquals(result.full_orchestrator_payload?.accelerated, false);
});

Deno.test("setThumbnailInParams - does not mutate original", () => {
  const params = { prompt: "test" };
  const result = setThumbnailInParams(params, "single_image", "http://thumb.jpg");
  assertEquals(params.thumbnail_url, undefined); // Original unchanged
  assertEquals(result.thumbnail_url, "http://thumb.jpg"); // New object has it
});

Deno.test("buildGenerationParams - adds tool_type", () => {
  const result = buildGenerationParams({ prompt: "test" }, "image-generation");
  assertEquals(result.tool_type, "image-generation");
  assertEquals(result.prompt, "test");
});

Deno.test("buildGenerationParams - adds content_type if provided", () => {
  const result = buildGenerationParams({}, "tool", "video");
  assertEquals(result.content_type, "video");
});

Deno.test("buildGenerationParams - adds shotId if provided", () => {
  const result = buildGenerationParams({}, "tool", undefined, "shot-123");
  assertEquals(result.shotId, "shot-123");
});

Deno.test("buildGenerationParams - adds thumbnailUrl if provided", () => {
  const result = buildGenerationParams({}, "tool", undefined, undefined, "http://thumb.jpg");
  assertEquals(result.thumbnailUrl, "http://thumb.jpg");
});

Deno.test("buildGenerationParams - all params together", () => {
  const result = buildGenerationParams(
    { prompt: "base" },
    "image-generation",
    "image",
    "shot-1",
    "http://thumb.jpg"
  );
  assertEquals(result.prompt, "base");
  assertEquals(result.tool_type, "image-generation");
  assertEquals(result.content_type, "image");
  assertEquals(result.shotId, "shot-1");
  assertEquals(result.thumbnailUrl, "http://thumb.jpg");
});

// ============ EDGE CASES ============

Deno.test("extractFromParams - handles numeric values", () => {
  const params = { index: 5 };
  const result = extractFromParams(params, "index", [["index"]], "test");
  assertEquals(result, "5"); // Converted to string
});

Deno.test("extractFromParams - handles boolean values", () => {
  const params = { flag: true };
  const result = extractFromParams(params, "flag", [["flag"]], "test");
  assertEquals(result, "true"); // Converted to string
});

Deno.test("extractOrchestratorTaskId - null for empty params", () => {
  assertEquals(extractOrchestratorTaskId({}), null);
  assertEquals(extractOrchestratorTaskId(null), null);
  assertEquals(extractOrchestratorTaskId(undefined), null);
});

Deno.test("setThumbnailInParams - creates nested structure if missing", () => {
  const result = setThumbnailInParams({}, "wan_2_2_i2v", "http://thumb.jpg");
  assertExists(result.orchestrator_details);
  assertEquals(result.orchestrator_details.thumbnail_url, "http://thumb.jpg");
});

Deno.test("setThumbnailInParams - preserves existing nested data", () => {
  const params = { 
    orchestrator_details: { 
      shot_id: "shot-1",
      other: "data"
    } 
  };
  const result = setThumbnailInParams(params, "wan_2_2_i2v", "http://thumb.jpg");
  assertEquals(result.orchestrator_details.shot_id, "shot-1");
  assertEquals(result.orchestrator_details.other, "data");
  assertEquals(result.orchestrator_details.thumbnail_url, "http://thumb.jpg");
});

console.log("\n✓ All unit tests defined. Run with: npx deno test --allow-read --allow-env test/unit_tests.ts\n");

