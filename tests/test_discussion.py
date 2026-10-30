import json
import sqlite3
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from email.message import Message
import test_stats_api as fixture

VIDEO=fixture.API.STATS_MODULE.VIDEO
URL='https://www.bilibili.com/video/BV1B7411m7LV?p=2'
OTHER='https://www.bilibili.com/video/BV1xx411c7mD'

class DiscussionTest(unittest.TestCase):
    setUp=fixture.StatsAPITest.setUp
    start=fixture.StatsAPITest.start
    tearDown=fixture.StatsAPITest.tearDown
    exchange=fixture.StatsAPITest.exchange
    request=fixture.StatsAPITest.request
    player=fixture.StatsAPITest.player
    login=fixture.StatsAPITest.login
    game=fixture.StatsAPITest.game

    def setup_thread(self):
        a=self.player('甲',1);b=self.player('乙',2)
        self.a,self.b=a,b;self.ca=self.login('甲');self.cb=self.login('乙')
        self.t=self.request('POST','/api/stats/trainings',{'name':'训练讨论'})[1]['training']['id']
        self.base='/api/stats/trainings/'+self.t+'/discussion'

    def post(self,text='观察',cookie=None,**extra):
        code,result=self.request('POST',self.base,{'text':text,**extra},auth=False,extra={'Cookie':cookie or self.ca})
        self.assertEqual(code,200,result)
        return result

    def test_multiple_comments_replies_avatars_legacy_and_restart(self):
        self.setup_thread()
        legacy=self.request('POST','/api/stats/trainings/'+self.t+'/comments',{'text':'历史心得'},auth=False,extra={'Cookie':self.ca})
        self.assertEqual(legacy[0],200)
        original=self.stats.snapshot()['trainings'][0]['comments'][0]
        first=self.post('新的观察')['commentId'];second=self.post('另一个观点')['commentId']
        reply=self.post('同意，再补充一个切入时机',self.cb,parentId=first)['commentId']
        messages=self.stats.snapshot()['trainings'][0]['comments']
        self.assertEqual(len(messages),4)
        self.assertEqual(messages[0]['id'],original['id'])
        self.assertEqual(messages[0]['text'],'历史心得')
        self.assertEqual(next(c for c in messages if c['id']==reply)['parentId'],first)
        self.assertTrue(all('avatar' in c and 'created' in c for c in messages))
        self.assertNotEqual(first,second)
        reopened=fixture.API.STATS_MODULE.StatsStore(self.path)
        self.assertEqual(reopened.snapshot()['trainings'][0]['comments'],messages)
        # Avatar changes use the current roster image, never a copied stale avatar URL.
        with self.stats.transaction() as db:db.execute('UPDATE stats_players SET avatar_digest=? WHERE id=?',('a'*64,self.a))
        self.assertTrue(self.stats.snapshot()['trainings'][0]['comments'][0]['avatar'].endswith('a'*64))

    def test_identity_scope_edit_delete_restore_and_parent_preservation(self):
        self.setup_thread()
        self.assertEqual(self.request('POST',self.base,{'text':'editor alone'})[0],401)
        self.assertEqual(self.request('POST',self.base,{'text':'anonymous'},auth=False)[0],401)
        self.assertEqual(self.request('POST',self.base,{'text':'cross origin'},auth=False,extra={'Cookie':self.ca,'Origin':'https://evil.example'})[0],403)
        root=self.post('原始观点')['commentId'];reply=self.post('补充',self.cb,parentId=root)['commentId']
        path=self.base+'/'+str(root)
        self.assertEqual(self.request('PUT',path,{'text':'冒名'},auth=False,extra={'Cookie':self.cb})[0],403)
        self.assertEqual(self.request('DELETE',path,auth=False,extra={'Cookie':self.cb})[0],403)
        self.assertEqual(self.request('PUT',path,{'text':'更新观点'},auth=False,extra={'Cookie':self.ca})[0],200)
        deleted=self.request('DELETE',path,auth=False,extra={'Cookie':self.ca})[1]['comments']
        self.assertEqual(next(c for c in deleted if c['id']==root)['text'],'')
        self.assertTrue(next(c for c in deleted if c['id']==root)['deleted'])
        self.assertEqual(next(c for c in deleted if c['id']==reply)['text'],'补充')
        self.assertEqual(self.request('PUT',self.base+'/'+str(reply),{'text':'根评论删除后仍可编辑补充'},auth=False,extra={'Cookie':self.cb})[0],200)
        restored=self.request('PUT',path,{'restore':True},auth=False,extra={'Cookie':self.ca})[1]['comments']
        self.assertEqual(next(c for c in restored if c['id']==root)['text'],'更新观点')
        self.assertFalse(next(c for c in restored if c['id']==root)['deleted'])
        self.assertEqual(self.request('POST',self.base,{'restore':True},auth=False,extra={'Cookie':self.ca})[0],400)

    def test_replies_are_flattened_and_cannot_cross_context(self):
        self.setup_thread();root=self.post()['commentId'];child=self.post(parentId=root)['commentId']
        result=self.post('回复一个回复',self.cb,parentId=child)
        saved=next(c for c in result['comments'] if c['id']==result['commentId'])
        self.assertEqual(saved['parentId'],root)
        self.assertEqual(saved['replyTo'],{'id':child,'player':self.a,'name':'甲','number':1})
        follow=self.post('继续回复',parentId=saved['id'])
        newest=next(c for c in follow['comments'] if c['id']==follow['commentId'])
        self.assertEqual(newest['parentId'],root)
        self.assertEqual(newest['replyTo']['id'],saved['id'])
        self.assertEqual(fixture.API.STATS_MODULE.StatsStore(self.path).snapshot()['trainings'][0]['comments'],follow['comments'])
        self.assertEqual(self.request('PUT',self.base+'/%C2%B2',{'text':'bad id'},auth=False,extra={'Cookie':self.ca})[0],404)
        gid=self.game();other='/api/stats/games/'+gid+'/discussion'
        self.assertEqual(self.request('POST',other,{'text':'wrong target','parentId':root},auth=False,extra={'Cookie':self.ca})[0],400)
        self.assertEqual(self.request('PUT',other+'/'+str(root),{'text':'wrong context'},auth=False,extra={'Cookie':self.ca})[0],404)
        for body in [{'text':'x','parentId':10**100},{'text':'x','parentId':True},{'text':''},{'text':'a'*801},[],{'text':42}]:
            self.assertEqual(self.request('POST',self.base,body,auth=False,extra={'Cookie':self.ca})[0],400)

    def test_existing_flat_replies_migrate_without_losing_target_or_rows(self):
        self.setup_thread();root=self.post('旧主评论')['commentId'];child=self.post('旧回复',self.cb,parentId=root)['commentId']
        with sqlite3.connect(self.path) as db:
            db.execute('ALTER TABLE stats_comments DROP COLUMN reply_to_id')
            db.execute('DELETE FROM stats_notifications')
        migrated=fixture.API.STATS_MODULE.StatsStore(self.path)
        messages=migrated.snapshot()['trainings'][0]['comments']
        saved=next(c for c in messages if c['id']==child)
        self.assertEqual((saved['text'],saved['parentId'],saved['replyTo']['id']),('旧回复',root,root))
        self.assertEqual(self.request('PUT',self.base+'/'+str(child),{'text':'修改旧回复'},auth=False,extra={'Cookie':self.cb})[0],200)
        self.assertEqual(migrated.notification_summary(self.a)['unread'],0,'editing legacy replies cannot backfill alerts')
        result=self.post('继续讨论',parentId=child)
        newest=next(c for c in result['comments'] if c['id']==result['commentId'])
        self.assertEqual((newest['parentId'],newest['replyTo']['id']),(root,child))
        with migrated.connect() as db:self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')

    def test_video_timestamps_validate_scope_and_remain_bound_to_the_original_video(self):
        self.setup_thread()
        game=self.request('POST','/api/stats/games',{'name':'训练赛','trainingId':self.t,'video':URL})[1]['game']
        self.assertEqual(game['videoMeta'],{'key':'BV1B7411m7LV','page':2})
        point={'gameId':game['id'],'key':'BV1B7411m7LV','seconds':85,'page':2}
        root=self.post('85秒时可以提前回切',video=point)['commentId']
        saved=next(c for c in self.stats.snapshot()['trainings'][0]['comments'] if c['id']==root)
        self.assertTrue(saved['video']['available']);self.assertEqual(saved['video']['seconds'],85)
        second=self.request('POST','/api/stats/games',{'name':'第二场对抗','trainingId':self.t,'video':OTHER})[1]['game']
        second_point={'gameId':second['id'],'key':second['videoMeta']['key'],'seconds':85,'page':3}
        second_id=self.post('第二场的同一时刻',video=second_point)['commentId']
        second_saved=next(c for c in self.stats.snapshot()['trainings'][0]['comments'] if c['id']==second_id)
        self.assertEqual((second_saved['video']['gameId'],second_saved['video']['page']),(second['id'],3))
        self.assertNotEqual(second_saved['video']['key'],saved['video']['key'])
        game_base='/api/stats/games/'+game['id']+'/discussion'
        self.assertEqual(self.request('POST',game_base,{'text':'赛后片段','video':point},auth=False,extra={'Cookie':self.ca})[0],200)
        for changes in [{'seconds':True},{'seconds':-1},{'seconds':86401},{'seconds':'1:25'},{'page':0},{'page':False}]:
            self.assertEqual(self.request('POST',self.base,{'text':'bad','video':{**point,**changes}},auth=False,extra={'Cookie':self.ca})[0],400)
        self.assertEqual(self.request('POST',self.base,{'text':'stale','video':{**point,'key':'BV1xx411c7mD'}},auth=False,extra={'Cookie':self.ca})[0],409)
        outside=self.game();self.request('PUT','/api/stats/games/'+outside,{'video':URL})
        self.assertEqual(self.request('POST',self.base,{'text':'foreign','video':{**point,'gameId':outside}},auth=False,extra={'Cookie':self.ca})[0],400)
        self.request('PUT','/api/stats/games/'+game['id'],{'video':OTHER})
        changed=next(c for c in self.stats.snapshot()['trainings'][0]['comments'] if c['id']==root)
        self.assertFalse(changed['video']['available']);self.assertEqual(changed['video']['key'],'BV1B7411m7LV')
        self.assertEqual(changed['text'],'85秒时可以提前回切')
        self.request('DELETE','/api/stats/trainings/'+self.t)
        self.assertEqual(self.request('POST',game_base,{'text':'hidden'},auth=False,extra={'Cookie':self.ca})[0],404)

    def test_multiple_inline_video_nodes_unicode_edit_restore_and_source_binding(self):
        self.setup_thread()
        first=self.request('POST','/api/stats/games',{'name':'第一场','trainingId':self.t,'video':URL})[1]['game']
        second=self.request('POST','/api/stats/games',{'name':'第二场','trainingId':self.t,'video':OTHER})[1]['game']
        body='🥏观察 0:05，补充 1:25'
        refs=[{'gameId':g['id'],'key':g['videoMeta']['key'],'seconds':n,'page':g['videoMeta']['page'],'start':body.index(label),'end':body.index(label)+len(label)} for g,n,label in [(first,5,'0:05'),(second,85,'1:25')]]
        root=self.post(body,videoRefs=refs)['commentId']
        saved=next(c for c in self.stats.snapshot()['trainings'][0]['comments'] if c['id']==root)
        self.assertIsNone(saved['video']);self.assertEqual(len(saved['videoRefs']),2)
        self.assertEqual([r['gameId'] for r in saved['videoRefs']],[first['id'],second['id']])
        self.assertTrue(all(r['available'] for r in saved['videoRefs']))
        path=self.base+'/'+str(root)
        self.assertEqual(self.request('PUT',path,{'text':'旧客户端覆盖'},auth=False,extra={'Cookie':self.ca})[0],409)
        self.assertEqual(self.request('PUT',path,{'text':body,'videoRefs':refs},auth=False,extra={'Cookie':self.cb})[0],403)
        moved=[{**r,'start':r['start']+2,'end':r['end']+2} for r in refs]
        self.assertEqual(self.request('PUT',path,{'text':'补充'+body,'videoRefs':moved},auth=False,extra={'Cookie':self.ca})[0],200)
        self.request('PUT','/api/stats/games/'+first['id'],{'video':OTHER})
        changed=next(c for c in self.stats.snapshot()['trainings'][0]['comments'] if c['id']==root)
        self.assertFalse(changed['videoRefs'][0]['available']);self.assertTrue(changed['videoRefs'][1]['available'])
        self.assertEqual(self.request('PUT',path,{'text':'补充'+body,'videoRefs':moved},auth=False,extra={'Cookie':self.ca})[0],200,'editing preserves an existing unavailable reference without retargeting it')
        self.assertEqual(self.request('POST',self.base,{'text':body,'videoRefs':refs},auth=False,extra={'Cookie':self.ca})[0],409,'new stale references are rejected')
        self.request('DELETE',path,auth=False,extra={'Cookie':self.ca})
        deleted=next(c for c in self.stats.snapshot()['trainings'][0]['comments'] if c['id']==root)
        self.assertEqual((deleted['text'],deleted['videoRefs']),('',[]))
        restored=self.request('PUT',path,{'restore':True},auth=False,extra={'Cookie':self.ca})[1]
        self.assertEqual(len(next(c for c in restored['comments'] if c['id']==root)['videoRefs']),2)
        reopened=fixture.API.STATS_MODULE.StatsStore(self.path).snapshot()['trainings'][0]['comments']
        self.assertEqual(len(next(c for c in reopened if c['id']==root)['videoRefs']),2)

    def test_inline_reference_positions_limits_and_context(self):
        self.setup_thread()
        game=self.request('POST','/api/stats/games',{'name':'视频','trainingId':self.t,'video':URL})[1]['game']
        ref={'gameId':game['id'],'key':game['videoMeta']['key'],'seconds':5,'page':2,'start':0,'end':4}
        for changes in [{'start':True},{'end':900},{'start':-1},{'seconds':6},{'page':0},{'gameId':'missing'}]:
            self.assertEqual(self.request('POST',self.base,{'text':'0:05','videoRefs':[{**ref,**changes}]},auth=False,extra={'Cookie':self.ca})[0],400,changes)
        for invalid in (None,{},[ref,ref],[ref]*21):
            self.assertEqual(self.request('POST',self.base,{'text':'0:05','videoRefs':invalid},auth=False,extra={'Cookie':self.ca})[0],400)
        self.assertEqual(self.request('POST',self.base,{'text':'0:05','videoRefs':[ref],'video':ref},auth=False,extra={'Cookie':self.ca})[0],400)
        other=self.game();self.request('PUT','/api/stats/games/'+other,{'video':URL})
        self.assertEqual(self.request('POST',self.base,{'text':'0:05','videoRefs':[{**ref,'gameId':other}]},auth=False,extra={'Cookie':self.ca})[0],400)
        self.assertEqual(self.request('POST','/api/stats/games/'+game['id']+'/discussion',{'text':'0:05','videoRefs':[ref]},auth=False,extra={'Cookie':self.ca})[0],200)

    def test_legacy_unique_summary_constraint_is_removed_without_losing_rows(self):
        path=self.path.parent/'old-review.sqlite3';fixture.API.Store(path,fixture.SEEDS)
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE stats_comments (id INTEGER PRIMARY KEY AUTOINCREMENT,game_id TEXT,training_id TEXT,player_id INTEGER NOT NULL,text TEXT NOT NULL,author_name TEXT NOT NULL,author_number INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,UNIQUE(game_id,player_id))')
            db.execute("INSERT INTO stats_comments VALUES (7,'old',NULL,1,'保留的心得','历史队员',1,1,1)")
        migrated=fixture.API.STATS_MODULE.StatsStore(path)
        with migrated.connect() as db:
            row=db.execute('SELECT * FROM stats_comments WHERE id=7').fetchone()
            self.assertEqual(row['text'],'保留的心得');self.assertIsNone(row['parent_id'])
            self.assertFalse(any(r['unique'] for r in db.execute('PRAGMA index_list(stats_comments)')))
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')

class VideoTest(unittest.TestCase):
    def test_parsing_allowlist_page_and_no_network_for_normal_links(self):
        self.assertEqual(VIDEO.parse_video(URL),{'key':'BV1B7411m7LV','page':2})
        self.assertEqual(VIDEO.parse_video('https://www.bilibili.com/video/av123?p=3'),{'key':'av123','page':3})
        for url in ['https://www.bilibili.com.evil.test/video/BV1B7411m7LV','https://evil.test/?bvid=BV1B7411m7LV','javascript:alert(1)','https://user:password@www.bilibili.com/video/BV1B7411m7LV']:
            self.assertIsNone(VIDEO.parse_video(url))
        with patch.object(VIDEO,'build_opener',side_effect=AssertionError('no network')):
            self.assertEqual(VIDEO.resolve_video(URL)['key'],'BV1B7411m7LV')
        with self.assertRaises(ValueError):VIDEO.parse_video(URL.replace('p=2','p=0'))

    def test_short_links_only_follow_allowed_https_destinations(self):
        headers=Message();headers['Location']=URL
        error=HTTPError('https://b23.tv/test',302,'redirect',headers,None)
        with patch.object(VIDEO,'build_opener') as factory:
            factory.return_value.open.side_effect=error
            self.assertEqual(VIDEO.resolve_video('https://b23.tv/test'),{'key':'BV1B7411m7LV','page':2})
        for target in ['http://127.0.0.1/private','https://evil.test/','https://www.bilibili.com:9443/video/BV1B7411m7LV']:
            headers=Message();headers['Location']=target
            with patch.object(VIDEO,'build_opener') as factory:
                factory.return_value.open.side_effect=HTTPError('https://b23.tv/test',302,'redirect',headers,None)
                with self.assertRaises(ValueError):VIDEO.resolve_video('https://b23.tv/test')
                self.assertEqual(factory.return_value.open.call_count,1)
