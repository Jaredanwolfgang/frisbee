import copy
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('frisbee_api', ROOT / 'server/app.py')
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)
SEEDS = json.loads((ROOT / 'server/seed.json').read_text())
KEY = 'test-only-edit-key-not-used-in-production-12345'


class APITest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'test.sqlite3'
        self.store = API.Store(self.path, SEEDS)
        self.start()

    def start(self):
        handler = API.make_handler(self.store, KEY, '/', False, 'http://test.local')
        handler.log_message = lambda *args: None
        self.server = API.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self, method, path, body=None, auth=False, cookie=None, extra=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        headers = {'Content-Type': 'application/json'}
        if auth:
            headers['Authorization'] = 'Bearer ' + KEY
        if cookie:
            headers['Cookie'] = cookie
        headers.update(extra or {})
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        status, headers = response.status, dict(response.getheaders())
        data = json.loads(response.read())
        conn.close()
        return status, data, headers

    def custom(self, id_='team-custom'):
        doc = copy.deepcopy(SEEDS[0])
        doc.update(id=id_, name='测试队战术', example=False)
        return doc

    def test_public_read_private_writes_and_shared_clients(self):
        code, data, _ = self.request('GET', '/api/tactics')
        self.assertEqual(code, 200)
        self.assertEqual(len(data['tactics']), 12)
        self.assertFalse(data['canEdit'])
        self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': self.custom(), 'baseVersion': 0})[0], 401)
        self.assertEqual(self.request('POST', '/api/import', {'tactics': [self.custom()]})[0], 401)
        self.assertEqual(self.request('DELETE', '/api/tactics/basic-vertical', {'baseVersion': 1})[0], 401)
        code, saved, _ = self.request('PUT', '/api/tactics/team-custom', {'tactic': self.custom(), 'baseVersion': 0}, auth=True)
        self.assertEqual(code, 200)
        code, viewer, _ = self.request('GET', '/api/tactics/team-custom')
        self.assertEqual(code, 200)
        self.assertEqual(viewer['tactic'], saved['tactic'])

    def test_cookie_login_logout_and_csrf(self):
        self.assertEqual(self.request('POST', '/api/login', {'password': 'wrong'})[0], 401)
        self.assertEqual(self.request('POST', '/api/login', {'password': KEY}, extra={'Origin': 'https://another.site'})[0], 403)
        code, _, headers = self.request('POST', '/api/login', {'password': KEY}, extra={'Origin': 'http://test.local'})
        self.assertEqual(code, 200)
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])
        cookie = headers['Set-Cookie'].split(';')[0]
        self.assertTrue(self.request('GET', '/api/tactics', cookie=cookie)[1]['canEdit'])
        self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': self.custom(), 'baseVersion': 0}, cookie=cookie, extra={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.request('POST', '/api/logout', {}, cookie=cookie)[0], 200)
        self.assertFalse(self.request('GET', '/api/tactics')[1]['canEdit'])

    def test_stale_edits_do_not_overwrite(self):
        payload = {'tactic': self.custom(), 'baseVersion': 0}
        saved = self.request('PUT', '/api/tactics/team-custom', payload, auth=True)[1]['tactic']
        newer = copy.deepcopy(saved)
        newer['name'] = '队友的新修改'
        code, result, _ = self.request('PUT', '/api/tactics/team-custom', {'tactic': newer, 'baseVersion': 1}, auth=True)
        self.assertEqual(code, 200)
        self.assertEqual(result['tactic']['_version'], 2)
        self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': saved, 'baseVersion': 1}, auth=True)[0], 409)
        self.assertEqual(self.request('GET', '/api/tactics/team-custom')[1]['tactic']['name'], '队友的新修改')

    def test_restart_keeps_data_and_deletions(self):
        self.request('PUT', '/api/tactics/team-custom', {'tactic': self.custom(), 'baseVersion': 0}, auth=True)
        self.assertEqual(self.request('DELETE', '/api/tactics/basic-vertical', {'baseVersion': 1}, auth=True)[0], 200)
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.store = API.Store(self.path, SEEDS)
        self.start()
        ids = {t['id'] for t in self.request('GET', '/api/tactics')[1]['tactics']}
        self.assertIn('team-custom', ids)
        self.assertNotIn('basic-vertical', ids)
        with self.store.transaction() as db:
            self.assertEqual(db.execute("SELECT deleted FROM tactics WHERE id='basic-vertical'").fetchone()[0], 1)

    def test_import_is_atomic_and_preserves_conflicts(self):
        original = self.custom()
        self.request('PUT', '/api/tactics/team-custom', {'tactic': original, 'baseVersion': 0}, auth=True)
        changed = self.custom()
        changed['name'] = '旧浏览器的另一版本'
        code, result, _ = self.request('POST', '/api/import', {'tactics': [changed]}, auth=True)
        self.assertEqual(code, 200)
        self.assertEqual(result['added'], 1)
        self.assertEqual(result['copied'], 1)
        self.assertEqual(self.request('GET', '/api/tactics/team-custom')[1]['tactic']['name'], original['name'])
        self.assertEqual(self.request('POST', '/api/import', {'tactics': [original]}, auth=True)[1]['skipped'], 1)
        invalid = self.custom('invalid')
        invalid['frames'][0]['players'][0]['x'] = 999999
        code, _, _ = self.request('POST', '/api/import', {'tactics': [self.custom('never-partial'), invalid]}, auth=True)
        self.assertEqual(code, 400)
        self.assertEqual(self.request('GET', '/api/tactics/never-partial')[0], 404)

    def test_server_rejects_malformed_nested_data(self):
        for field in ['category', 'level']:
            doc = self.custom()
            doc[field] = ['invalid']
            self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 400)
        doc = self.custom()
        doc['frames'][0]['players'][0]['team'] = []
        self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 400)

        doc = self.custom()
        doc['frames'][0]['players'][1]['id'] = doc['frames'][0]['players'][0]['id']
        self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 400)

    def test_drill_supports_one_to_seven_players_and_stable_display_numbers(self):
        for size in range(1, 8):
            doc = self.custom('drill-' + str(size))
            doc.update(kind='drill', category='基础训练')
            for f in doc['frames']:
                f['players'] = f['players'][:size]
                f['routes'] = [r for r in f['routes'] if r['player'] <= size]
            code, saved, _ = self.request('PUT', '/api/tactics/' + doc['id'], {'tactic': doc, 'baseVersion': 0}, auth=True)
            self.assertEqual(code, 200)
            self.assertEqual(saved['tactic']['kind'], 'drill')
            self.assertTrue(all(len(f['players']) == size for f in saved['tactic']['frames']))
        mixed = self.custom('mixed-drill')
        mixed.update(kind='drill', category='基础训练')
        for f in mixed['frames']:
            f['players'] = f['players'][:3] + f['players'][7:9]
            f['players'][3].update(id=501, number=1)
            f['players'][4].update(id=502, number=2)
            f['routes'] = []
        code, saved, _ = self.request('PUT', '/api/tactics/mixed-drill', {'tactic': mixed, 'baseVersion': 0}, auth=True)
        self.assertEqual(code, 200)
        read = self.request('GET', '/api/tactics/mixed-drill')[1]['tactic']
        self.assertEqual(read['frames'][0]['players'][3]['number'], 1)
        self.assertEqual(read['frames'][0]['players'][3]['id'], 501)
        self.assertEqual(read, saved['tactic'])

    def test_drill_rejects_eight_players_but_tactic_keeps_seven_per_side(self):
        doc = self.custom('too-many')
        doc.update(kind='drill', category='基础训练')
        for f in doc['frames']:
            f['players'] = f['players'][:8]
            f['routes'] = []
        self.assertEqual(self.request('PUT', '/api/tactics/too-many', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 400)
        normal = self.custom('normal-tactic')
        self.assertEqual(self.request('PUT', '/api/tactics/normal-tactic', {'tactic': normal, 'baseVersion': 0}, auth=True)[0], 200)

    def test_markers_persist_for_shared_drill_without_counting_as_players(self):
        doc = self.custom('marker-drill')
        doc.update(kind='drill', category='基础训练')
        for frame in doc['frames']:
            frame['players'] = frame['players'][:3]
            frame['routes'] = []
        doc['markers'] = [{'id': 'cone-a', 'x': 160, 'y': 100, 'label': '起点 A'},
                          {'id': 'cone-b', 'x': 600, 'y': 400, 'label': '接盘区 B'}]
        code, result, _ = self.request('PUT', '/api/tactics/marker-drill', {'tactic': doc, 'baseVersion': 0}, auth=True)
        self.assertEqual(code, 200)
        saved = result['tactic']
        self.assertEqual(saved['markers'], doc['markers'])
        self.assertEqual(len(saved['frames'][0]['players']), 3)
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.store = API.Store(self.path, SEEDS)
        self.start()
        viewed = self.request('GET', '/api/tactics/marker-drill')[1]['tactic']
        self.assertEqual(viewed['markers'], doc['markers'])
        imported = self.request('POST', '/api/import', {'tactics': [viewed]}, auth=True)[1]
        self.assertEqual(imported['skipped'], 1)
        changed_ids = copy.deepcopy(viewed)
        changed_ids['markers'][0]['id'] = 'new-cone-id'
        self.assertEqual(API.canonical(changed_ids), API.canonical(viewed))
        changed_ids['markers'][0]['x'] += 20
        self.assertNotEqual(API.canonical(changed_ids), API.canonical(viewed))
        viewed['markers'] = []
        self.assertEqual(self.request('PUT', '/api/tactics/marker-drill', {'tactic': viewed, 'baseVersion': saved['_version']}, auth=True)[0], 200)
        self.assertFalse(self.request('GET', '/api/tactics/marker-drill')[1]['tactic'].get('markers'))
        legacy = self.custom()
        explicit_empty = copy.deepcopy(legacy)
        explicit_empty['markers'] = []
        self.assertEqual(API.canonical(legacy), API.canonical(explicit_empty))

    def test_marker_validation_and_write_permissions(self):
        good = {'id': 'corner-1', 'x': 100, 'y': 200, 'label': '折返点'}
        doc = self.custom('marker-validation')
        doc['markers'] = [good]
        self.assertEqual(self.request('PUT', '/api/tactics/marker-validation', {'tactic': doc, 'baseVersion': 0})[0], 401)
        invalid = [None, {}, [good, good], [dict(good, x=1)], [dict(good, x=True)],
                   [dict(good, label='a' * 25)], [dict(good, id='bad id')],
                   [dict(good, id='c-' + str(n)) for n in range(33)]]
        for markers in invalid:
            with self.subTest(markers=markers):
                doc['markers'] = markers
                self.assertEqual(self.request('PUT', '/api/tactics/marker-validation', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 400)
        # Cones are equipment; even 32 cones do not consume the Drill's seven player slots.
        doc['kind'], doc['category'] = 'drill', '基础训练'
        for frame in doc['frames']:
            frame['players'] = frame['players'][:7]
            frame['routes'] = []
        doc['markers'] = [dict(good, id='valid-cone-' + str(n)) for n in range(32)]
        self.assertEqual(self.request('PUT', '/api/tactics/marker-validation', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 200)


if __name__ == '__main__':
    unittest.main()
