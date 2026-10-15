"""Focused canonical ClipKeyframe easing schema and type assertions."""

from __future__ import annotations

from copy import deepcopy
from typing import NotRequired, get_type_hints
import unittest

import jsonschema

from banodoco_timeline_schema import ClipKeyframe, TimelineClip, validate_timeline


class ClipKeyframeEasingSchemaTest(unittest.TestCase):
    def test_absent_easing_stays_absent_and_legacy_interpolation_is_preserved(self) -> None:
        timeline = {
            "clips": [{
                "id": "clip-legacy",
                "at": 0,
                "track": "V1",
                "keyframes": {
                    "opacity": [{"time": 0, "value": 0, "interpolation": "linear"}],
                },
            }],
            "tracks": [{"id": "V1", "kind": "visual", "label": "V1"}],
        }
        original = deepcopy(timeline)

        validate_timeline(timeline)

        self.assertEqual(timeline, original)
        keyframe = timeline["clips"][0]["keyframes"]["opacity"][0]
        self.assertNotIn("easing", keyframe)
        self.assertEqual(keyframe["interpolation"], "linear")

    def test_named_and_explicit_linear_easing_validate_and_round_trip(self) -> None:
        timeline = {
            "clips": [{
                "id": "clip-eased",
                "at": 0,
                "track": "V1",
                "params": {"easing": "linear", "extension": {"retained": True}},
                "keyframes": {
                    "opacity": [
                        {"time": 0, "value": 0, "interpolation": "linear", "easing": "in"},
                        {"time": 1, "value": 1, "interpolation": "hold", "easing": "linear"},
                    ],
                },
                "modifiers": [{
                    "id": "modifier-1",
                    "element": "com.example.modifier.vignette",
                    "params": {"strength": 0.5},
                }],
            }],
            "tracks": [{"id": "V1", "kind": "visual", "label": "V1"}],
        }
        original = deepcopy(timeline)

        validate_timeline(timeline)

        self.assertEqual(timeline, original)
        self.assertEqual(timeline["clips"][0]["keyframes"]["opacity"][0]["easing"], "in")
        self.assertEqual(timeline["clips"][0]["keyframes"]["opacity"][1]["easing"], "linear")
        self.assertEqual(get_type_hints(TimelineClip)["keyframes"], dict[str, list[ClipKeyframe]])
        self.assertEqual(get_type_hints(ClipKeyframe, include_extras=True)["easing"], NotRequired[str])

    def test_invalid_easing_type_and_changed_interpolation_names_are_rejected(self) -> None:
        invalid = [
            {"time": 0, "value": 0, "interpolation": "linear", "easing": 3},
            {"time": 0, "value": 0, "interpolation": "in"},
        ]
        for keyframe in invalid:
            with self.subTest(keyframe=keyframe):
                with self.assertRaises(jsonschema.ValidationError):
                    validate_timeline({
                        "clips": [{
                            "id": "clip-invalid",
                            "at": 0,
                            "track": "V1",
                            "keyframes": {"opacity": [keyframe]},
                        }],
                        "tracks": [{"id": "V1", "kind": "visual", "label": "V1"}],
                    })


if __name__ == "__main__":
    unittest.main()
