"""Internal A/B scrimmages: persistence, point identity, authorization and legacy safety."""
import json
import sqlite3
import unittest
import test_stats_api as fixtures


class ScrimmageTest(unittest.TestCase):
    setUp = fixtures.StatsAPITest.setUp
    start = fixtures.StatsAPITest.start
    tearDown = fixtures.StatsAPITest.tearDown
    exchange = fixtures.StatsAPITest.exchange
    request = fixtures.StatsAPITest.request
    player = fixtures.StatsAPITest.player
    event = fixtures.StatsAPITest.event

    def prepare(self):
        players = [self.player('队员'+str(i), i) for i in range(1, 6)]
        tid = self.request('POST', '/api/stats/trainings', {'name':'周末训练'})[1]['training']['id']
        game = self.request('POST', '/api/stats/games', {'name':'队内对抗','trainingId':tid,'opponent':'不应出现的外部队伍'})[1]['game']
        self.assertEqual(game['opponent'], '')
        self.assertEqual(game['trainingId'], tid)
        return players, tid, game['id']

    def point(self, game, a, b, offense='a', expect=200):
        return self.event(game, 'point', None, expect=expect, sides={'a':a,'b':b,'offense':offense})

    def test_both_sides_record_score_undo_and_persist(self):
        (a,b,c,d,bench), tid, game = self.prepare()
        self.event(game,'pass',a,b,expect=409)
        result = self.point(game,[a,b],[c,d],'b')['event']
        self.assertEqual(result['line'],[a,b,c,d])
        self.assertEqual(result['start'],'defense')
        self.assertEqual(result['sides'],{'a':[a,b],'b':[c,d],'offense':'b'})
        path = f'/api/stats/games/{game}/events'
        self.assertEqual(self.request('POST',path,{'kind':'pass','from':a,'to':b},auth=False)[0],401)
        self.assertEqual(self.request('POST',path,{'kind':'pass','from':a,'to':b},extra={'Origin':'https://evil.example'})[0],403)
        self.event(game,'pass',a,c,expect=400)
        self.event(game,'turnover',bench,expect=400)
        self.assertEqual(self.event(game,'pass',a,b,side='b')['event']['side'],'a')
        self.assertEqual(self.event(game,'defense',c)['event']['side'],'b')
        self.assertEqual(self.event(game,'goal',c,d)['event']['side'],'b')
        self.event(game,'goal',a,b,expect=409)
        removed = self.request('DELETE',path)[1]['removed']
        self.assertEqual((removed['kind'],removed['side']),('goal','b'))
        self.event(game,'goal',a,b)
        self.point(game,[a,c],[b,d],'b')
        self.assertEqual(self.event(game,'goal',a,c)['event']['side'],'a','side is derived from this point, not a game-wide roster')
        restarted=fixtures.API.STATS_MODULE.StatsStore(self.path).snapshot()
        self.assertEqual(restarted['games'],[])
        events=restarted['trainings'][0]['games'][0]['events']
        self.assertEqual([e['side'] for e in events if e['kind']=='goal'],['a','a'])
        self.assertEqual(events[-2]['sides']['a'],[a,c])
        self.assertEqual(self.request('PUT',f'/api/stats/games/{game}',{'opponent':'外队'})[1]['game']['opponent'],'')
        self.request('POST',f'/api/stats/games/{game}/status',{'status':'finished'})
        self.point(game,[a,b],[c,d],expect=409)
        self.request('POST',f'/api/stats/games/{game}/status',{'status':'live'})
        self.request('DELETE',f'/api/stats/trainings/{tid}')
        self.point(game,[a,b],[c,d],expect=404)

    def test_lineup_validation_and_formal_game_separation(self):
        (a,b,c,d,_),tid,game=self.prepare()
        self.point(game,[a],[a],expect=400)
        self.point(game,[a,a],[b],expect=400)
        self.point(game,[],[b],expect=400)
        self.point(game,[a],[999],expect=400)
        self.point(game,[True],[b],expect=400)
        self.point(game,[a],[b],'wrong',expect=400)
        for bad in (None, [], {'a':[a],'b':[b]}, {'a':[a],'b':[b],'offense':'a','extra':True}):
            self.event(game,'point',None,expect=400,sides=bad)
        eight=[a,b,c,d]+[self.player('更多'+str(i), i) for i in range(6,10)]
        self.point(game,eight,[self.player('对侧',10)],expect=400)
        self.event(game,'point',None,expect=400,line=[a,b],start='offense')
        self.event(game,'point',None,expect=400,sides={'a':[a],'b':[b],'offense':'a'},line=[b,a],start='offense')
        formal=self.request('POST','/api/stats/games',{'name':'正式赛','opponent':'海豚队'})[1]['game']
        self.assertIsNone(formal['trainingId'])
        self.assertEqual(formal['opponent'],'海豚队')
        self.point(formal['id'],[a],[b],expect=400)
        self.event(formal['id'],'point',None,line=[a,b],start='defense')
        self.event(formal['id'],'goal',a,b)
        self.assertEqual(len(self.stats.snapshot()['games']),1)

    def test_legacy_records_migrate_without_guessing_teams(self):
        (a,b,c,d,_),tid,game=self.prepare()
        with sqlite3.connect(self.path) as db:
            # Recreate the pre-A/B event table, as found on an existing deployment.
            db.execute('DROP TABLE stats_events')
            db.execute('CREATE TABLE stats_events (game_id TEXT NOT NULL,seq INTEGER NOT NULL,kind TEXT NOT NULL,from_id INTEGER,to_id INTEGER,line TEXT,start TEXT,created INTEGER NOT NULL,PRIMARY KEY(game_id,seq))')
            db.execute('INSERT INTO stats_events VALUES (?,?,?,?,?,?,?,?)',(game,1,'point',None,None,json.dumps([a,b]),'offense',100))
            db.execute('INSERT INTO stats_events VALUES (?,?,?,?,?,?,?,?)',(game,2,'goal',a,b,None,None,101))
        migrated=fixtures.API.STATS_MODULE.StatsStore(self.path)
        old=migrated.snapshot()['trainings'][0]['games'][0]['events']
        self.assertEqual(old[0]['line'],[a,b])
        self.assertEqual(old[1]['kind'],'goal')
        self.assertNotIn('sides',old[0])
        self.assertNotIn('side',old[1])
        self.event(game,'pass',a,b,expect=409)
        self.point(game,[a,b],[c,d])
        self.event(game,'goal',a,b)
        events=migrated.snapshot()['trainings'][0]['games'][0]['events']
        self.assertEqual(events[:2],old)
        self.assertEqual(events[-1]['side'],'a')
