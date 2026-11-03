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

    def test_edit_saved_lineup_preserves_play_and_isolates_points(self):
        (a,b,c,d,bench), tid, game = self.prepare()
        original = self.point(game,[a,b],[c,d])['event']
        goal = self.event(game,'goal',a,b)['event']
        second = self.point(game,[bench,a],[b,c])['event']
        later = self.event(game,'defense',bench)['event']
        path = f'/api/stats/games/{game}/points/{original["seq"]}'
        payload = {'sides':{'a':[a,b,d],'b':[c],'offense':'b'},'expected':original}
        self.assertEqual(self.request('PUT',path,payload,auth=False)[0],401)
        moved = {**payload,'sides':{'a':[c,d],'b':[a,b],'offense':'a'}}
        self.assertEqual(self.request('PUT',path,moved)[0],409)
        code, result = self.request('PUT',path,payload)
        self.assertEqual(code,200,result)
        saved = result['event']
        self.assertEqual((saved['seq'],saved['at'],saved['sides'],saved['start']),
                         (original['seq'],original['at'],payload['sides'],'defense'))
        self.assertEqual(self.request('PUT',path,payload)[0],409,'stale edit cannot overwrite a newer lineup')
        events=self.stats.snapshot()['trainings'][0]['games'][0]['events']
        self.assertEqual(events,[saved,goal,second,later])
        self.request('POST',f'/api/stats/games/{game}/status',{'status':'finished'})
        self.assertEqual(self.request('PUT',path,{**payload,'expected':saved})[0],409)

    def test_edit_formal_point_with_guest(self):
        (a,b,*_),_,_ = self.prepare()
        game=self.request('POST','/api/stats/games',{'name':'正式赛'})[1]['game']['id']
        base=f'/api/stats/games/{game}'
        guest=self.request('POST',base+'/guests',{'name':'外援'})[1]['guest']['id']
        point=self.event(game,'point',None,line=[a,b],start='offense')['event']
        path=base+'/points/'+str(point['seq'])
        updated=self.request('PUT',path,{'line':[a,guest],'start':'offense','expected':point})[1]['event']
        play=self.event(game,'pass',a,guest)['event']
        self.assertEqual(self.request('PUT',path,{'line':[a,b],'start':'defense','expected':updated})[0],409)
        self.assertEqual(self.stats.snapshot()['games'][0]['events'],[updated,play])

    def test_correct_past_goal_and_lineup_atomically(self):
        (a,b,c,d,bench),tid,g = self.prepare()
        point=self.point(g,[a,b],[c,d])['event']
        goal=self.event(g,'goal',a,b)['event']
        next_point=self.point(g,[a,bench],[c,d])['event']
        later=self.event(g,'pass',a,bench)['event']
        url=f'/api/stats/games/{g}/events/{goal["seq"]}'
        body={'from':a,'to':bench,'expected':goal,'expectedPoint':point}
        def events():
            return self.stats.snapshot()['trainings'][0]['games'][0]['events']
        self.assertEqual(self.request('PUT',url,body,auth=False)[0],401)
        self.assertEqual(self.request('PUT',url,{**body,'to':a})[0],400)
        self.assertEqual(self.request('PUT',url,{**body,'to':c})[0],400)
        preview=self.request('PUT',url,body)[1]['preview']
        self.assertEqual(preview,{'added':[bench],'removed':[b],'side':'a'})
        self.assertEqual(events(),[point,goal,next_point,later])
        result=self.request('PUT',url,{**body,'confirm':preview})[1]
        self.assertEqual(result['point']['sides']['a'],[a,bench])
        self.assertEqual(result['event'],{**goal,'to':bench})
        self.assertEqual(events(),[result['point'],result['event'],next_point,later])
        self.assertEqual(self.request('PUT',url,body)[0],409)
        # Reassigning a goal across teams requires explicit confirmation.
        change={'expected':result['event'],'expectedPoint':result['point'],'from':c,'to':d}
        cross=self.request('PUT',url,change)[1]['preview']
        self.assertEqual(cross,{'added':[],'removed':[],'side':'b'})
        self.assertEqual(self.request('PUT',url,{**change,'confirm':cross})[1]['event']['side'],'b')
        self.assertEqual(events()[2:],[next_point,later])
        self.request('POST',f'/api/stats/games/{g}/status',{'status':'finished'})
        self.assertEqual(self.request('PUT',url,change)[0],409)

    def test_correct_pass_with_guest_and_without_recorded_lineup(self):
        (a,b,c,_,_),_,_=self.prepare()
        g=self.request('POST','/api/stats/games',{'name':'正式赛'})[1]['game']['id']
        base=f'/api/stats/games/{g}'
        guest=self.request('POST',base+'/guests',{'name':'本场外援'})[1]['guest']['id']
        loose=self.event(g,'pass',a,b)['event']
        result=self.request('PUT',base+'/events/1',{'expected':loose,'from':guest,'to':a})[1]
        self.assertEqual(result['event'],{**loose,'from':guest,'to':a})
        self.assertIsNone(result['point'])
        p=self.event(g,'point',None,line=[a,b,c],start='offense')['event']
        old=self.event(g,'pass',a,b)['event']
        other=self.event(g,'goal',a,c)['event']
        body={'from':guest,'to':b,'expected':old,'expectedPoint':p}
        url=base+'/events/'+str(old['seq'])
        preview=self.request('PUT',url,body)[1]['preview']
        self.assertEqual(preview,{'added':[guest],'removed':[],'side':None},'keep the thrower who assisted on another play')
        saved=self.request('PUT',url,{**body,'confirm':preview})[1]
        self.assertEqual(saved['point']['line'],[a,b,c,guest])
        self.assertEqual(self.stats.snapshot()['games'][0]['events'][-1],other)
        self.assertEqual(self.request('PUT',base+'/events/'+str(p['seq']),body)[0],404)

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
