"""anim_py.网络：本机服务直连不走代理。Windows 实机设了 HTTP_PROXY、没设 NO_PROXY 时，voice backends 探本机 TTS 服务误报 502、超时。"""
import http.server
import socket
import threading
import urllib.error
import urllib.request

import pytest

from anim_py.网络 import 打开, 是本机


def test_是本机():
    for u in ['http://127.0.0.1:47900', 'http://127.8.0.1/', 'http://localhost:9880/docs', 'http://LOCALHOST/', 'http://a.localhost/', 'http://[::1]:80/']:
        assert 是本机(u), u
    for u in ['https://www.modelscope.cn/api', 'http://192.168.1.2:9880', 'http://localhost.example.com/', 'http://[::2]/']:
        assert not 是本机(u), u


@pytest.fixture
def 本机服务():
    class 答(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')

        def log_message(self, *a):
            pass

    s = http.server.HTTPServer(('127.0.0.1', 0), 答)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{s.server_port}'
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


def test_设了代理也直连本机(本机服务, 坏代理):
    with pytest.raises(urllib.error.URLError):  # 不绕开时：请求交给了不存在的代理
        urllib.request.build_opener().open(本机服务 + '/', timeout=3)
    assert 打开(本机服务 + '/', timeout=3).read() == b'ok'
    assert 打开(urllib.request.Request(本机服务 + '/v1/models'), timeout=3).read() == b'ok'
