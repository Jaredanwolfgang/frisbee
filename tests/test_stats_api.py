import http.client
import importlib.util
import json
import sqlite3
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


class StatsAPITest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'test.sqlite3'
        self.store = API.Store(self.path, SEEDS)
        self.stats = API.STATS_MODULE.StatsStore(self.path)
        self.start()

    def start(self):
        handler = API.make_handler(self.store, KEY, '/', False, 'http://test.local', None, self.stats)
        handler.log_message = lambda *args: None
        self.server = API.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def exchange(self, method, path, body=None, auth=True, extra=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        headers = {'Content-Type': 'application/json'}
        if auth:
            headers['Authorization'] = 'Bearer ' + KEY
        headers.update(extra or {})
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        status, data = response.status, json.loads(response.read())
        headers = dict(response.getheaders())
        conn.close()
        return status, data, headers

    def request(self, method, path, body=None, auth=True, extra=None):
        status, data, _ = self.exchange(method, path, body, auth, extra)
        return status, data

    def login(self, name):
        player = next(p for p in self.stats.snapshot()['players'] if p['name'] == name)
        if not player['loginReady']:
            self.request('PUT', '/api/stats/players/'+str(player['id']), {**player,'password':'fixture-player-password'})
        code, data, headers = self.exchange('POST', '/api/stats/login', {'name': name,'password':'fixture-player-password'}, auth=False)
        self.assertEqual(code, 200, data)
        return headers.get('Set-Cookie', '').split(';')[0]

    def player(self, name, number, gender='male'):
        code, data = self.request('POST', '/api/stats/players', {'name': name, 'number': number, 'gender': gender})
        self.assertEqual(code, 200, data)
        return data['player']['id']

    def game(self, name='周末友谊赛', opponent='海豚'):
        code, data = self.request('POST', '/api/stats/games', {'name': name, 'opponent': opponent})
        self.assertEqual(code, 200, data)
        return data['game']['id']

    def event(self, game, kind, from_id, to_id=None, expect=200, **extra):
        body = {'kind': kind, 'from': from_id}
        if to_id is not None:
            body['to'] = to_id
        body.update(extra)
        code, data = self.request('POST', f'/api/stats/games/{game}/events', body)
        self.assertEqual(code, expect, data)
        return data

    def test_public_read_and_editor_only_writes(self):
        code, data = self.request('GET', '/api/stats', auth=False)
        self.assertEqual(code, 200)
        self.assertEqual((data['players'], data['games'], data['canEdit']), ([], [], False))
        self.assertEqual(self.request('POST', '/api/stats/players', {'name': '疾风', 'number': 7, 'gender': 'male'}, auth=False)[0], 401)
        self.assertEqual(self.request('POST', '/api/stats/games', {'name': 'x'}, auth=False)[0], 401)
        self.assertEqual(self.request('POST', '/api/stats/players', {'name': '疾风', 'number': 7, 'gender': 'male'}, extra={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('GET', '/api/stats/players')[0], 404)
        self.assertEqual(self.request('GET', '/api/stats?revision=abc', auth=False)[0], 400)

    def test_player_roster_validation_and_unique_numbers(self):
        first = self.player('疾风', 7)
        self.assertEqual(self.request('POST', '/api/stats/players', {'name': '芒果', 'number': 7, 'gender': 'female'})[0], 409)
        for bad in [{'name': '', 'number': 3, 'gender': 'male'}, {'name': 'x' * 25, 'number': 3, 'gender': 'male'},
                    {'name': '芒果', 'number': 100, 'gender': 'male'}, {'name': '芒果', 'number': -1, 'gender': 'male'},
                    {'name': '芒果', 'number': '3', 'gender': 'male'}, {'name': '芒果', 'number': True, 'gender': 'male'},
                    {'name': '芒果', 'number': 3}, {'name': '芒果', 'number': 3, 'gender': 'other'},
                    {'name': '芒果', 'number': 3, 'gender': 'MALE'}, []]:
            self.assertEqual(self.request('POST', '/api/stats/players', bad)[0], 400, bad)
        second = self.player('芒果', 3, 'female')
        code, data = self.request('PUT', f'/api/stats/players/{second}', {'name': '芒果', 'number': 7, 'gender': 'female'})
        self.assertEqual(code, 409)
        code, data = self.request('PUT', f'/api/stats/players/{second}', {'name': '大芒果', 'number': 33, 'gender': 'female'})
        self.assertEqual(code, 200)
        self.assertEqual((data['player']['name'], data['player']['number'], data['player']['gender']), ('大芒果', 33, 'female'))
        self.assertEqual(self.request('PUT', '/api/stats/players/9999', {'name': 'x', 'number': 1, 'gender': 'male'})[0], 404)
        listed = self.request('GET', '/api/stats', auth=False)[1]['players']
        self.assertEqual([(p['number'], p['gender']) for p in listed], [(7, 'male'), (33, 'female')])
        self.assertEqual(self.request('DELETE', f'/api/stats/players/{first}')[0], 200)
        self.assertEqual([p['id'] for p in self.request('GET', '/api/stats', auth=False)[1]['players']], [second])

    def test_live_recording_undo_finish_and_player_protection(self):
        thrower, receiver, defender = self.player('疾风', 7), self.player('芒果', 3), self.player('铁柱', 21)
        game = self.game()
        self.event(game, 'pass', thrower, receiver)
        self.event(game, 'goal', receiver, thrower)
        self.event(game, 'turnover', thrower)
        self.event(game, 'turnover', thrower, receiver)
        self.event(game, 'defense', defender)
        self.event(game, 'pass', thrower, thrower, expect=400)
        self.event(game, 'pass', thrower, expect=400)
        self.event(game, 'goal', thrower, 9999, expect=400)
        self.event(game, 'defense', defender, receiver, expect=400)
        self.assertEqual(self.request('POST', f'/api/stats/games/{game}/events', {'kind': 'steal', 'from': defender})[0], 400)
        self.assertEqual(self.request('POST', '/api/stats/games/missing/events', {'kind': 'pass', 'from': thrower, 'to': receiver})[0], 404)
        stored = next(g for g in self.request('GET', '/api/stats', auth=False)[1]['games'] if g['id'] == game)
        self.assertEqual([e['seq'] for e in stored['events']], [1, 2, 3, 4, 5])
        self.assertEqual([(e['kind'], e['from'], e['to']) for e in stored['events']][:2],
                         [('pass', thrower, receiver), ('goal', receiver, thrower)])
        self.assertEqual(stored['events'][3]['to'], receiver)
        self.assertEqual(self.request('DELETE', f'/api/stats/players/{thrower}')[0], 409)
        code, data = self.request('DELETE', f'/api/stats/games/{game}/events')
        self.assertEqual((code, data['removed']['seq'], data['removed']['kind']), (200, 5, 'defense'))
        self.assertEqual(self.request('DELETE', f'/api/stats/players/{defender}')[0], 200)
        code, data = self.request('POST', f'/api/stats/games/{game}/status', {'status': 'finished'})
        self.assertEqual((code, data['game']['status']), (200, 'finished'))
        self.event(game, 'pass', thrower, receiver, expect=409)
        self.assertEqual(self.request('DELETE', f'/api/stats/games/{game}/events')[0], 409)
        self.assertEqual(self.request('POST', f'/api/stats/games/{game}/status', {'status': 'paused'})[0], 400)
        self.assertEqual(self.request('POST', f'/api/stats/games/{game}/status', {'status': 'live'})[0], 200)
        self.event(game, 'pass', thrower, receiver)
        self.assertEqual(len(next(g for g in self.request('GET', '/api/stats', auth=False)[1]['games'])['events']), 5)

    def test_point_line_records_gendered_lineups_and_player_protection(self):
        players = [self.player('疾风', 7), self.player('芒果', 3, 'female'), self.player('铁柱', 21), self.player('阿', 0, 'female')]
        game = self.game()
        line = players[:3]
        self.event(game, 'point', None, line=line, start='offense')
        self.event(game, 'point', None, line=[], start='offense', expect=400)
        self.event(game, 'point', None, line=[line[0], line[0]], start='offense', expect=400)
        self.event(game, 'point', None, line=[9999], start='offense', expect=400)
        self.event(game, 'point', None, line=line, start='sideline', expect=400)
        self.event(game, 'point', None, line=list(range(1, 16)), start='defense', expect=400)
        self.event(game, 'goal', line[0], line[1])
        second = self.event(game, 'point', None, line=players, start='defense')['event']
        stored = next(g for g in self.request('GET', '/api/stats', auth=False)[1]['games'] if g['id'] == game)['events']
        self.assertEqual([e['kind'] for e in stored], ['point', 'goal', 'point'])
        self.assertEqual(stored[0]['line'], line)
        self.assertEqual((stored[0]['start'], stored[2]['start']), ('offense', 'defense'))
        # Undo removes the lineup entry again; a lineup player cannot leave the roster.
        code, data = self.request('DELETE', f'/api/stats/games/{game}/events')
        self.assertEqual((code, data['removed']['seq']), (200, 3))
        self.assertEqual(self.request('DELETE', f"/api/stats/players/{line[0]}")[0], 409)
        code, data = self.request('DELETE', f'/api/stats/games/{game}/events')
        self.assertEqual(data['removed']['kind'], 'goal')
        self.assertEqual(self.request('DELETE', f"/api/stats/players/{line[0]}")[0], 409)
        code, data = self.request('DELETE', f'/api/stats/games/{game}/events')
        self.assertEqual(data['removed']['kind'], 'point')
        self.assertEqual(self.request('DELETE', f"/api/stats/players/{line[0]}")[0], 200)

    def test_game_info_can_be_corrected_after_creation(self):
        game = self.game('临时名称', '')
        code, data = self.request('PUT', f'/api/stats/games/{game}', {'name': '正式队内赛', 'opponent': '海豚队'})
        self.assertEqual(code, 200)
        self.assertEqual((data['game']['name'], data['game']['opponent']), ('正式队内赛', '海豚队'))
        self.assertEqual(self.request('PUT', f'/api/stats/games/{game}', {'name': ''})[0], 400)
        self.assertEqual(self.request('PUT', f'/api/stats/games/{game}', {'name': 'x', 'opponent': 'y' * 101})[0], 400)
        self.assertEqual(self.request('PUT', '/api/stats/games/missing', {'name': 'x'})[0], 404)
        listed = self.request('GET', '/api/stats', auth=False)[1]['games']
        self.assertEqual((listed[0]['name'], listed[0]['opponent']), ('正式队内赛', '海豚队'))

    def test_game_dates_are_independent_validated_and_preserve_records(self):
        a, b = self.player('疾风', 7), self.player('芒果', 3, 'female')
        raw = {'name':'补录比赛', 'opponent':'海豚队', 'video':'https://example.com/match', 'heldOn':'2024-02-29'}
        code, result = self.request('POST', '/api/stats/games', raw)
        self.assertEqual(code, 200, result)
        game = result['game']
        gid = game['id']
        self.assertEqual(game['heldOn'], '2024-02-29')
        self.event(gid, 'goal', a, b)
        cookie = self.login('疾风')
        self.assertEqual(self.request('POST', f'/api/stats/games/{gid}/comments', {'text':'保留这条心得'}, auth=False, extra={'Cookie':cookie})[0], 200)
        self.request('POST', f'/api/stats/games/{gid}/status', {'status':'finished'})
        for bad in ['', None, False, 20261027, '2026-02-29', '2026-13-01', '20261027', '2026-1-01']:
            self.assertEqual(self.request('POST', '/api/stats/games', {**raw,'heldOn':bad})[0], 400, bad)
            self.assertEqual(self.request('PUT', f'/api/stats/games/{gid}', {'heldOn':bad})[0], 400, bad)
        self.assertEqual(self.request('PUT', f'/api/stats/games/{gid}', {'heldOn':'2026-10-25'}, auth=False, extra={'Cookie':cookie})[0], 401)
        self.assertEqual(self.request('PUT', f'/api/stats/games/{gid}', {'heldOn':'2026-10-25'}, extra={'Origin':'https://evil.example'})[0], 403)
        code, result = self.request('PUT', f'/api/stats/games/{gid}', {'heldOn':'2026-10-25'})
        self.assertEqual(code, 200, result)
        changed = result['game']
        self.assertEqual(changed['heldOn'], '2026-10-25')
        for key in ('id','name','opponent','video','created'):
            self.assertEqual(changed[key], game[key])
        self.assertEqual(changed['status'], 'finished')
        self.assertEqual(changed['events'][0]['kind'], 'goal')
        self.assertEqual(changed['comments'][0]['text'], '保留这条心得')
        self.assertEqual(self.request('PUT', f'/api/stats/games/{gid}', {})[0], 400)
        # Public reads and process restarts retain the explicitly selected date.
        self.assertEqual(self.request('GET', '/api/stats', auth=False)[1]['games'][0], changed)
        reopened = API.STATS_MODULE.StatsStore(self.path)
        self.assertEqual(reopened.snapshot()['games'][0], changed)
        # Older clients may omit the date; that means unknown, never the creation day.
        undated = self.request('POST', '/api/stats/games', {'name':'尚未补日期'})[1]['game']
        self.assertEqual(undated['heldOn'], '')
        older = self.request('POST', '/api/stats/games', {**raw,'heldOn':'2024-02-29'})[1]['game']
        self.assertEqual([g['id'] for g in self.stats.snapshot()['games']], [gid, older['id'], undated['id']])

    def test_legacy_game_date_migration_does_not_guess_or_replace_creation_time(self):
        path = self.path.parent/'legacy-game.sqlite3'
        API.Store(path, SEEDS)
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE stats_games (id TEXT PRIMARY KEY,name TEXT NOT NULL,opponent TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'live',created INTEGER NOT NULL,updated INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)")
            db.execute("INSERT INTO stats_games VALUES ('old-match','历史比赛','海豚队','finished',1700000000000,1700000000000,0)")
        migrated = API.STATS_MODULE.StatsStore(path)
        game = migrated.snapshot()['games'][0]
        self.assertEqual((game['heldOn'],game['created']), ('',1700000000000))
        migrated.update_game('old-match', {'heldOn':'2023-09-03'})
        again = API.STATS_MODULE.StatsStore(path).snapshot()['games'][0]
        self.assertEqual((again['heldOn'],again['created'],again['name'],again['status']), ('2023-09-03',1700000000000,'历史比赛','finished'))
        with migrated.connect() as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_scrimmage_date_can_be_edited_independently_of_training(self):
        tid = self.request('POST', '/api/stats/trainings', {'name':'周末训练','heldOn':'2026-10-24'})[1]['training']['id']
        code, result = self.request('POST', '/api/stats/games', {'name':'训练赛','trainingId':tid,'heldOn':'2026-10-24'})
        self.assertEqual(code, 200)
        gid = result['game']['id']
        self.assertEqual(self.request('PUT', f'/api/stats/games/{gid}', {'heldOn':'2026-10-25'})[0], 200)
        snapshot = self.request('GET', '/api/stats', auth=False)[1]
        self.assertEqual(snapshot['games'], [])
        self.assertEqual(snapshot['trainings'][0]['heldOn'], '2026-10-24')
        self.assertEqual(snapshot['trainings'][0]['games'][0]['heldOn'], '2026-10-25')

    def test_revision_poll_restart_and_soft_deleted_games(self):
        thrower, receiver = self.player('疾风', 7), self.player('芒果', 3, 'female')
        game, other = self.game('第一场'), self.game('第二场', '')
        self.event(game, 'goal', thrower, receiver)
        code, data = self.request('GET', '/api/stats', auth=False)
        revision = data['revision']
        self.assertEqual([g['name'] for g in data['games']], ['第二场', '第一场'])
        code, polled = self.request('GET', f'/api/stats?revision={revision}', auth=False)
        self.assertEqual((code, polled['unchanged'], polled['revision'], polled['canEdit']), (200, True, revision, False))
        self.assertTrue(self.request('GET', f'/api/stats?revision={revision}')[1]['canEdit'])
        self.assertEqual(self.request('DELETE', f'/api/stats/games/{other}')[0], 200)
        self.assertEqual(self.request('DELETE', f'/api/stats/games/{other}')[0], 404)
        code, data = self.request('GET', f'/api/stats?revision={revision}', auth=False)
        self.assertNotIn('unchanged', data)
        self.assertEqual([g['id'] for g in data['games']], [game])
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.stats = API.STATS_MODULE.StatsStore(self.path)
        self.start()
        data = self.request('GET', '/api/stats', auth=False)[1]
        self.assertEqual(len(data['players']), 2)
        self.assertEqual([(e['kind'], e['from'], e['to']) for e in data['games'][0]['events']], [('goal', thrower, receiver)])
        self.assertEqual(self.request('POST', '/api/stats/games', {'name': ''})[0], 400)
        self.assertEqual(self.request('POST', '/api/stats/games', {'name': 'x', 'opponent': 'y' * 101})[0], 400)

    def test_deleting_games_frees_their_players(self):
        a, b = self.player('疾风', 7), self.player('芒果', 3, 'female')
        game = self.game()
        self.event(game, 'point', None, line=[a, b], start='offense')
        self.event(game, 'goal', a, b)
        self.assertEqual(self.request('DELETE', f'/api/stats/players/{a}')[0], 409)
        self.assertEqual(self.request('DELETE', f'/api/stats/games/{game}')[0], 200)
        code, data = self.request('DELETE', f'/api/stats/players/{a}')
        self.assertEqual(code, 200)
        # The soft-deleted game still holds the events, but no longer pins the roster.
        stored = API.STATS_MODULE.StatsStore(self.path)
        with stored.transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM stats_events').fetchone()[0], 2)
        self.assertEqual(self.request('DELETE', f'/api/stats/players/{b}')[0], 200)
        self.assertEqual(self.request('GET', '/api/stats', auth=False)[1]['players'], [])

    def test_player_login_review_comments_and_video_link(self):
        a, b = self.player('疾风', 7), self.player('芒果', 3, 'female')
        game = self.game('队内赛', '海豚队')
        self.assertEqual(self.exchange('POST', f'/api/stats/games/{game}/comments', {'text': '不错'}, auth=False)[0], 401)
        self.assertEqual(self.exchange('POST', f'/api/stats/games/{game}/comments', {'text': '不错'}, extra={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('POST', f'/api/stats/games/{game}/comments', {'text': '不错'})[0], 401)
        self.assertEqual(self.exchange('POST', '/api/stats/login', {'name': '不存在'}, auth=False)[0], 401)
        self.assertEqual(self.exchange('POST', '/api/stats/login', {'name': '   '}, auth=False)[0], 400)
        self.assertEqual(self.exchange('POST', '/api/stats/login', {'name': '疾风'}, auth=False, extra={'Origin': 'https://evil.example'})[0], 403)
        duplicate = self.player('疾风', 8)
        self.assertEqual(self.exchange('POST', '/api/stats/login', {'name': '疾风'}, auth=False)[0], 409)
        self.assertEqual(self.request('DELETE', f'/api/stats/players/{duplicate}')[0], 200)
        cookie = self.login('疾风')
        code, me = self.request('GET', '/api/stats', auth=False, extra={'Cookie': cookie})
        self.assertEqual((code, me['me']['number'], me['me']['name']), (200, 7, '疾风'))
        self.assertIsNone(self.request('GET', '/api/stats', auth=False)[1]['me'])
        # Each player keeps one review per game; posting again updates it.
        code, data, _ = self.exchange('POST', f'/api/stats/games/{game}/comments', {'text': '跑位偏慢，下一场练切入。'}, auth=False, extra={'Cookie': cookie})
        self.assertEqual((code, data['comment']['name'], data['comment']['number']), (200, '疾风', 7))
        for bad in [{'text': ''}, {'text': 'x' * 801}, {}]:
            self.assertEqual(self.exchange('POST', f'/api/stats/games/{game}/comments', bad, auth=False, extra={'Cookie': cookie})[0], 400, bad)
        code, _, _ = self.exchange('POST', f'/api/stats/games/{game}/comments', {'text': '补充：接盘要提前启动。'}, auth=False, extra={'Cookie': cookie})
        self.assertEqual(code, 200)
        self.exchange('POST', f'/api/stats/games/{game}/comments', {'text': '防守沟通可以更多。'}, auth=False, extra={'Cookie': self.login('芒果')})
        listed = self.request('GET', '/api/stats', auth=False)[1]['games'][0]['comments']
        self.assertEqual([c['text'] for c in listed], ['补充：接盘要提前启动。', '防守沟通可以更多。'])
        self.assertEqual([c['number'] for c in listed], [7, 3])
        self.assertEqual(self.exchange('DELETE', f'/api/stats/games/{game}/comments', auth=False, extra={'Cookie': cookie})[0], 200)
        self.assertEqual(self.exchange('DELETE', f'/api/stats/games/{game}/comments', auth=False, extra={'Cookie': cookie})[0], 404)
        self.assertEqual(len(self.request('GET', '/api/stats', auth=False)[1]['games'][0]['comments']), 1)
        # A stale identity cookie resolves to nothing once the player leaves the roster.
        gone_cookie = self.login('芒果')
        self.assertEqual(self.request('DELETE', f'/api/stats/players/{b}')[0], 200)
        self.assertIsNone(self.request('GET', '/api/stats', auth=False, extra={'Cookie': gone_cookie})[1]['me'])
        self.assertEqual(self.exchange('POST', f'/api/stats/games/{game}/comments', {'text': 'x'}, auth=False, extra={'Cookie': gone_cookie})[0], 401)
        # The surviving review keeps the frozen roster name of the departed player.
        frozen = self.request('GET', '/api/stats', auth=False)[1]['games'][0]['comments'][0]
        self.assertEqual((frozen['name'], frozen['number']), ('芒果', 3))
        # Game video is a text hyperlink, validated and returned in snapshots.
        self.assertEqual(self.request('PUT', f'/api/stats/games/{game}', {'name': 'x', 'video': 'b23.tv/abc'})[0], 400)
        code, data = self.request('PUT', f'/api/stats/games/{game}', {'name': '队内赛', 'opponent': '海豚队', 'video': ' https://b23.tv/abc '})
        self.assertEqual(data['game']['video'], 'https://b23.tv/abc')
        self.assertEqual(self.request('GET', '/api/stats', auth=False)[1]['games'][0]['video'], 'https://b23.tv/abc')

    def test_trainings_attendance_drills_scrimmage_and_reviews(self):
        a, b = self.player('疾风', 7), self.player('芒果', 3, 'female')
        code, data = self.request('POST', '/api/stats/trainings', {'name': '周二训练'})
        self.assertEqual(code, 200, data)
        tid = data['training']['id']
        self.assertEqual((data['training']['warmup'], data['training']['attendees'], data['training']['drills'], data['training']['games'], data['training']['comments']), ('', [], [], [], []))
        self.assertEqual(self.request('PUT', f'/api/stats/trainings/{tid}', {})[0], 400)
        self.assertEqual(self.request('PUT', f'/api/stats/trainings/{tid}', {'attendees': [a, a]})[0], 400)
        self.assertEqual(self.request('PUT', f'/api/stats/trainings/{tid}', {'attendees': [999]})[0], 400)
        self.assertEqual(self.request('PUT', f'/api/stats/trainings/{tid}', {'drills': ['drill-pendulum', 'drill-pendulum']})[0], 400)
        self.assertEqual(self.request('PUT', f'/api/stats/trainings/{tid}', {'drills': ['missing-drill']})[0], 400)
        code, data = self.request('PUT', f'/api/stats/trainings/{tid}', {'warmup': '动态拉伸 10 分钟', 'attendees': [a, b], 'drills': ['drill-pendulum']})
        self.assertEqual(code, 200)
        self.assertEqual((data['training']['warmup'], data['training']['attendees'], [d['name'] for d in data['training']['drills']]), ('动态拉伸 10 分钟', [a, b], ['二人钟摆']))
        # A scrimmage lives inside its training and never shows in the official game list.
        self.assertEqual(self.request('POST', '/api/stats/games', {'name': 'x', 'trainingId': 'missing'})[0], 404)
        code, data = self.request('POST', '/api/stats/games', {'name': '队内对抗', 'trainingId': tid})
        self.assertEqual(code, 200)
        scrimmage = data['game']['id']
        listed = self.request('GET', '/api/stats', auth=False)[1]
        self.assertEqual(listed['games'], [])
        self.assertEqual([g['id'] for g in listed['trainings'][0]['games']], [scrimmage])
        self.request('POST', '/api/stats/games', {'name': '正式赛'})
        self.assertEqual([g['name'] for g in self.request('GET', '/api/stats', auth=False)[1]['games']], ['正式赛'])
        # Training reviews use the player identity, same as post-game reviews.
        self.assertEqual(self.request('POST', f'/api/stats/trainings/{tid}/comments', {'text': 'x'})[0], 401)
        cookie = self.login('疾风')
        code, data, _ = self.exchange('POST', f'/api/stats/trainings/{tid}/comments', {'text': '接盘节奏有进步'}, auth=False, extra={'Cookie': cookie})
        self.assertEqual(code, 200, data)
        self.assertEqual([c['text'] for c in self.request('GET', '/api/stats', auth=False)[1]['trainings'][0]['comments']], ['接盘节奏有进步'])
        # Deleting the training removes it and its scrimmage from the snapshot.
        self.assertEqual(self.request('DELETE', f'/api/stats/trainings/{tid}')[0], 200)
        data = self.request('GET', '/api/stats', auth=False)[1]
        self.assertEqual(data['trainings'], [])
        self.assertEqual([g['name'] for g in data['games']], ['正式赛'])
        self.assertEqual(self.request('PUT', f'/api/stats/trainings/{tid}', {'warmup': 'x'})[0], 404)

    def test_tactic_library_untouched_by_stats_tables(self):
        self.player('疾风', 7)
        data = self.request('GET', '/api/tactics', auth=False)[1]
        self.assertEqual(len(data['tactics']), len(SEEDS))
        self.assertEqual(data['revision'], 1)


if __name__ == '__main__':
    unittest.main()
