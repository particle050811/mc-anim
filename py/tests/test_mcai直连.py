"""sourcing/mcai/mcai.py 连游戏接口（127.0.0.1）不走代理：设了 HTTP_PROXY、没设 NO_PROXY 时原来会交给代理，游戏开着也报连不上。
mcai.py 只用标准库、不依赖 anim_py，所以单独测；按路径载入，import 时不碰游戏目录。"""
import http.server
import importlib.util
import json
import socket
import threading
from pathlib import Path

import pytest

_路径 = Path(__file__).resolve().parents[2] / 'sourcing' / 'mcai' / 'mcai.py'


@pytest.fixture
def mcai(monkeypatch):
    monkeypatch.delenv('MCAI_GAME', raising=False)
    spec = importlib.util.spec_from_file_location('mcai_测', _路径)
    assert spec and spec.loader
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture
def 游戏接口():
    class 答(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers['Content-Length']))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'path': self.path}).encode())

        def log_message(self, format, *args):  # noqa: A002  照基类的签名
            pass

    s = http.server.HTTPServer(('127.0.0.1', 0), 答)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield s.server_port
    s.shutdown()


@pytest.fixture
def 坏代理(monkeypatch):
    with socket.socket() as k:  # 拿一个没人听的端口当代理
        k.bind(('127.0.0.1', 0))
        端口 = k.getsockname()[1]
    for k in ['NO_PROXY', 'no_proxy']:
        monkeypatch.delenv(k, raising=False)
    for k in ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']:
        monkeypatch.setenv(k, f'http://127.0.0.1:{端口}')


def test_设了代理也直连游戏接口(mcai, 游戏接口, 坏代理):
    assert mcai.call('status', port=游戏接口, timeout=3) == {'ok': True, 'path': '/status'}
