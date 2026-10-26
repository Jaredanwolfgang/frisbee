"""Local full-stack preview; never use this development key for production."""
import functools
import http.client
import importlib.util
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import threading

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('frisbee_api', ROOT / 'server/app.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
store = api.Store(ROOT / 'data/dev.sqlite3', json.loads((ROOT / 'server/seed.json').read_text()))
preview_port = int(os.getenv('FRISBEE_PREVIEW_PORT', '4175'))
backend = ThreadingHTTPServer(('127.0.0.1', 0), api.make_handler(store, 'frisbee-local-development-key', '/frisbee/', False, f'http://127.0.0.1:{preview_port}'))


class Preview(SimpleHTTPRequestHandler):
    def proxy(self):
        size = int(self.headers.get('Content-Length', 0))
        conn = http.client.HTTPConnection('127.0.0.1', backend.server_port, timeout=25)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {'host', 'connection', 'content-length'}}
        conn.request(self.command, self.path[len('/frisbee'):], self.rfile.read(size) if size else None, headers)
        response = conn.getresponse()
        body = response.read()
        self.send_response(response.status)
        for k, v in response.getheaders():
            if k.lower() not in {'connection', 'server', 'date', 'transfer-encoding', 'content-length'}:
                self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        conn.close()

    def do_GET(self):
        if self.path.startswith('/frisbee/api/'):
            return self.proxy()
        if self.path in {'/', '/frisbee'}:
            self.send_response(302)
            self.send_header('Location', '/frisbee/')
            self.end_headers()
            return
        if self.path.startswith('/frisbee/'):
            self.path = self.path[len('/frisbee'):]
            return super().do_GET()
        self.send_error(404)

    do_POST = do_PUT = do_DELETE = proxy


if __name__ == '__main__':
    thread = threading.Thread(target=backend.serve_forever, daemon=True)
    thread.start()
    frontend = ThreadingHTTPServer(('127.0.0.1', preview_port), functools.partial(Preview, directory=str(ROOT / 'dist')))
    print(f'Local: http://127.0.0.1:{preview_port}/frisbee/', flush=True)
    try:
        frontend.serve_forever()
    finally:
        frontend.server_close()
        backend.shutdown()
        backend.server_close()
