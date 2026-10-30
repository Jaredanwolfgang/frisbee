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
        snap=self.member('GET','/api/stats?revision='+str(revision),cookie=self.cb)[1]
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
