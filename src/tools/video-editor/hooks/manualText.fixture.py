"""App-owned caller wire proof against exact ASTRID_CHECKOUT, synthetic port only."""
# ruff: noqa: E402 -- import only after binding the task-selected immutable SDK.
import copy
import json
import os
import sys
from pathlib import Path

sdk = Path(os.environ['ASTRID_CHECKOUT'])
expected = Path('/Users/peteromalley/Documents/reigh-workspace/Astrid/.otto/clones/timeline-r4-portfolio-20261015-Astrid.git/.otto/worktrees/timeline-r4-E-W30-MANUAL-TEXT-CONSUMER-001-SDK-E30-READER-001')
assert sdk.resolve() == expected.resolve(), 'W30 must use its immutable e30 reader'
import subprocess
assert subprocess.check_output(['git', '-C', str(sdk), 'rev-parse', 'HEAD'], text=True).strip() == 'e30f8d27a436299852c536f36bc93abc06d90366'
sys.path[:0] = [str(sdk), str(sdk / 'tests/sdk')]
from test_timeline_commit import Port
from astrid.core.timeline import scene_answers
from astrid.sdk.timeline.checkout import Checkout
from astrid.sdk.timeline.commit import RuntimeCommitService
from astrid.sdk.timeline.identity import retain_cut_reservations
from astrid.sdk.timeline import commands

# Same explicit synthetic scene boundary as the sealed SDK proof. No renderer,
# real Runtime store, source patch, or producer test invocation.
class Answers:
    def query_scene(self, *, revision_digest, scene, frames):
        return [dict(frame=frame, coverage='COVERED', content='CONTENT', findings=[], layers=[]) for frame in frames]
scene_answers._client = lambda: Answers()
Checkout._native_outline_integrity = lambda *args: None

from astrid.core.element import catalog
from astrid.sdk import invocation
element = catalog._registry().get('effects', 'am-type', pack_id='astrid_motion')
# Same explicit synthetic resource boundary as the D producer tests. The real
# declaration/schema/SDK service/receipt/inverse are exercised; no installed claim.
invocation._admitted_timeline_element_resources = lambda config, **kw: {
    row['id']: {'declaration': {'pack_root': str(element.component.parent), 'resources': [
        {'kind': 'implementation', 'path': element.component.name}]}} for row in config['clips']}
if '--reference' in sys.argv:
    descriptor = catalog._element_descriptor(element)
    print(json.dumps({key: descriptor[key] for key in ('id', 'kind', 'packId', 'revision')}))
    sys.exit(0)
value = json.load(sys.stdin)
config = copy.deepcopy(value['config'])
fixture = json.loads((sdk / 'tests/fixtures/timeline_editing/tiny_publishable.json').read_text())
# Canonical parent input excludes display-only occurrence rows. The fixture's
# existing immutable shot/occurrence closure remains intact.
clips = [clip for clip in config.pop('clips') if not clip.get('app', {}).get('canonical')]
fixture['parent'] = dict(config=config, clips=clips, registry=value['registry'])
retain_cut_reservations(fixture)
tl = Checkout(fixture)
tl.resolve()
before = copy.deepcopy(tl.document())
document = before
results = []
replays = []
ports = []
seen = {}

class CallerService(RuntimeCommitService):
    @staticmethod
    def _load_revision(port, request, revision):
        # The acceptance double provides this exact immutable synthetic closure.
        return copy.deepcopy(document)

class CallerPort(Port):
    def accept(self, prepared):
        response = super().accept(prepared)
        result = response['stored_result']
        if result['status'] == 'accepted':
            result.update(accepted_revision_id='parent-r' + str(len(results) + 2),
                          accepted_publication_id='pub-parent-r' + str(len(results) + 2))
        self.saved['result'] = copy.deepcopy(result)
        return response

service = CallerService()
for original in value['requests']:
    request = copy.deepcopy(original)
    if value.get('stale'):
        request['change']['commands'][-1]['expect']['text'] = {'state': 'present', 'value': {'content': 'conflicting late member'}}
    if request['request_id'] in seen:
        old_request, old_result = seen[request['request_id']]
        assert request == old_request, 'lost-response retry changed the captured request'
        results_for_wire = copy.deepcopy(old_result)
        replays.append(True)
        continue
    port = CallerPort(request)
    port.current = request['base_revision_id']
    result = service.commit(request, port)
    if value.get('stale'):
        assert result['status'] == 'refused', result
        assert 'same-property' in result['error']['message'], result
        assert not port.accepts
        assert document == before
        results_for_wire = result
        break
    assert result['status'] in {'accepted', 'no_change'}, result
    assert service.commit(request, port) == result, 'exact replay changed receipt'
    assert len(port.accepts) == 1
    document = copy.deepcopy(result['canonical_document'])
    assert Checkout(copy.deepcopy(document)).document() == document, 'fresh SDK readback changed authored state'
    before_ids = {sid for sid in commands.entity_states(Checkout(before)) if '/clip:' in sid}
    after_ids = {sid for sid in commands.entity_states(Checkout(document)) if '/clip:' in sid}
    if request['change']['commands'][0]['op'] == 'clip.set-text':
        assert after_ids == before_ids, 'style edit changed clip identities'
    results.append(result)
    ports.append(len(port.accepts))
    seen[request['request_id']] = (copy.deepcopy(request), copy.deepcopy(result))
    results_for_wire = result

if len(results) > 1:
    assert results[1]['canonical_document'] == before, 'App history Undo changed authored state'
if len(results) > 2:
    assert results[2]['canonical_document'] == results[0]['canonical_document'], 'App history Redo changed authored state'
print(json.dumps(dict(readback=document, before=before, results=results, result=results_for_wire, replay=replays,
                     accept_counts=ports, source=str(sdk))))
