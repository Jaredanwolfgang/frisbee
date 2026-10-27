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
# UI checks can use an isolated database without replacing local team records.
preview_db = Path(os.getenv('FRISBEE_PREVIEW_DB', str(ROOT / 'data/dev.sqlite3')))
store = api.Store(preview_db, json.loads((ROOT / 'server/seed.json').read_text()))
stats_store = api.STATS_MODULE.StatsStore(preview_db)
preview_port = int(os.getenv('FRISBEE_PREVIEW_PORT', '4175'))
ai_service = None
if os.getenv('AI_API_KEY'):
    ai_client = api.AI_MODULE.DeepSeekClient(os.environ['AI_API_KEY'], os.getenv('AI_BASE_URL', 'https://api.deepseek.com'), os.getenv('AI_RULES_MODEL', 'deepseek-flash'), os.getenv('AI_TACTIC_MODEL', 'deepseek-v4-pro'))
    ai_service = api.AI_MODULE.AIService(ROOT/'dist/wfdf', ai_client, api.tactic)
backend = ThreadingHTTPServer(('127.0.0.1', 0), api.make_handler(store, 'frisbee-local-development-key', '/frisbee/', False, f'http://127.0.0.1:{preview_port}', ai_service, stats_store))


class Preview(SimpleHTTPRequestHandler):
    def proxy(self):
        size = int(self.headers.get('Content-Length', 0))
        conn = http.client.HTTPConnection('127.0.0.1', backend.server_port, timeout=150)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {'host', 'connection', 'content-length'}}
        conn.request(self.command, self.path[len('/frisbee'):], self.rfile.read(size) if size else None, headers)
        response = conn.getresponse()
        streaming = response.getheader('Content-Type','').startswith('text/event-stream')
        body = None if streaming else response.read()
        self.send_response(response.status)
        for k, v in response.getheaders():
            if k.lower() not in {'connection', 'server', 'date', 'transfer-encoding', 'content-length'}:
                self.send_header(k, v)
        if not streaming:
            self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            if streaming:
                self.close_connection=True
                while True:
                    line=response.readline()
                    if not line:break
                    self.wfile.write(line)
                    self.wfile.flush()
            else:
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
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
