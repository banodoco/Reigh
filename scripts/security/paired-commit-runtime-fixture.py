"""Disposable Runtime HTTP fixture, synthetic acceptance provider only.

Run with an explicit Python 3.11+ -S and frozen Runtime/tests/Astrid grant paths.
The stdin control channel observes actual Runtime state; it adds no HTTP routes.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time

from runtime_protocol.server import RuntimeHandler
from test_timeline_accept import _service, _publication, fixture_provider, http_server, wire

root = Path(sys.argv[1]).resolve()
assert root.is_relative_to(Path(os.environ['TMPDIR']).resolve())
root.mkdir(mode=0o700)
service, project = _service(root)
service.publish_parent_composition(project, 'main', _publication(project), idempotency_key='initial')
other = service.create_project({'slug': 'other', 'name': 'Other'}, idempotency_key='other')['id']
calls = fixture_provider(service, project)
server, thread, _ = http_server(service, root)
reads = []
original_body = RuntimeHandler._body


def observed_body(handler):
    reads.append(handler.path)
    return original_body(handler)


RuntimeHandler._body = observed_body
service.select_project('connector-fixture', project)
_, credential = server.credentials.provision_connector('connector-fixture',
    ['handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'objects:read', 'objects:write'],
    connector_id='fixture-connector', realm_id=service.realm['id'], expires_at=time.time() + 900)
discovery = root / 'discovery.json'
discovery.write_text(json.dumps({'endpoint': f'http://127.0.0.1:{server.server_port}', 'credential_file': str(credential)}))
request = wire(project)
request['asserted_actor']['id'] = 'connector-fixture'
request['source'] = {'via': 'app'}


def snapshot(keys):
    return dict(body_reads=list(reads), provider_calls=list(calls), total_changes=service.store.conn.total_changes,
        store_digest=hashlib.sha256('\n'.join(service.store.conn.iterdump()).encode()).hexdigest(),
        requests={p + ':' + k: service.lookup_request(p, 'main', k) for p in [project, other] for k in keys},
        head=service.head(project, 'main'),
        revisions=[dict(row) for row in service.store.conn.execute('SELECT * FROM parent_composition_revisions ORDER BY rowid')])


try:
    print(json.dumps(dict(project=project, other=other, realm=service.realm['id'], discovery=str(discovery),
        credential=str(credential), request=request, provider='synthetic-fixture-not-a-toolchain-attestation',
        python=dict(executable=sys.executable, version=sys.version, no_site=sys.flags.no_site),
        runtime_module=sys.modules['runtime_protocol.server'].__file__)), flush=True)
    for line in sys.stdin:
        message = json.loads(line)
        if message['command'] == 'stop':
            break
        assert message['command'] == 'snapshot'
        print(json.dumps(snapshot(message.get('keys', []))), flush=True)
finally:
    server.shutdown()
    server.server_close()
    thread.join()
    service.close()
    # Reopen the real SQLite-backed service to prove durability after close.
    from runtime_protocol.service import RuntimeService
    reopened = RuntimeService(root / 'realm')
    try:
        product_modules = {name: dict(path=str(Path(module.__file__).resolve()),
            sha256=hashlib.sha256(Path(module.__file__).read_bytes()).hexdigest())
            for name, module in sys.modules.copy().items()
            if name.split('.')[0] in {'runtime_protocol', 'astrid'} and getattr(module, '__file__', None)}
        (root / 'durable.json').write_text(json.dumps(dict(head=reopened.head(project, 'main'),
            request=reopened.lookup_request(project, 'main', request['request_id']), modules=product_modules), indent=2))
    finally:
        reopened.close()
