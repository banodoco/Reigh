"""Synthetic canary only; copied to a private run-owned bootstrap by the test."""
import errno
import json
import os
from pathlib import Path
import signal
import socket
import stat
import subprocess
import sys

config = json.loads(Path(__file__).with_name('config.json').read_text())
Path(config['scratch'], 'entry-started').write_text('synthetic')
if '--agent-profile-file' in sys.argv:
    Path(config['scratch'], 'lookup-ran').write_text('synthetic')
    print(Path(__file__).with_name('prompt.md'))
    sys.exit(0)


def attempt(call):
    try:
        call()
        return 'allowed'
    except OSError as error:
        return error.errno


def probe():
    descriptors = []
    fd_scan_bound = os.sysconf('SC_OPEN_MAX')
    for fd in range(fd_scan_bound):
        try:
            mode = os.fstat(fd).st_mode
            descriptors.append({'fd': fd, 'pipe': stat.S_ISFIFO(mode), 'socket': stat.S_ISSOCK(mode)})
        except OSError:
            pass
    def connect(port):
        with socket.socket() as client:
            client.settimeout(0.3)
            client.connect(('127.0.0.1', port))
    return {
        'pid': os.getpid(), 'sid': os.getsid(0), 'pgid': os.getpgid(0),
        'inside': attempt(lambda: Path(config['inside']).read_text()),
        'outside_read': attempt(lambda: Path(config['outside']).read_text()),
        'outside_write': attempt(lambda: Path(config['outside_write']).write_text('synthetic')),
        'private_write': attempt(lambda: Path(config['scratch'], str(os.getpid())).write_text('synthetic')),
        'network': attempt(lambda: connect(config['port'])),
        'other_network': attempt(lambda: connect(config['other_port'])),
        'env_safe': set(os.environ) <= {'PATH', 'HOME', 'TMPDIR', 'PYTHONNOUSERSITE', 'PYTHONDONTWRITEBYTECODE', 'LANG', 'LC_ALL', '__CF_USER_TEXT_ENCODING'},
        'secret_absent': 'synthetic-DO-NOT-LOG-value' not in os.environ.values(),
        'home_private': os.environ.get('HOME') == config['home'],
        'temp_private': os.environ.get('TMPDIR') == config['temp'],
        'descriptors': descriptors, 'fd_scan_bound': fd_scan_bound,
    }

if '--descendant' in sys.argv:
    print(json.dumps(probe()), flush=True)
    sys.stdin.read()  # Parent owns this private pipe. EOF releases this canary.
    sys.exit(0)

initial = probe()  # Snapshot before this canary creates its own private channels.
child = subprocess.Popen([sys.executable, __file__, '--descendant'], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
                         close_fds=True)
descendant = json.loads(child.stdout.readline())
report = {'parent': initial, 'descendant': descendant}
Path(config['scratch'], 'pids.json').write_text(json.dumps([os.getpid(), child.pid]))


def cleanup(*_):
    child.stdin.close()
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
    sys.exit(0)

signal.signal(signal.SIGTERM, cleanup)
if '--mode=acp' not in sys.argv:
    print(json.dumps(report), flush=True)
    sys.stdin.read()
    cleanup()

for line in sys.stdin:
    request = json.loads(line)
    if request.get('method') == 'test/malformed':
        print('malformed', flush=True)
        continue
    if request.get('method') == 'test/error':
        sys.stdout.close()
        os.close(1)
        continue
    if 'id' in request:
        result = report if request['method'] in ('initialize', 'session/new') else {}
        print(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'result': result}), flush=True)
cleanup()
