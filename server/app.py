"""Shared Frisbee playbook API. Python stdlib + SQLite; no third-party packages."""
from contextlib import contextmanager
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import hashlib
import importlib.util
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid

AI_SPEC = importlib.util.spec_from_file_location('frisbee_ai', Path(__file__).with_name('ai.py'))
AI_MODULE = importlib.util.module_from_spec(AI_SPEC)
AI_SPEC.loader.exec_module(AI_MODULE)

MAX_BODY = 5 * 1024 * 1024
MAX_PLAYERS = 14
CATEGORIES = {'进攻战术', '防守战术', '端区战术', '基础训练'}
ID = re.compile(r'^[A-Za-z0-9_-]{1,149}$')
ROUTE_ID = re.compile(r'^[A-Za-z0-9_-]{1,100}$')


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def point(p):
    if not isinstance(p, dict) or not is_number(p.get('x')) or not is_number(p.get('y')):
        raise APIError(400, '球员或路线坐标无效。')
    if not (20 <= p['x'] <= 980 and 20 <= p['y'] <= 540):
        raise APIError(400, '坐标超出场地范围。')
    return {'x': p['x'], 'y': p['y']}


def text(v, limit, required=False):
    if not isinstance(v, str) or len(v) > limit or (required and not v.strip()):
        raise APIError(400, '战术文字格式或长度无效。')
    return v.strip() if required else v


def tactic(raw):
    """Validate and copy an allowlist of fields; never trust browser metadata."""
    if not isinstance(raw, dict) or not isinstance(raw.get('id'), str) or not ID.fullmatch(raw['id']):
        raise APIError(400, '战术编号无效。')
    if not isinstance(raw.get('category'), str) or raw['category'] not in CATEGORIES or not isinstance(raw.get('level'), str) or raw['level'] not in {'基础', '进阶', '挑战'}:
        raise APIError(400, '战术类型或难度无效。')
    tags = raw.get('tags')
    frames = raw.get('frames')
    if not isinstance(tags, list) or len(tags) > 12:
        raise APIError(400, '标签格式无效。')
    if not isinstance(frames, list) or not 1 <= len(frames) <= 24:
        raise APIError(400, '每套战术需要 1–24 个步骤。')
    out = {'id': raw['id'], 'name': text(raw.get('name'), 100, True),
           'category': raw['category'], 'level': raw['level'],
           'summary': text(raw.get('summary'), 500),
           'english': text(raw.get('english', ''), 150),
           'tags': [text(v, 99) for v in tags], 'frames': [],
           'example': raw.get('example') is True,
           'kind': raw.get('kind', 'drill' if raw['category'] == '基础训练' else 'tactic')}
    if out['kind'] not in ['tactic', 'drill']:
        raise APIError(400, '请选择战术或 Drill。')
    if 'loop' in raw and type(raw['loop']) is not bool:
        raise APIError(400, '循环模式需为开启或关闭。')
    if raw.get('loop'):
        if out['kind'] != 'drill':
            raise APIError(400, '循环模式仅适用于 Drill。')
        out['loop'] = True
    markers = raw.get('markers', [])
    if not isinstance(markers, list) or len(markers) > 32:
        raise APIError(400, '每套战术最多 32 个角标。')
    marker_ids, clean_markers = set(), []
    for marker in markers:
        if not isinstance(marker, dict) or not isinstance(marker.get('id'), str) or not ROUTE_ID.fullmatch(marker['id']) or marker['id'] in marker_ids:
            raise APIError(400, '角标编号无效或重复。')
        marker_ids.add(marker['id'])
        clean_markers.append({'id': marker['id'], **point(marker), 'label': text(marker.get('label', ''), 24)})
    if clean_markers:
        out['markers'] = clean_markers
    if raw.get('formation'):
        out['formation'] = text(raw['formation'], 299)
    if raw.get('roles'):
        roles = raw['roles']
        if not isinstance(roles, dict) or len(roles) > MAX_PLAYERS:
            raise APIError(400, '防守分工格式无效。')
        out['roles'] = {}
        for key, value in roles.items():
            if not re.fullmatch(r'[1-9][0-9]{0,5}', key):
                raise APIError(400, '防守分工编号无效。')
            out['roles'][key] = text(value, 159)
    if isinstance(raw.get('catalogRevision'), int):
        out['catalogRevision'] = raw['catalogRevision']
    for f in frames:
        if not isinstance(f, dict) or not isinstance(f.get('players'), list) or not 1 <= len(f['players']) <= MAX_PLAYERS:
            raise APIError(400, '球员列表无效。')
        if out['kind'] == 'drill' and len(f['players']) > 7:
            raise APIError(400, 'Drill 演示总人数最多 7 人（含防守球员）。')
        players, ids = [], set()
        for p in f['players']:
            if not isinstance(p, dict) or type(p.get('id')) is not int or not 1 <= p['id'] <= 999999 or p['id'] in ids:
                raise APIError(400, '球员编号无效或重复。')
            if not isinstance(p.get('team'), str) or p['team'] not in {'offense', 'defense'}:
                raise APIError(400, '攻守分组无效。')
            ids.add(p['id'])
            player = {'id': p['id'], 'team': p['team'], **point(p)}
            if 'number' in p:
                if type(p['number']) is not int or not 1 <= p['number'] <= 7:
                    raise APIError(400, '球员显示编号无效。')
                player['number'] = p['number']
            players.append(player)
        if any(sum(p['team'] == team for p in players) > 7 for team in ['offense', 'defense']):
            raise APIError(400, '每方最多 7 人。')
        if not isinstance(f.get('routes'), list) or len(f['routes']) > 40:
            raise APIError(400, '路线列表无效。')
        routes = []
        for r in f['routes']:
            if not isinstance(r, dict) or not isinstance(r.get('id'), str) or not ROUTE_ID.fullmatch(r['id']):
                raise APIError(400, '路线编号无效。')
            if type(r.get('player')) is not int or r['player'] not in ids or not isinstance(r.get('kind'), str) or r['kind'] not in {'run', 'pass'}:
                raise APIError(400, '路线球员或类型无效。')
            via = r.get('points')
            if not isinstance(via, list) or len(via) > 12:
                raise APIError(400, '路线中间点无效。')
            routes.append({'id': r['id'], 'player': r['player'], 'kind': r['kind'],
                           'end': point(r.get('end')), 'points': [point(p) for p in via]})
        out['frames'].append({'name': text(f.get('name'), 100), 'notes': text(f.get('notes'), 3000),
                              'players': players, 'disc': point(f.get('disc')), 'routes': routes})
    return out


def canonical(doc):
    """Route UUIDs and server clocks do not change a play's meaning."""
    doc = json.loads(json.dumps(doc))
    doc.setdefault('kind', 'drill' if doc.get('category') == '基础训练' else 'tactic')
    for key in ['updated', '_version']:
        doc.pop(key, None)
    doc.setdefault('loop', False)
    doc.setdefault('markers', [])
    for marker in doc['markers']:
        marker.pop('id', None)
    for f in doc['frames']:
        for r in f['routes']:
            r.pop('id', None)
    return json.dumps(doc, ensure_ascii=False, sort_keys=True)


class Store:
    def __init__(self, path, seeds):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS tactics (id TEXT PRIMARY KEY, document TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)')
            db.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)')
            db.execute("INSERT OR IGNORE INTO metadata VALUES ('revision', 1)")
            # Tombstones are retained, so deployment never resurrects deleted plays.
            for raw in seeds:
                doc = tactic(raw)
                doc['updated'] = raw.get('updated', 1700000000000)
                db.execute('INSERT OR IGNORE INTO tactics(id,document,version) VALUES (?,?,1)',
                           (doc['id'], json.dumps(doc, ensure_ascii=False)))

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA busy_timeout=10000')
        return db

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def document(row):
        return {**json.loads(row['document']), '_version': row['version']}

    @staticmethod
    def revision(db, bump=False):
        if bump:
            db.execute("UPDATE metadata SET value=value+1 WHERE key='revision'")
        return db.execute("SELECT value FROM metadata WHERE key='revision'").fetchone()[0]

    def library(self):
        db = self.connect()
        try:
            db.execute('BEGIN')
            result = {'tactics': [self.document(r) for r in db.execute('SELECT * FROM tactics WHERE deleted=0 ORDER BY rowid')],
                      'revision': self.revision(db)}
            db.commit()
            return result
        finally:
            db.close()

    def put(self, raw, expected):
        doc = tactic(raw)
        if type(expected) is not int or expected < 0:
            raise APIError(400, '请提供当前战术版本。')
        with self.transaction() as db:
            old = db.execute('SELECT * FROM tactics WHERE id=?', (doc['id'],)).fetchone()
            if (old and (old['deleted'] or old['version'] != expected)) or (not old and expected != 0):
                raise APIError(409, '这套战术已被其他人更新或删除。你的草稿仍然保留。')
            if not old and db.execute('SELECT count(*) FROM tactics WHERE deleted=0').fetchone()[0] >= 500:
                raise APIError(400, '团队库最多保存 500 套战术。')
            if not old:
                doc['example'] = False
            doc['updated'] = int(time.time() * 1000)
            version = old['version'] + 1 if old else 1
            db.execute('INSERT INTO tactics(id,document,version) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, version=excluded.version',
                       (doc['id'], json.dumps(doc, ensure_ascii=False), version))
            revision = self.revision(db, True)
        return {'tactic': {**doc, '_version': version}, 'revision': revision}

    def delete(self, id_, expected):
        with self.transaction() as db:
            row = db.execute('SELECT * FROM tactics WHERE id=? AND deleted=0', (id_,)).fetchone()
            if not row:
                raise APIError(404, '这套战术已不存在。')
            if type(expected) is not int or expected != row['version']:
                raise APIError(409, '战术已经更新，请刷新后再删除。')
            db.execute('UPDATE tactics SET deleted=1,version=version+1 WHERE id=?', (id_,))
            return {'deleted': id_, 'revision': self.revision(db, True)}

    def import_tactics(self, raws):
        if not isinstance(raws, list) or len(raws) > 500:
            raise APIError(400, '导入列表无效，最多 500 套。')
        docs = [tactic(raw) for raw in raws]
        if len({d['id'] for d in docs}) != len(docs):
            raise APIError(400, '导入文件包含重复的战术编号。')
        added, copied, skipped = 0, 0, 0
        with self.transaction() as db:
            count = db.execute('SELECT count(*) FROM tactics WHERE deleted=0').fetchone()[0]
            for doc in docs:
                old = db.execute('SELECT * FROM tactics WHERE id=?', (doc['id'],)).fetchone()
                if old and not old['deleted'] and canonical(json.loads(old['document'])) == canonical(doc):
                    skipped += 1
                    continue
                if count >= 500:
                    raise APIError(400, '导入后会超过 500 套，请先整理团队库。')
                if old:
                    doc['id'] = str(uuid.uuid4())
                    doc['name'] = doc['name'][:92] + '（导入副本）'
                    copied += 1
                doc['example'] = False
                doc['updated'] = int(time.time() * 1000)
                db.execute('INSERT INTO tactics(id,document,version) VALUES (?,?,1)',
                           (doc['id'], json.dumps(doc, ensure_ascii=False)))
                count += 1
                added += 1
            revision = self.revision(db, bool(added))
        return {'added': added, 'copied': copied, 'skipped': skipped, 'revision': revision}


def make_handler(store, edit_key, cookie_path='/frisbee/', secure=True, public_origin='https://jaredan.site', ai_service=None):
    if len(edit_key) < 24:
        raise ValueError('EDITOR_KEY must contain at least 24 characters')
    auth_attempts, auth_lock = {}, threading.Lock()
    secret = edit_key.encode()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format_, *args):
            # Never log request bodies, passwords, Authorization, or cookies.
            print('%s %s' % (self.address_string(), format_ % args), flush=True)

        def send(self, status, data, cookie=None):
            body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            if cookie:
                self.send_header('Set-Cookie', cookie)
            self.end_headers()
            self.wfile.write(body)

        def body(self):
            try:
                size = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise APIError(400, '请求长度无效。')
            if not 0 < size <= MAX_BODY:
                raise APIError(413, '文件或战术过大，最多 5MB。')
            if self.headers.get_content_type() != 'application/json':
                raise APIError(415, '请使用 JSON 请求。')
            try:
                data = json.loads(self.rfile.read(size))
            except (ValueError, UnicodeDecodeError):
                raise APIError(400, '无法读取 JSON 内容。')
            if not isinstance(data, dict):
                raise APIError(400, '请求格式无效。')
            return data

        def authorized(self):
            auth = self.headers.get('Authorization', '')
            if auth.startswith('Bearer ') and hmac.compare_digest(auth[7:].encode(), secret):
                return True
            try:
                cookie = SimpleCookie(self.headers.get('Cookie', ''))
                value = cookie['frisbee_editor'].value
                stamp, sig = value.split('.', 1)
                age = time.time() - int(stamp)
                expected = hmac.new(secret, stamp.encode(), hashlib.sha256).hexdigest()
                return 0 <= age <= 7 * 86400 and hmac.compare_digest(sig, expected)
            except (KeyError, ValueError, CookieError):
                return False

        def require_editor(self):
            origin = self.headers.get('Origin')
            if self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != public_origin):
                raise APIError(403, '请求来源无效。')
            if not self.authorized():
                raise APIError(401, '请先输入编辑口令。')

        def require_same_origin(self):
            origin = self.headers.get('Origin')
            if self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != public_origin):
                raise APIError(403, '请求来源无效。')

        def ai_dispatch(self, path):
            if path == '/api/ai/status' and self.command == 'GET':
                return self.send(200, {'enabled': ai_service is not None, 'text': True, 'speech': False})
            if self.command != 'POST' or path not in ('/api/ai/tactic', '/api/ai/rules'):
                raise APIError(404, 'AI 接口不存在。')
            self.require_same_origin()
            if path == '/api/ai/tactic':
                self.require_editor()
            if ai_service is None:
                raise APIError(503, 'AI 暂未配置；仍可手动画图和直接检索规则。')
            try:
                ai_size = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise APIError(400, '请求长度无效。') from None
            if ai_size > 32768:
                raise APIError(413, 'AI 请求过长，请缩短描述。')
            data = self.body()
            ip = self.headers.get('X-Real-IP', self.client_address[0])
            try:
                if path == '/api/ai/tactic':
                    return self.send(200, ai_service.generate(data, ip))
                prepared = ai_service.prepare_rules(data, ip)
            except AI_MODULE.AIError as error:
                raise APIError(error.status, error.message) from None
            events = ai_service.rules_stream(prepared)
            try:
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-transform')
                self.send_header('X-Accel-Buffering', 'no')
                self.send_header('Connection', 'close')
                self.end_headers()
                for event, payload in events:
                    block = 'event: ' + event + '\ndata: ' + json.dumps(payload, ensure_ascii=False) + '\n\n'
                    self.wfile.write(block.encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                events.close()
                ai_service.release_rules(prepared)
                self.close_connection = True

        def dispatch(self):
            path = urlparse(self.path).path.rstrip('/')
            if path.startswith('/api/ai/'):
                return self.ai_dispatch(path)
            if self.command == 'GET' and path == '/api/health':
                with store.transaction() as db:
                    db.execute('SELECT 1')
                return self.send(200, {'ok': True})
            if self.command == 'GET' and path == '/api/tactics':
                return self.send(200, {**store.library(), 'canEdit': self.authorized()})
            if self.command == 'POST' and path == '/api/login':
                origin = self.headers.get('Origin')
                if self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != public_origin):
                    raise APIError(403, '请求来源无效。')
                # The internal Nginx supplies the real address. Backend has no host port.
                ip = self.headers.get('X-Real-IP', self.client_address[0])
                with auth_lock:
                    now = time.time()
                    recent = [t for t in auth_attempts.get(ip, []) if now - t < 600]
                    if len(recent) >= 8:
                        raise APIError(429, '尝试次数较多，请 10 分钟后再试。')
                    auth_attempts[ip] = recent + [now]
                    if len(auth_attempts) > 4096:
                        for k in list(auth_attempts):
                            if all(now - t >= 600 for t in auth_attempts[k]):
                                del auth_attempts[k]
                data = self.body()
                password = data.get('password')
                if not isinstance(password, str) or not hmac.compare_digest(password.encode(), secret):
                    raise APIError(401, '编辑口令不正确。')
                with auth_lock:
                    auth_attempts.pop(ip, None)
                stamp = str(int(time.time()))
                sig = hmac.new(secret, stamp.encode(), hashlib.sha256).hexdigest()
                cookie = f'frisbee_editor={stamp}.{sig}; Path={cookie_path}; Max-Age=604800; HttpOnly; SameSite=Strict'
                if secure:
                    cookie += '; Secure'
                return self.send(200, {'canEdit': True}, cookie)
            if self.command == 'POST' and path == '/api/logout':
                self.require_editor()
                return self.send(200, {'canEdit': False}, f'frisbee_editor=; Path={cookie_path}; Max-Age=0; HttpOnly; SameSite=Strict' + ('; Secure' if secure else ''))
            if self.command == 'POST' and path == '/api/import':
                self.require_editor()
                return self.send(200, store.import_tactics(self.body().get('tactics')))
            if path.startswith('/api/tactics/'):
                id_ = unquote(path[len('/api/tactics/'):])
                if not ID.fullmatch(id_):
                    raise APIError(400, '战术编号无效。')
                if self.command == 'GET':
                    found = next((t for t in store.library()['tactics'] if t['id'] == id_), None)
                    if not found:
                        raise APIError(404, '这套战术不存在或已被删除。')
                    return self.send(200, {'tactic': found})
                self.require_editor()
                data = self.body()
                if self.command == 'PUT':
                    raw = data.get('tactic')
                    if not isinstance(raw, dict) or raw.get('id') != id_:
                        raise APIError(400, '战术编号不一致。')
                    return self.send(200, store.put(raw, data.get('baseVersion')))
                if self.command == 'DELETE':
                    return self.send(200, store.delete(id_, data.get('baseVersion')))
            raise APIError(404, '接口不存在。')

        def handle_request(self):
            try:
                self.dispatch()
            except APIError as error:
                self.send(error.status, {'error': error.message})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as error:
                print('API error:', type(error).__name__, flush=True)
                self.send(500, {'error': '服务器暂时无法保存，请稍后重试。草稿仍然保留。'})

        do_GET = do_POST = do_PUT = do_DELETE = handle_request

    return Handler


if __name__ == '__main__':
    seed_path = Path(__file__).with_name('seed.json')
    seeds = json.loads(seed_path.read_text())
    store = Store(os.getenv('DB_PATH', '/data/playbook.sqlite3'), seeds)
    ai_service = None
    if os.getenv('AI_API_KEY'):
        client = AI_MODULE.DeepSeekClient(os.environ['AI_API_KEY'], os.getenv('AI_BASE_URL', 'https://api.deepseek.com'),
                                         os.getenv('AI_RULES_MODEL', 'deepseek-flash'), os.getenv('AI_TACTIC_MODEL', 'deepseek-v4-pro'))
        ai_service = AI_MODULE.AIService(os.getenv('RULES_DIR', '/rules'), client, tactic,
                                         int(os.getenv('AI_HOURLY_LIMIT', '200')))
    handler = make_handler(store, os.environ['EDITOR_KEY'],
                           os.getenv('COOKIE_PATH', '/frisbee/'),
                           os.getenv('COOKIE_SECURE', '1') != '0',
                           os.getenv('PUBLIC_ORIGIN', 'https://jaredan.site'), ai_service)
    server = ThreadingHTTPServer(('0.0.0.0', int(os.getenv('PORT', '8080'))), handler)
    print('Frisbee API ready', flush=True)
    server.serve_forever()
