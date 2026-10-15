import { test } from "node:test";
import assert from "node:assert/strict";
import { deepMergeTheme, mergeGeneration, resolveTheme } from "../src/resolveTheme.js";
test("deepMergeTheme merges nested visual.canvas key-by-key", () => {
    const base = { visual: { canvas: { width: 1920, height: 1080, fps: 30 } } };
    const overlay = { visual: { canvas: { fps: 60 } } };
    const out = deepMergeTheme(base, overlay);
    assert.equal(out.visual.canvas.width, 1920);
    assert.equal(out.visual.canvas.fps, 60);
});
test("deepMergeTheme replaces lists wholesale", () => {
    const base = { generation: { references: [{ id: "a" }] } };
    const overlay = { generation: { references: [{ id: "b" }] } };
    const out = deepMergeTheme(base, overlay);
    assert.deepEqual(out.generation.references, [{ id: "b" }]);
});
test("mergeGeneration: per-clip wins on conflict", () => {
    const out = mergeGeneration({ image_model: "a", aspect: "16:9" }, { image_model: "b" });
    assert.equal(out.image_model, "b");
    assert.equal(out.aspect, "16:9");
});
test("resolveTheme returns base when no overrides", () => {
    const registry = { "2rp": { id: "2rp", visual: { canvas: { fps: 30 } } } };
    const out = resolveTheme({ theme: "2rp" }, registry);
    assert.equal(out.visual.canvas.fps, 30);
});
test("resolveTheme deep-merges overrides", () => {
    const registry = { "2rp": { id: "2rp", visual: { canvas: { width: 1920, fps: 30 } } } };
    const out = resolveTheme({ theme: "2rp", theme_overrides: { visual: { canvas: { fps: 60 } } } }, registry);
    assert.equal(out.visual.canvas.width, 1920);
    assert.equal(out.visual.canvas.fps, 60);
});
test("resolveTheme throws when theme missing", () => {
    assert.throws(() => resolveTheme({ theme: "missing" }, {}));
});
test("TimelineConfig type accepts persisted no-theme timelines", () => {
    const out = { clips: [], tracks: [] };
    assert.deepEqual(out, { clips: [], tracks: [] });
});
test("TimelineClip type carries named keyframe easing without adding defaults", () => {
    const keyframes = [
        { time: 0, value: 0, interpolation: "linear", easing: "in" },
        { time: 1, value: 1, interpolation: "hold", easing: "linear" },
        { time: 2, value: 2, interpolation: "linear" },
    ];
    const clip = {
        id: "clip-keyframe-easing",
        at: 0,
        track: "V1",
        keyframes: { opacity: keyframes },
    };
    const roundTripped = JSON.parse(JSON.stringify(clip));
    const roundTrippedKeyframes = roundTripped.keyframes?.opacity;
    assert.deepEqual(roundTripped, clip);
    assert.ok(roundTrippedKeyframes);
    assert.equal(roundTrippedKeyframes[0].easing, "in");
    assert.equal(roundTrippedKeyframes[1].easing, "linear");
    assert.equal(Object.hasOwn(roundTrippedKeyframes[2], "easing"), false);
});
test("TimelineClip type carries declared clip modifiers", () => {
    const modifier = {
        id: "modifier-instance-1",
        element: "com.example.modifier.vignette",
        params: { strength: 0.5, futureParameter: { retained: true } },
    };
    const clip = {
        id: "clip-1",
        at: 0,
        track: "V1",
        modifiers: [modifier],
    };
    assert.deepEqual(clip.modifiers, [modifier]);
});
// Runtime validation of the document shape lives in the Python jsonschema
// validator (see test_validate.py). In TypeScript, TimelineConfig is a type
// derived from the canonical JSON Schema — this is a compile-time shape check
// that open generation_defaults objects are permitted.
test("TimelineConfig type permits open generation_defaults objects", () => {
    const payload = {
        theme: "2rp",
        clips: [],
        tracks: [],
        generation_defaults: {
            model: "sequence-v1",
            image: { quality: "high", provider: "reigh" },
            provider_settings: { seed: 1234, flags: ["keep", "open"] },
        },
    };
    assert.deepEqual(payload.generation_defaults, payload.generation_defaults);
});
test("resolveTheme throws when theme is absent or empty", () => {
    assert.throws(() => resolveTheme({}, {}), /Timeline\.theme must be a non-empty slug/);
    assert.throws(() => resolveTheme({ theme: "" }, {}), /Timeline\.theme must be a non-empty slug/);
});
//# sourceMappingURL=resolveTheme.test.js.map