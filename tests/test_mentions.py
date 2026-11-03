import unittest
import test_stats_api as fixture

class MentionTest(unittest.TestCase):
    setUp=fixture.StatsAPITest.setUp
    start=fixture.StatsAPITest.start
    tearDown=fixture.StatsAPITest.tearDown
    exchange=fixture.StatsAPITest.exchange
    request=fixture.StatsAPITest.request
    player=fixture.StatsAPITest.player
    login=fixture.StatsAPITest.login

    def setup_mentions(self):
        self.a=self.player('甲',1);self.b=self.player('乙',2)
        self.ca=self.login('甲');self.cb=self.login('乙')
        self.t=self.request('POST','/api/stats/trainings',{'name':'提及训练','heldOn':'2026-10-30'})[1]['training']['id']
        self.base='/api/stats/trainings/'+self.t+'/discussion'

    def member(self,method,path,body=None,cookie=None):
        return self.request(method,path,body,auth=False,extra={'Cookie':cookie or self.ca})

    def body(self,text='请 @乙 补充',start=2,end=4,pid=None):
        return {'text':text,'mentions':[{'player':pid or self.b,'start':start,'end':end}],'videoRefs':[]}

    def test_private_discussions_across_all_three_contexts(self):
        self.setup_mentions()
        third = self.player('丙', 3)
        outsider = self.login('丙')
        formal = self.request('POST', '/api/stats/games', {'name':'正式赛'})[1]['game']['id']
        scrim = self.request('POST', '/api/stats/games', {'name':'对抗', 'trainingId':self.t})[1]['game']['id']
        for path in (self.base, '/api/stats/games/'+formal+'/discussion', '/api/stats/games/'+scrim+'/discussion'):
            with self.subTest(path=path):
                public_id = self.member('POST',path,{'text':'公开讨论'},cookie=outsider)[1]['commentId']
                raw = {**self.body(), 'private':True, 'parentId':public_id}
                code, result = self.member('POST',path,raw)
                self.assertEqual(code,200,result)
                cid = result['commentId']
                self.assertEqual(result['comments'][-1]['privateAudience'],sorted([self.a,self.b]))
                code, reply = self.member('POST',path,{'text':'只有参与人可以读到的回复','parentId':cid},cookie=self.cb)
                self.assertEqual(code,200,reply)
                self.assertEqual(reply['comments'][-1]['privateAudience'], sorted([self.a,self.b]))
                self.assertEqual(self.member('POST',path,{'text':'猜编号','parentId':cid},cookie=outsider)[0],400)
                self.assertEqual(self.member('PUT',path+'/'+str(cid),{'text':'猜编号'},cookie=outsider)[0],404)
                self.assertEqual(self.member('POST',path,{**self.body('@丙',0,2,third),'parentId':cid},cookie=self.cb)[0],400)
                self.assertEqual(self.member('POST',path,{'private':True,'text':'@乙'},cookie=self.ca)[0],400)
                self.assertEqual(self.member('PUT',path+'/'+str(cid),{**self.body(),'private':False})[0],409)
                self.assertEqual(self.member('PUT',path+'/'+str(cid),{'text':'移除提及','mentions':[]})[0],400)
                self.assertEqual(self.member('POST',path,{**raw,'expectedPlayer':self.a},cookie=self.cb)[0],409)

                other_result = self.member('POST',path,{'text':'公开跟进'},cookie=outsider)[1]
                self.assertNotIn(cid,[c['id'] for c in other_result['comments']])
        def all_comments(snapshot):
            containers = snapshot['games'] + snapshot['trainings']
            return [c for item in containers + [g for t in snapshot['trainings'] for g in t['games']] for c in item['comments']]
        mine = self.member('GET','/api/stats')[1]
        for cookie in (self.ca,self.cb):
            visible = all_comments(self.member('GET','/api/stats',cookie=cookie)[1])
            self.assertEqual(len([c for c in visible if c['privateAudience']]),6)
        # No data revision changed, but a recipient's cached payload must be replaced on logout/switch.
        stale = '/api/stats?revision='+str(mine['revision'])+'&viewer='+str(self.a)
        for outsider_snapshot in (self.request('GET',stale,auth=False)[1],self.request('GET',stale)[1],
                                  self.member('GET',stale,cookie=outsider)[1]):
            visible = all_comments(outsider_snapshot)
            self.assertEqual(len(visible),6)
            self.assertFalse(any(c['privateAudience'] for c in visible))
        self.assertEqual(self.stats.notifications(third)['messages'],[])
        self.assertEqual(self.stats.notification_summary(third)['unread'],0)
        self.assertEqual(len(self.stats.notifications(self.b)['messages']),3)
        self.assertEqual(len(self.stats.notifications(self.a)['messages']),3)
        reopened = fixture.API.STATS_MODULE.StatsStore(self.path)
        self.assertEqual(len(all_comments(reopened.snapshot())),6)
        self.assertEqual(len(all_comments(reopened.snapshot(viewer=self.b))),12)

    def test_private_root_and_narrower_reply_audience(self):
        self.setup_mentions()
        third = self.player('丙',3)
        root = self.member('POST',self.base,{
            'text':'@乙 @丙', 'private':True,
            'mentions':[{'player':self.b,'start':0,'end':2},{'player':third,'start':3,'end':5}]
        })[1]['commentId']
        limited = self.member('POST',self.base,{**self.body(),'private':True,'parentId':root})[1]['commentId']
        self.assertEqual(self.stats.snapshot()['trainings'][0]['comments'],[])
        c_rows = self.stats.snapshot(viewer=third)['trainings'][0]['comments']
        self.assertEqual([c['id'] for c in c_rows],[root])
        self.assertEqual([m['commentId'] for m in self.stats.notifications(third)['messages']],[root])
        self.assertEqual(self.member('DELETE',self.base+'/'+str(limited))[0],200)
        self.assertEqual(self.member('PUT',self.base+'/'+str(limited),{'restore':True})[0],200)
        self.assertEqual(len(self.stats.snapshot(viewer=self.b)['trainings'][0]['comments']),2)
        self.assertEqual(len(self.stats.snapshot(viewer=third)['trainings'][0]['comments']),1)
        self.assertEqual(self.stats.snapshot()['trainings'][0]['comments'],[])

    def test_notification_private_persistent_and_mark_read_without_revision_change(self):
        self.setup_mentions()
        result=self.member('POST',self.base,self.body());self.assertEqual(result[0],200,result)
        self.assertEqual(self.request('GET','/api/stats/notifications')[0],401)
        self.assertEqual(self.member('GET','/api/stats/notifications')[1]['messages'],[])
        inbox=self.member('GET','/api/stats/notifications',cookie=self.cb)[1]
        self.assertEqual(inbox['summary']['unread'],1);message=inbox['messages'][0]
        self.assertEqual(message['trainingId'],self.t)
        revision=self.stats.snapshot()['revision']
        self.assertEqual(self.member('POST','/api/stats/notifications/read',{'id':message['id']})[1]['summary']['unread'],0)
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],1,'cannot mark another member messages read')
        result=self.member('POST','/api/stats/notifications/read',{'trainingId':self.t},cookie=self.cb)
        self.assertEqual(result[1]['summary']['unread'],0)
        snap=self.member('GET',f'/api/stats?revision={revision}&viewer={self.b}',cookie=self.cb)[1]
        self.assertTrue(snap['unchanged']);self.assertEqual(snap['notifications']['unread'],0)
        self.assertEqual(fixture.API.STATS_MODULE.StatsStore(self.path).notifications(self.b)['messages'][0]['unread'],False)
        cid=message['commentId']
        self.assertEqual(self.member('PUT',self.base+'/'+str(cid),self.body('请 @乙 再补充'))[0],200)
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],0,'ordinary edit does not notify twice')
        self.assertEqual(self.member('PUT',self.base+'/'+str(cid),{'text':'取消提及','mentions':[],'videoRefs':[]})[0],200)
        self.assertEqual(self.stats.notifications(self.b)['messages'],[])
        self.member('PUT',self.base+'/'+str(cid),self.body())
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],1)
        self.member('DELETE',self.base+'/'+str(cid))
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],0)
        self.member('PUT',self.base+'/'+str(cid),{'restore':True})
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],1)
        self.request('DELETE','/api/stats/trainings/'+self.t)
        self.assertEqual(self.stats.notifications(self.b)['messages'],[])

    def test_validation_unicode_deduplication_and_origin(self):
        self.setup_mentions()
        for bad in (self.body(pid=True),self.body(start=-1),self.body(end=50),self.body(text='请 @丙 补充'),{'text':'hi','mentions':'bad'}):
            self.assertEqual(self.member('POST',self.base,bad)[0],400,bad)
        body={'text':'🥏 @乙 @乙','videoRefs':[],'mentions':[{'player':self.b,'start':2,'end':4},{'player':self.b,'start':5,'end':7}]}
        self.assertEqual(self.member('POST',self.base,body)[0],200)
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],1,'one notification per recipient per comment')
        self.assertEqual(self.request('POST','/api/stats/notifications/read',{'all':True},False,{'Cookie':self.cb,'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.member('POST','/api/stats/notifications/read',{'id':True},cookie=self.cb)[0],400)

    def test_training_scrimmage_and_formal_match_mentions_have_distinct_routes_and_read_states(self):
        self.setup_mentions()
        scrim=self.request('POST','/api/stats/games',{'name':'训练赛一','trainingId':self.t})[1]['game']['id']
        formal=self.request('POST','/api/stats/games',{'name':'正式比赛','heldOn':'2026-10-29'})[1]['game']['id']
        paths=[self.base,'/api/stats/games/'+scrim+'/discussion','/api/stats/games/'+formal+'/discussion']
        for path in paths:
            response=self.member('POST',path,self.body());self.assertEqual(response[0],200,response)
        summary=self.stats.notification_summary(self.b)
        self.assertEqual(summary,{'unread':3,'trainings':{self.t:2},'trainingComments':{self.t:1},'games':{scrim:1,formal:1}})
        messages=self.member('GET','/api/stats/notifications',cookie=self.cb)[1]['messages']
        practice=next(m for m in messages if m['gameId']==scrim)
        match=next(m for m in messages if m['gameId']==formal)
        self.assertEqual((practice['trainingId'],practice['gameName'],practice['heldOn']),(self.t,'训练赛一','2026-10-30'))
        self.assertIsNone(match['trainingId']);self.assertEqual(match['gameName'],'正式比赛')
        self.assertEqual(self.member('POST','/api/stats/notifications/read',{'gameId':scrim})[1]['summary']['unread'],0,'sender cannot change receiver read state')
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],3)
        self.member('POST','/api/stats/notifications/read',{'trainingId':self.t},cookie=self.cb)
        summary=self.stats.notification_summary(self.b)
        self.assertEqual(summary['unread'],2);self.assertEqual(summary['trainingComments'],{});self.assertEqual(summary['games'],{scrim:1,formal:1})
        self.member('POST','/api/stats/notifications/read',{'gameId':scrim},cookie=self.cb)
        summary=self.stats.notification_summary(self.b)
        self.assertEqual(summary['unread'],1);self.assertEqual(summary['trainings'],{});self.assertEqual(summary['games'],{formal:1})
        self.member('POST','/api/stats/notifications/read',{'gameId':formal},cookie=self.cb)
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],0)
        self.assertEqual(self.member('POST','/api/stats/notifications/read',{'gameId':True},cookie=self.cb)[0],400)

    def test_game_notifications_hide_deleted_contexts_and_survive_reopen(self):
        self.setup_mentions()
        scrim=self.request('POST','/api/stats/games',{'name':'训练对抗','trainingId':self.t})[1]['game']['id']
        formal=self.request('POST','/api/stats/games',{'name':'正式比赛'})[1]['game']['id']
        for gid in [scrim,formal]:
            self.assertEqual(self.member('POST','/api/stats/games/'+gid+'/discussion',self.body())[0],200)
        self.assertEqual(fixture.API.STATS_MODULE.StatsStore(self.path).notification_summary(self.b)['unread'],2)
        self.request('DELETE','/api/stats/trainings/'+self.t)
        messages=self.stats.notifications(self.b)['messages']
        self.assertEqual(len(messages),1);self.assertEqual(messages[0]['gameId'],formal)
        self.request('DELETE','/api/stats/games/'+formal)
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],0)
        self.assertEqual(self.stats.notifications(self.b)['messages'],[])

    def test_direct_and_targeted_replies_notify_only_the_recipient_and_deduplicate_mentions(self):
        self.setup_mentions()
        third=self.player('丙',3);cc=self.login('丙')
        root=self.member('POST',self.base,{'text':'原观点'})[1]['commentId']
        response=self.member('POST',self.base,{'text':'回复 @甲','parentId':root,'mentions':[{'player':self.a,'start':3,'end':5}]},cookie=self.cb)
        self.assertEqual(response[0],200,response)
        child=response[1]['commentId']
        inbox=self.stats.notifications(self.a)
        self.assertEqual(inbox['summary']['unread'],1,'reply plus mention generates only one message')
        self.assertEqual((inbox['messages'][0]['commentId'],inbox['messages'][0]['type']),(child,'reply'))
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],0,'no self notifications')
        body={'text':'回应 @丙','parentId':child,'mentions':[{'player':third,'start':3,'end':5}]}
        follow=self.member('POST',self.base,body)[1]['commentId']
        reply=next(c for c in self.stats.snapshot()['trainings'][0]['comments'] if c['id']==follow)
        self.assertEqual((reply['parentId'],reply['replyTo']['id']),(root,child))
        self.assertEqual(self.stats.notifications(self.b)['messages'][0]['type'],'reply')
        self.assertEqual(self.stats.notifications(third)['messages'][0]['type'],'mention')
        self.assertEqual(self.stats.notification_summary(self.a)['unread'],1,'replying to someone else does not notify the root author again')
        self.member('POST','/api/stats/notifications/read',{'all':True},cookie=self.cb)
        self.member('PUT',self.base+'/'+str(follow),{'text':'更新回应','mentions':[]})
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],0,'editing cannot create duplicate reply alerts')
        self.assertEqual(len(self.stats.notifications(self.b)['messages']),1,'removing mentions retains the reply notification')
        self.assertEqual(self.stats.notifications(third)['messages'],[])
        self.member('DELETE',self.base+'/'+str(follow))
        self.assertEqual(self.stats.notifications(self.b)['messages'],[])
        self.member('PUT',self.base+'/'+str(follow),{'restore':True})
        self.assertFalse(self.stats.notifications(self.b)['messages'][0]['unread'],'restoring a read reply preserves read state')
        self.member('DELETE',self.base+'/'+str(child),cookie=self.cb)
        self.assertEqual(self.member('POST',self.base,{'text':'不能回复已删除内容','parentId':child},cookie=cc)[0],400)
        self.assertEqual(self.member('PUT',self.base+'/'+str(follow),{'text':'对方删除评论后仍可编辑自己的回复'})[0],200)
        reopened=fixture.API.STATS_MODULE.StatsStore(self.path)
        self.assertEqual(reopened.notifications(self.b)['messages'][0]['type'],'reply')

    def test_reply_alerts_follow_training_scrimmage_and_formal_match_read_scopes(self):
        self.setup_mentions()
        scrim=self.request('POST','/api/stats/games',{'name':'队内对抗','trainingId':self.t})[1]['game']['id']
        formal=self.request('POST','/api/stats/games',{'name':'正式比赛'})[1]['game']['id']
        for path in [self.base,'/api/stats/games/'+scrim+'/discussion','/api/stats/games/'+formal+'/discussion']:
            root=self.member('POST',path,{'text':'我的观察'},cookie=self.cb)[1]['commentId']
            response=self.member('POST',path,{'text':'队友回复','parentId':root})
            self.assertEqual(response[0],200,response)
        self.assertEqual(self.stats.notification_summary(self.b),{'unread':3,'trainings':{self.t:2},'trainingComments':{self.t:1},'games':{scrim:1,formal:1}})
        self.assertTrue(all(m['type']=='reply' for m in self.stats.notifications(self.b)['messages']))
        self.member('POST','/api/stats/notifications/read',{'trainingId':self.t},cookie=self.cb)
        self.assertEqual(self.stats.notification_summary(self.b)['games'],{scrim:1,formal:1})
        self.member('POST','/api/stats/notifications/read',{'gameId':scrim},cookie=self.cb)
        self.assertEqual(self.stats.notification_summary(self.b)['trainings'],{})
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],1)
        self.member('POST','/api/stats/notifications/read',{'gameId':formal},cookie=self.cb)
        self.assertEqual(self.stats.notification_summary(self.b)['unread'],0)
