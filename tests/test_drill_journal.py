import unittest
import sqlite3
import test_stats_api as fixture


class DrillJournalTest(unittest.TestCase):
    setUp=fixture.StatsAPITest.setUp
    start=fixture.StatsAPITest.start
    tearDown=fixture.StatsAPITest.tearDown
    exchange=fixture.StatsAPITest.exchange
    request=fixture.StatsAPITest.request
    player=fixture.StatsAPITest.player
    login=fixture.StatsAPITest.login

    def setup_notes(self):
        self.a=self.player('甲',1);self.b=self.player('乙',2)
        self.ca=self.login('甲');self.cb=self.login('乙');self.drill='drill-pendulum'
        self.t=self.request('POST','/api/stats/trainings',{'name':'本次训练','heldOn':'2026-10-30','drills':[self.drill]})[1]['training']['id']
        self.request('PUT','/api/stats/trainings/'+self.t,{'drills':[self.drill]})
        self.note_path='/api/stats/trainings/'+self.t+'/drills/'+self.drill+'/notes'
        self.history='/api/stats/drills/'+self.drill+'/notes'

    def write(self,body,cookie=None):
        return self.request('POST',self.note_path,body,auth=False,extra={'Cookie':cookie or self.ca})

    def test_member_notes_upsert_history_dates_and_restart(self):
        self.setup_notes()
        first=self.write({'problems':'切入偏早','progress':'回传更稳'})
        self.assertEqual(first[0],200,first)
        original=first[1]['notes'][0]
        self.assertEqual(original['player'],self.a)
        self.assertEqual(self.write({'problems':'清空较慢','progress':'沟通变好了','player':self.b})[0],200)
        current=self.request('GET',self.note_path,auth=False)[1]
        self.assertEqual((len(current['notes']),current['notes'][0]['id'],current['notes'][0]['player']),(1,original['id'],self.a))
        self.assertEqual(self.write({'problems':'时机不一致','progress':''},self.cb)[0],200)
        older=self.request('POST','/api/stats/trainings',{'name':'上次训练','heldOn':'2026-10-20','drills':[self.drill]})[1]['training']['id']
        self.request('PUT','/api/stats/trainings/'+older,{'drills':[self.drill]})
        old_path='/api/stats/trainings/'+older+'/drills/'+self.drill+'/notes'
        self.assertEqual(self.request('POST',old_path,{'problems':'回传不稳','progress':''},auth=False,extra={'Cookie':self.ca})[0],200)
        history=self.request('GET',self.history,auth=False)[1]
        self.assertEqual((history['total'],history['trainingCount']),(3,2))
        self.assertEqual([r['heldOn'] for r in history['notes']],['2026-10-30','2026-10-30','2026-10-20'])
        self.assertEqual(fixture.API.STATS_MODULE.StatsStore(self.path_for_db()).drill_notes(self.drill),history)
        training=next(t for t in self.stats.snapshot()['trainings'] if t['id']==self.t)
        self.assertEqual(training['drills'][0]['noteCount'],2)
        with self.stats.transaction() as db:db.execute('UPDATE stats_players SET avatar_digest=? WHERE id=?',('a'*24,self.a))
        self.assertTrue(next(n for n in self.stats.drill_notes(self.drill)['notes'] if n['player']==self.a)['avatar'].endswith('a'*24))
        self.request('PUT','/api/stats/trainings/'+self.t,{'drills':[]})
        self.assertEqual(self.write({'problems':'x','progress':''})[0],404)
        self.assertEqual(self.request('GET',self.history,auth=False)[1]['total'],3,'removing a planned Drill does not erase recorded practice history')
        self.request('DELETE','/api/stats/trainings/'+self.t)
        self.assertEqual(self.request('GET',self.history,auth=False)[1]['total'],1)

    def path_for_db(self):
        return self.stats.path

    def test_permissions_validation_and_pagination(self):
        self.setup_notes()
        self.assertEqual(self.request('POST',self.note_path,{'problems':'x'})[0],401,'editor session alone is not a member')
        self.assertEqual(self.request('POST',self.note_path,{'problems':'x'},auth=False)[0],401)
        self.assertEqual(self.request('POST',self.note_path,{'problems':'x'},auth=False,extra={'Cookie':self.ca,'Origin':'https://evil.example'})[0],403)
        for body in ({},{'problems':' '*5},{'problems':'x'*801},{'progress':None},{'problems':[]},{'problems':5}):
            self.assertEqual(self.write(body)[0],400,body)
        self.assertEqual(self.write({'problems':'观察','progress':''})[0],200)
        for suffix in ('?offset=-1','?offset=abc','?offset=20001'):
            self.assertEqual(self.request('GET',self.history+suffix,auth=False)[0],400)
        with self.stats.transaction() as db:
            for i in range(1,36):
                tid='older-'+str(i)
                db.execute("INSERT INTO stats_trainings(id,name,created,updated,held_on,drills) VALUES (?,?,1,1,?,?)",(tid,'历史训练'+str(i),'2026-09-'+str((i%28)+1).zfill(2),'["drill-pendulum"]'))
                db.execute('INSERT INTO stats_drill_notes(training_id,drill_id,player_id,problems,progress,author_name,author_number,created,updated) VALUES (?,?,?,?,?,?,?,?,?)',(tid,self.drill,self.a,'历史观察','','甲',1,i,i))
        first=self.request('GET',self.history,auth=False)[1]
        self.assertEqual((len(first['notes']),first['nextOffset'],first['total']),(30,30,36))
        second=self.request('GET',self.history+'?offset=30',auth=False)[1]
        self.assertEqual(len(second['notes']),6);self.assertIsNone(second['nextOffset'])
        self.assertFalse(set(n['id'] for n in first['notes'])&set(n['id'] for n in second['notes']))
        with sqlite3.connect(self.stats.path) as db:self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
