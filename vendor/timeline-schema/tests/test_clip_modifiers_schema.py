"""Focused TimelineClip modifier schema and type projection assertions."""

from __future__ import annotations

from copy import deepcopy
from typing import get_type_hints
import unittest

import jsonschema

from banodoco_timeline_schema import TimelineClip, TimelineClipModifier, validate_timeline


class ClipModifiersSchemaTest(unittest.TestCase):
    def test_legacy_clips_without_modifiers_validate_without_rewriting(self) -> None:
        legacy = {
            "clips": [
                {
                    "id": "clip-explicit-linear",
                    "at": 0,
                    "track": "V1",
                    "params": {"easing": "linear", "extension": {"open": True}},
                },
                {"id": "clip-absent-easing", "at": 1, "track": "V1"},
            ],
            "tracks": [{"id": "V1", "kind": "visual", "label": "V1"}],
        }
        original = deepcopy(legacy)

        validate_timeline(legacy)

        self.assertEqual(legacy, original)
        self.assertNotIn("modifiers", legacy["clips"][0])
        self.assertNotIn("modifiers", legacy["clips"][1])
        self.assertEqual(legacy["clips"][0]["params"]["easing"], "linear")

    def test_valid_modifier_is_represented_in_python_types(self) -> None:
        modifier: TimelineClipModifier = {
            "id": "modifier-instance-1",
            "element": "com.example.modifier.vignette",
            "params": {"strength": 0.5, "extension": {"open": True}},
        }
        clip: TimelineClip = {
            "id": "clip-1",
            "at": 0,
            "track": "V1",
            "modifiers": [modifier],
        }

        validate_timeline({
            "clips": [clip],
            "tracks": [{"id": "V1", "kind": "visual", "label": "V1"}],
        })
        self.assertEqual(get_type_hints(TimelineClip)["modifiers"], list[TimelineClipModifier])

    def test_malformed_modifier_shapes_fail_in_jsonschema_validator(self) -> None:
        invalid_modifiers = [
            [{"id": 1, "element": "com.example.modifier.vignette", "params": {}}],
            [{"id": "modifier-1", "element": 3, "params": {}}],
            [{"id": "modifier-1", "element": "com.example.modifier.vignette", "params": []}],
            [{"id": "modifier-1", "element": "com.example.modifier.vignette"}],
        ]

        for modifiers in invalid_modifiers:
            with self.subTest(modifiers=modifiers):
                with self.assertRaises(jsonschema.ValidationError):
                    validate_timeline({
                        "clips": [{
                            "id": "clip-1",
                            "at": 0,
                            "track": "V1",
                            "modifiers": modifiers,
                        }],
                        "tracks": [{"id": "V1", "kind": "visual", "label": "V1"}],
                    })


if __name__ == "__main__":
    unittest.main()
