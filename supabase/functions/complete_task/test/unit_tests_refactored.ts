/**
 * Unit tests for REFACTORED complete_task modules
 * 
 * This file imports from the actual refactored modules to validate correctness.
 * 
 * Usage:
 *   npx deno test --no-check --allow-read --allow-env test/unit_tests_refactored.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ============ IMPORTS FROM REFACTORED MODULES ============
import { 
  getContentType,
  extractFromParams,
  extractOrchestratorTaskId,
  extractOrchestratorRunId,
  extractBasedOn,
  extractShotAndPosition,
  setThumbnailInParams,
  buildGenerationParams,
  THUMBNAIL_PATH_CONFIG,
} from '../params.ts';

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
  assertEquals(extractFromParams({ field: "value" }, "field", [["field"]], "test"), "value");
});

Deno.test("extractFromParams - nested field", () => {
  const params = { level1: { level2: { field: "deep_value" } } };
  assertEquals(extractFromParams(params, "field", [["level1", "level2", "field"]], "test"), "deep_value");
});

Deno.test("extractFromParams - first match wins", () => {
  const params = { path1: { field: "first" }, path2: { field: "second" } };
  assertEquals(extractFromParams(params, "field", [["path1", "field"], ["path2", "field"]], "test"), "first");
});

Deno.test("extractFromParams - fallback to second path", () => {
  const params = { path2: { field: "second" } };
  assertEquals(extractFromParams(params, "field", [["path1", "field"], ["path2", "field"]], "test"), "second");
});

Deno.test("extractFromParams - null when not found", () => {
  assertEquals(extractFromParams({ other: "value" }, "field", [["field"]], "test"), null);
});

Deno.test("extractFromParams - handles null params", () => {
  assertEquals(extractFromParams(null, "field", [["field"]], "test"), null);
});

Deno.test("extractOrchestratorTaskId - from orchestrator_details", () => {
  assertEquals(extractOrchestratorTaskId({ orchestrator_details: { orchestrator_task_id: "task-123" } }), "task-123");
});

Deno.test("extractOrchestratorTaskId - from top level", () => {
  assertEquals(extractOrchestratorTaskId({ orchestrator_task_id: "task-789" }), "task-789");
});

Deno.test("extractOrchestratorTaskId - from ref field", () => {
  assertEquals(extractOrchestratorTaskId({ orchestrator_task_id_ref: "task-ref" }), "task-ref");
});

Deno.test("extractOrchestratorRunId - from orchestrator_run_id", () => {
  assertEquals(extractOrchestratorRunId({ orchestrator_run_id: "run-1" }), "run-1");
});

Deno.test("extractOrchestratorRunId - from run_id", () => {
  assertEquals(extractOrchestratorRunId({ run_id: "run-2" }), "run-2");
});

Deno.test("extractOrchestratorRunId - from orchestrator_details", () => {
  assertEquals(extractOrchestratorRunId({ orchestrator_details: { run_id: "run-3" } }), "run-3");
});

Deno.test("extractBasedOn - direct field", () => {
  assertEquals(extractBasedOn({ based_on: "gen-123" }), "gen-123");
});

Deno.test("extractBasedOn - from orchestrator_details", () => {
  assertEquals(extractBasedOn({ orchestrator_details: { based_on: "gen-456" } }), "gen-456");
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
  const result = extractShotAndPosition({ shot_id: "shot-3", add_in_position: true });
  assertEquals(result.addInPosition, true);
});

Deno.test("extractShotAndPosition - addInPosition as string 'true'", () => {
  const params = { shot_id: "shot-4", add_in_position: "true" };
  const result = extractShotAndPosition(params);
  assertEquals(result.addInPosition, true);
});

Deno.test("setThumbnailInParams - default path", () => {
  const result = setThumbnailInParams({ prompt: "test" }, "unknown_type", "http://thumb.jpg");
  assertEquals(result.thumbnail_url, "http://thumb.jpg");
});

Deno.test("setThumbnailInParams - single_image path", () => {
  const result = setThumbnailInParams({ prompt: "test" }, "single_image", "http://thumb.jpg");
  assertEquals(result.thumbnail_url, "http://thumb.jpg");
});

Deno.test("setThumbnailInParams - wan_2_2_i2v nested path", () => {
  const result = setThumbnailInParams({ prompt: "test" }, "wan_2_2_i2v", "http://thumb.jpg");
  assertEquals(result.orchestrator_details?.thumbnail_url, "http://thumb.jpg");
});

Deno.test("setThumbnailInParams - travel_stitch with extras", () => {
  const result = setThumbnailInParams({}, "travel_stitch", "http://thumb.jpg");
  assertEquals(result.full_orchestrator_payload?.thumbnail_url, "http://thumb.jpg");
  assertEquals(result.full_orchestrator_payload?.accelerated, false);
});

Deno.test("setThumbnailInParams - does not mutate original", () => {
  const params = { prompt: "test" };
  const result = setThumbnailInParams(params, "single_image", "http://thumb.jpg");
  assertEquals((params as any).thumbnail_url, undefined);
  assertEquals(result.thumbnail_url, "http://thumb.jpg");
});

Deno.test("buildGenerationParams - adds tool_type", () => {
  const result = buildGenerationParams({ prompt: "test" }, "image-generation");
  assertEquals(result.tool_type, "image-generation");
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
  const result = buildGenerationParams({ prompt: "base" }, "image-generation", "image", "shot-1", "http://thumb.jpg");
  assertEquals(result.prompt, "base");
  assertEquals(result.tool_type, "image-generation");
  assertEquals(result.content_type, "image");
  assertEquals(result.shotId, "shot-1");
  assertEquals(result.thumbnailUrl, "http://thumb.jpg");
});

// Edge cases
Deno.test("extractFromParams - handles numeric values", () => {
  const params = { index: 5 };
  assertEquals(extractFromParams(params, "index", [["index"]], "test"), "5");
});

Deno.test("extractFromParams - handles boolean values", () => {
  const params = { flag: true };
  assertEquals(extractFromParams(params, "flag", [["flag"]], "test"), "true");
});

Deno.test("extractOrchestratorTaskId - null for empty params", () => {
  assertEquals(extractOrchestratorTaskId({}), null);
  assertEquals(extractOrchestratorTaskId(null), null);
  assertEquals(extractOrchestratorTaskId(undefined), null);
});

Deno.test("THUMBNAIL_PATH_CONFIG - has expected keys", () => {
  assertExists(THUMBNAIL_PATH_CONFIG['travel_stitch']);
  assertExists(THUMBNAIL_PATH_CONFIG['wan_2_2_i2v']);
  assertExists(THUMBNAIL_PATH_CONFIG['single_image']);
  assertExists(THUMBNAIL_PATH_CONFIG['default']);
});

Deno.test("setThumbnailInParams - creates nested structure if missing", () => {
  const result = setThumbnailInParams({}, "wan_2_2_i2v", "http://thumb.jpg");
  assertExists(result.orchestrator_details);
  assertEquals(result.orchestrator_details.thumbnail_url, "http://thumb.jpg");
});

console.log("\n✓ Running refactored unit tests against actual modules\n");

