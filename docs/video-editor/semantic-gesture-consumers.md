# Semantic gesture consumer inventory

App continuation E-GESTURE-CONSUMERS-008 starts at `c8bbbe0b9fee3fa5bd79e42c1741abe67ddca76d`.
Producer evidence is Astrid `aab6a14864da6a54345fe4c2fd7e1aa69a00f755` (including `32911db`),
`astrid/sdk/timeline/gesture_producers.py`, its registered command handlers, and the
80 producer tests identified in D's source handoff. These are App wire adaptation
facts; installed Runtime execution, journal and card acceptance remain pending.

All converted slices use `ApplyEditOptions.editCommands` → `useTimelineCommit` →
`commitData` → the existing persistence scheduler/provider/generated `/commit` client.
The authored base and complete source expectation are captured before editing.
`created` is captured once, including collision resolution, and survives exact retries.
No registry snapshot is placed inside an OpCall.

| Original census row | Current consumer and command | Exact bounds and evidence |
| --- | --- | --- |
| W45 split | `clip-editing/useClipSplitting.ts`: selected, at-time and bulk → `timeline.split` | Literal independent parent clip, frame-aligned interior point, full qualified `parent/clip:<id>::` tagged expectation. Stable `<source>-01` child (next free suffix), explicitly carried in `created`. Tied/legacy-tied, grouped, animated, music-carrier, hold+range, ambiguous and subframe cases refuse the whole batch. `useSemanticGestures.integration.test.tsx` exercises all three controls, mixed refusal, collision and byte-identical retry. |
| W48 track structure, supported slice | `useTimelineTrackManagement.handleRemoveTrack` → `timeline.remove` | Exactly one empty parent track, full authored row expectation (including unknown/null data). Existing last-kind and protected-placement guards remain. Occupied tracks, including zero-output music carriers, refuse; no cascaded clip deletion. Ordinary add/within-kind reorder are covered by 009 below; occupied removal remains unsupported. |
| W50 clear unused, supported slice | `handleClearUnusedTracks` → one `timeline.remove` per selected empty track in one commit | Existing default/last-kind/protected-track retention remains. Exact authored occupancy is rechecked for every candidate before any mutation; music carriers cannot be silently removed. No general track-clear operation is invented. |
| W69 mounted tools, added supported slice | `createTimelineCommands.addClip({assetId, afterClipId})` → `timeline.add` | Same existing source asset, same parent track, last action in its row, span at least the UI's 0.05s minimum, frame-aligned placement. Full source expectation, explicit child `created`, no acquisition or ripple. Tied/ambiguous source refuses. Generation/prepared-media insertion and row ripple keep their existing fallback. |

E-TRACK-CONSUMERS-009 starts at App `a41028ae489a251024d44751af8816ffc3c90205`
and consumes exact D008 `a42a3464c3a6101f6196c496b05f51dd0ca88882`:
`commands.py` track guards/add/set/reorder, `checkout.py` registry and `rebase.py`
identity rewriting. Current generated App `EditCommand` represents these commands;
no producer/generated source or metadata was changed.

| Original census row | 009 supported consumer | Exact bounds and evidence |
| --- | --- | --- |
| W48 ordinary add | `handleAddTrack` → one `timeline.add` | Allocate once from live authored parent tracks using existing defaults; complete row, exact `parent/track:<id>` selector, same `created` reservation and tagged whole-row absence. Visual/audio and byte-identical unavailable-ack retry are exercised. |
| W48 within-kind reorder | `handleMoveTrack` → one `timeline.reorder` | Full unique parent-owner permutation including interleaved other-kind tracks; exact `expected_order` and qualified tagged `track_order` expectation. Same/missing target is a no-op. Cross-kind drag retains existing fallback behavior. |
| W49 properties | `handleTrackPopoverChange` → one `timeline.set` | Explicit label/role/scale/fit/opacity/volume/muted/blendMode values and optional-field clears; qualified per-path tagged prior values. Safe direct `app.<key>` edits preserve omitted siblings, null and ordinary objects; undefined explicitly clears. Required-label clear, structural/invalid values, dotted app keys, prototype keys and the editor's scale migration marker stay fallback. No full-row set. |
| W51 mute-all | `useTimelineOps.setAllTracksMuted` → `apply` → one command batch | Existing patch validation/compiler/transaction: one `timeline.set` per current audio track, including Source lanes, exact prior `muted` state; non-audio and unrelated data preserved. No-audio no-op and whole-timeline refusal covered. Patch track.update supports only compiler-matched merge label/role/muted fields; unsupported mixed batches remain wholly fallback. |

`useSemanticGestures.integration.test.tsx` → **D008 source-backed track consumers**
records actual generated `/commit` requests, not inferred diffs. Supported UI track
mutations pass exact authored rows through a `tracks` mutation at the existing
`applyEdit`/`commitData` boundary, retaining config validation, persisted name and
opaque app siblings. Invalid unknown top-level track keys are refused before any
transaction; validation is unchanged. The existing local scale marker is still
materialized by the editor; it is not added to OpCalls as a metadata workaround.
These are source/fixture bounds, not Runtime operation execution or inverse proof.

Earlier supported property/clear, delete, ordinary move, existing-track move,
right-resize, hold-end choices, existing-track detach, patch/proposal and mounted-tool
slices remain. Their exact wire tests are retained. No whole-row conversion is inferred
from a new supported slice. The original census was **69 rows: 24 converted supported
slices, 44 fallback rows, one local recovery action**. It is historical; this increment
does not declare all 44 fallback rows complete or claim a new zero-fallback total.

Remaining original fallback criteria:

- W01–W05, W61: shot/occurrence metadata, graph editing and independent duplication
  need exact recorded owner/revision/allocated-child contracts and App occurrence
  projection. Parent clip identities cannot stand in for occurrence selection.
- W06–W08, W60: history/undo/checkpoint and recovery snapshots need accepted
  publication-aware revert/suffix identity; existing snapshot compatibility remains.
- W09–W10, W46–W47, W56–W58: project-media registration/insertion/swap and generation
  duplication/ripple require exact catalog revision, acquired asset, owner/track,
  duration and compound movement contracts. D's existing-source add does not supply them.
- W12–W15, W20, W26–W32, W40, W42–W44: catalog composites, snapshots/mixed patches,
  App keyframes/effects/shader/transition/text/transform, general tied/group/left/media
  resize, overlap and repair composites still lack matching lossless command payloads.
- W35, remaining W48/W49/W52–W54: 012 converts the bounded single literal parent
  clip move into a new appended lane through `applyResolvedClipMove` and the no-plan
  `createTrackAndMoveClip` append control. One captured command list adds the complete
  authored track with qualified absent guard and stable `created`, nudges only an
  exact nonzero frame delta, then sets the track against its original expectation.
  Source/Output role, planner start, selection and one existing transaction boundary
  are retained. The complete local edit is materialized together; unavailable/refused
  saves retain both lane and clip as one unsaved draft, and retries reuse exact bytes.
  Tied/group/multi-clip, animated/carrier, subframe or mismatched live-source moves,
  top insertion in the no-plan control, new-track detach, cross-kind drag, unsupported
  property patches, occupied-track removal and pinned-group structure remain fallback.
  Focused hook/generated-client wire fixtures establish App adaptation, not installed
  Runtime execution or canonical inverse proof. 009 and 012 supply only these bounded
  slices; no whole-row completion or revised aggregate fallback count is inferred.
- W62 and remaining W69: embedded/non-Runtime providers and unsupported tool edits
  retain their existing contracts and compatibility paths. W59 remains local recovery.

## Contract and preservation boundaries

008 selected Runtime `f41a2624de894cecb00992bb14bd6bdb6f5beca0` reports generated server/TS
metadata `sha256:cd87ac6ee5d4d2ee1723b0eec9fe19145136a0daef4fffa06c174a4df5f6f6cd`.
App metadata remains `sha256:098c1484979c2c3ee4086b48f5ebefefdfb31e5a6905d51839faf697424af95f`;
the historical handshake assertion remains `sha256:2170992517c98545d573222eef144580093e879fb3094b5bcb3f240008b5bb21`.
The exact f41 generator refuses D's current extended OpCall schema: “OpCall validator
projection needs an explicit update”. Its generated EditCommand accepts only the old
`op/select/args/version/resolved` shape. App's digest also equals the byte-framed f41
contract inputs plus D's current schema, but that byte audit does not make the old
Runtime validator accept `expect/created`. A/Runtime owns producer reconciliation and
artifact admission; no digest/client/generated artifact was changed by this increment.

`contract-source.test.ts` compares the actual selected metadata and runs its real
read-only generator check when `RUNTIME_CONTRACT_SOURCE` and `ASTRID_OPCALL_SCHEMA`
explicitly select admitted inputs. It preserves the producer mismatch as a red and
skips without that explicit source admission.

The untouched B/E historical test reads an outgoing compatibility publication from
already-stripped historical configs/registries. A reload cannot recreate those lost
values. The separate `current writer accepted reload preservation boundary` test
starts from the same synthetic base, serializes current loaded writer state, saves
through the supported compatibility path and reloads the exact accepted immutable
revision. It checks **69 repaired values / 33 sentinels / 16 absences**, retaining the
historical child absence expectations. This establishes current App fixture persistence;
it does not replace historical real-Runtime proof or justify merging opaque registry
snapshots into commands. The historical input, assertions and old logs remain intact.
