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

    def start(self, key=KEY, password=None):
        handler = API.make_handler(self.store, key, '/', False, 'http://test.local', editor_password=password)
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
        self.assertEqual(len(data['tactics']), len(SEEDS))
        self.assertFalse(data['canEdit'])
        self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': self.custom(), 'baseVersion': 0})[0], 401)
        self.assertEqual(self.request('POST', '/api/import', {'tactics': [self.custom()]})[0], 401)
        self.assertEqual(self.request('DELETE', '/api/tactics/basic-vertical', {'baseVersion': 1})[0], 401)
        code, saved, _ = self.request('PUT', '/api/tactics/team-custom', {'tactic': self.custom(), 'baseVersion': 0}, auth=True)
        self.assertEqual(code, 200)
        code, viewer, _ = self.request('GET', '/api/tactics/team-custom')
        self.assertEqual(code, 200)
        self.assertEqual(viewer['tactic'], saved['tactic'])

    def test_loop_setting_is_shared_persisted_and_imported_without_duplicates(self):
        doc = copy.deepcopy(next(t for t in SEEDS if t['id'] == 'drill-pendulum'))
        doc.update(id='custom-pendulum', example=False)
        self.assertEqual(self.request('PUT', '/api/tactics/custom-pendulum', {'tactic': doc, 'baseVersion': 0})[0], 401)
        code, saved, _ = self.request('PUT', '/api/tactics/custom-pendulum', {'tactic': doc, 'baseVersion': 0}, auth=True)
        self.assertEqual(code, 200)
        self.assertTrue(self.request('GET', '/api/tactics/custom-pendulum')[1]['tactic']['loop'])
        reopened = API.Store(self.path, SEEDS)
        with reopened.transaction() as db:
            stored = json.loads(db.execute("SELECT document FROM tactics WHERE id='custom-pendulum'").fetchone()[0])
        self.assertTrue(stored['loop'])
        self.assertEqual(stored['frames'], saved['tactic']['frames'])
        self.assertEqual(self.request('POST', '/api/import', {'tactics': [stored]}, auth=True)[1]['skipped'], 1)
        stored['loop'] = False
        code, result, _ = self.request('PUT', '/api/tactics/custom-pendulum', {'tactic': stored, 'baseVersion': 1}, auth=True)
        self.assertEqual(code, 200)
        self.assertFalse(result['tactic'].get('loop', False))
        self.assertEqual(API.canonical({**result['tactic'], 'loop': False}), API.canonical(result['tactic']))

    def test_loop_rejects_wrong_types_and_regular_tactics(self):
        for value in [True, 'true', 1, [], None]:
            doc = self.custom()
            doc['loop'] = value
            self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 400)
        doc.update(kind='drill', category='基础训练', loop='true')
        for frame in doc['frames']:
            frame['players'] = frame['players'][:2]
            frame['routes'] = []
        self.assertEqual(self.request('PUT', '/api/tactics/team-custom', {'tactic': doc, 'baseVersion': 0}, auth=True)[0], 400)

    def test_curved_pass_is_shared_persisted_and_imported(self):
        doc = self.custom('curve-test')
        route = {'id': 'curve-route', 'player': doc['frames'][0]['players'][0]['id'],
                 'kind': 'pass', 'points': [], 'end': {'x': 700, 'y': 280},
                 'bend': {'x': 450, 'y': 140}}
        doc['frames'][0]['routes'] = [route]
        body = {'tactic': doc, 'baseVersion': 0}
        self.assertEqual(self.request('PUT', '/api/tactics/curve-test', body)[0], 401)
        self.assertEqual(self.request('PUT', '/api/tactics/curve-test', body, auth=True)[0], 200)
        saved = self.request('GET', '/api/tactics/curve-test')[1]['tactic']
        self.assertEqual(saved['frames'][0]['routes'], [route])
        reopened = API.Store(self.path, SEEDS)
        with reopened.transaction() as db:
            stored = json.loads(db.execute("SELECT document FROM tactics WHERE id='curve-test'").fetchone()[0])
        self.assertEqual(stored['frames'][0]['routes'], [route])
        self.assertEqual(self.request('POST', '/api/import', {'tactics': [stored]}, auth=True)[1]['skipped'], 1)
        straight = copy.deepcopy(saved)
        del straight['frames'][0]['routes'][0]['bend']
        self.assertNotEqual(API.canonical(straight), API.canonical(saved))
        for invalid in [None, {'x': 10, 'y': 100}, {'x': True, 'y': 100}, {'x': 100, 'y': '100'}]:
            bad = copy.deepcopy(saved)
            bad['frames'][0]['routes'][0]['bend'] = invalid
            self.assertEqual(self.request('PUT', '/api/tactics/curve-test', {'tactic': bad, 'baseVersion': 1}, auth=True)[0], 400)
        for kind, via in [('run', []), ('pass', [{'x': 400, 'y': 200}])]:
            bad = copy.deepcopy(saved)
            bad['frames'][0]['routes'][0].update(kind=kind, points=via)
            self.assertEqual(self.request('PUT', '/api/tactics/curve-test', {'tactic': bad, 'baseVersion': 1}, auth=True)[0], 400)

    def test_revision_poll_is_small_and_still_checks_editor_permission(self):
        code, full, _ = self.request('GET', '/api/tactics')
        revision = full['revision']
        code, same, _ = self.request('GET', '/api/tactics?revision='+str(revision))
        self.assertEqual(code,200)
        self.assertTrue(same['unchanged'])
        self.assertNotIn('tactics',same)
        self.assertFalse(same['canEdit'])
        self.assertLess(len(json.dumps(same)),120)
        self.assertTrue(self.request('GET','/api/tactics?revision='+str(revision),auth=True)[1]['canEdit'])
        self.request('PUT','/api/tactics/team-custom',{'tactic':self.custom(),'baseVersion':0},auth=True)
        updated = self.request('GET','/api/tactics?revision='+str(revision))[1]
        self.assertGreater(updated['revision'],revision)
        self.assertIn('team-custom',{t['id'] for t in updated['tactics']})
        for invalid in ['wrong','-1','1.5','9'*30]:
            self.assertEqual(self.request('GET','/api/tactics?revision='+invalid)[0],400)

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

    def test_separate_entry_code_and_cookie_key_rotation(self):
        old_cookie = self.request('POST', '/api/login', {'password': KEY})[2]['Set-Cookie'].split(';')[0]
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        entry_code = 'test-team-code'
        signing_key = 'rotated-test-cookie-signing-key-123456'
        self.start(key=signing_key, password=entry_code)
        for old_or_wrong in [KEY, signing_key, 'wrong']:
            self.assertEqual(self.request('POST', '/api/login', {'password': old_or_wrong})[0], 401)
        self.assertFalse(self.request('GET', '/api/tactics', auth=True)[1]['canEdit'])
        self.assertFalse(self.request('GET', '/api/tactics', cookie=old_cookie)[1]['canEdit'])
        code, _, headers = self.request('POST', '/api/login', {'password': entry_code})
        self.assertEqual(code, 200)
        cookie = headers['Set-Cookie'].split(';')[0]
        self.assertTrue(self.request('GET', '/api/tactics', cookie=cookie)[1]['canEdit'])
        self.assertTrue(self.request('GET', '/api/tactics', extra={'Authorization': 'Bearer '+entry_code})[1]['canEdit'])
        self.assertEqual(self.request('POST', '/api/login', {'password': entry_code}, extra={'Origin': 'https://another.site'})[0], 403)
        stamp = cookie.split('=', 1)[1].split('.', 1)[0]
        weak_sig = API.hmac.new(entry_code.encode(), stamp.encode(), API.hashlib.sha256).hexdigest()
        self.assertFalse(self.request('GET', '/api/tactics', cookie='frisbee_editor='+stamp+'.'+weak_sig)[1]['canEdit'])
        with self.assertRaises(ValueError):
            API.make_handler(self.store, 'short', editor_password=entry_code)
        with self.assertRaises(ValueError):
            API.make_handler(self.store, signing_key, editor_password='short')

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
