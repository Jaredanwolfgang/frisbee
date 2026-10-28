import base64
import hashlib
import hmac
import http.client
import io
import json
import sqlite3
import time
import unittest

from PIL import Image
import test_stats_api as fixture


class TeamAPITest(unittest.TestCase):
    setUp = fixture.StatsAPITest.setUp
    start = fixture.StatsAPITest.start
    tearDown = fixture.StatsAPITest.tearDown
    exchange = fixture.StatsAPITest.exchange
    request = fixture.StatsAPITest.request
    player = fixture.StatsAPITest.player
    login = fixture.StatsAPITest.login

    def test_credentials_are_independent_and_password_reset_revokes_sessions(self):
        pid = self.player('队员甲', 12)
        self.assertEqual(self.request('POST','/api/stats/login',{'name':'队员甲'},auth=False)[0],401)
        profile=self.stats.snapshot()['players'][0]
        for password in [None,False,8,'short','        ']:
            self.assertEqual(self.request('PUT',f'/api/stats/players/{pid}',{**profile,'password':password})[0],400)
        cookie = self.login('队员甲')
        me = self.request('GET','/api/stats',auth=False,extra={'Cookie':cookie})[1]
        self.assertFalse(me['canEdit'])
        self.assertEqual(me['me']['id'],pid)
        self.assertEqual(self.request('POST','/api/stats/trainings',{'name':'无权创建'},auth=False,extra={'Cookie':cookie})[0],401)
        profile = next(p for p in me['players'] if p['id']==pid)
        self.assertNotIn('password_hash',profile)
        self.assertNotIn('auth_version',profile)
        self.assertNotIn('fixture-player-password',json.dumps(me))
        self.assertEqual(self.request('PUT','/api/stats/me',{'number':88},auth=False,extra={'Cookie':cookie})[0],400)
        self.assertEqual(self.request('PUT','/api/stats/me',{'password':'new-player-code','currentPassword':'wrong'},auth=False,extra={'Cookie':cookie})[0],401)
        code,data=self.request('PUT','/api/stats/me',{'password':'new-player-code','currentPassword':'fixture-player-password'},auth=False,extra={'Cookie':cookie})
        self.assertEqual(code,200,data)
        self.assertIsNone(self.request('GET','/api/stats',auth=False,extra={'Cookie':cookie})[1]['me'])
        self.assertEqual(self.request('POST','/api/stats/login',{'name':'12','password':'new-player-code'},auth=False)[0],200)
        self.assertEqual(self.request('PUT',f'/api/stats/players/{pid}',{**profile,'password':'admin-reset-code'})[0],200)
        self.assertEqual(self.request('POST','/api/stats/login',{'name':'12','password':'new-player-code'},auth=False)[0],401)
        self.assertEqual(self.request('POST','/api/stats/login',{'name':'12','password':'admin-reset-code'},auth=False)[0],200)
        stamp=str(int(time.time()))
        signature=hmac.new(fixture.KEY.encode(),('player:'+str(pid)+':'+stamp).encode(),hashlib.sha256).hexdigest()
        legacy='frisbee_player='+str(pid)+'.'+stamp+'.'+signature
        self.assertIsNone(self.request('GET','/api/stats',auth=False,extra={'Cookie':legacy})[1]['me'])

    def test_login_rate_limit_and_origin_checks(self):
        self.player('队员甲',12)
        for _ in range(8):
            self.assertEqual(self.request('POST','/api/stats/login',{'name':'12','password':'incorrect'},auth=False)[0],401)
        self.assertEqual(self.request('POST','/api/stats/login',{'name':'12','password':'incorrect'},auth=False)[0],429)
        self.assertEqual(self.request('POST','/api/stats/logout',{},auth=False,extra={'Origin':'https://evil.example'})[0],403)

    def test_avatar_is_reencoded_compressed_persistent_and_self_only(self):
        pid=self.player('队员甲',12)
        other=self.player('队员乙',13)
        cookie=self.login('队员甲')
        original=Image.new('RGB',(1800,1200),(120,170,210))
        exif=Image.Exif();exif[271]='Private test camera'
        payload=io.BytesIO();original.save(payload,format='PNG',exif=exif)
        body={'avatar':base64.b64encode(payload.getvalue()).decode()}
        self.assertEqual(self.request('PUT','/api/stats/me',body,auth=False)[0],401)
        self.assertEqual(self.request('PUT','/api/stats/me',body,auth=False,extra={'Cookie':cookie,'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('PUT','/api/stats/me',{**body,'id':other},auth=False,extra={'Cookie':cookie})[0],400)
        code,result=self.request('PUT','/api/stats/me',body,auth=False,extra={'Cookie':cookie})
        self.assertEqual(code,200,result)
        url='/'+result['player']['avatar']
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        connection.request('GET',url)
        response=connection.getresponse();image=response.read()
        self.assertEqual(response.status,200)
        self.assertEqual(response.getheader('Content-Type'),'image/jpeg')
        self.assertEqual(response.getheader('X-Content-Type-Options'),'nosniff')
        self.assertLess(len(image),100000)
        with Image.open(io.BytesIO(image)) as decoded:
            self.assertEqual(decoded.size,(256,256))
            self.assertFalse(decoded.getexif())
        connection.close()
        self.assertNotIn(b'Private test camera',image)
        reopened=fixture.API.STATS_MODULE.StatsStore(self.path)
        self.assertEqual(next(p for p in reopened.snapshot()['players'] if p['id']==pid)['avatar'],result['player']['avatar'])
        self.assertEqual(next(p for p in reopened.snapshot()['players'] if p['id']==other)['avatar'],'')
        for value in ['not-base64',base64.b64encode(b'<svg onload="alert(1)"></svg>').decode(),'x'*2800001]:
            self.assertEqual(self.request('PUT','/api/stats/me',{'avatar':value},auth=False,extra={'Cookie':cookie})[0],400)

    def test_training_calendar_and_join_dates(self):
        pid=self.player('队员甲',12)
        profile=self.stats.snapshot()['players'][0]
        self.assertEqual(self.request('PUT',f'/api/stats/players/{pid}',{**profile,'joinedOn':'2026-02-30'})[0],400)
        self.assertEqual(self.request('PUT',f'/api/stats/players/{pid}',{**profile,'joinedOn':'2026-10-01'})[0],200)
        code,created=self.request('POST','/api/stats/trainings',{'name':'周末训练','heldOn':'2026-10-31'})
        self.assertEqual(code,200)
        training=created['training']
        self.assertEqual(training['status'],'planned')
        self.assertEqual(training['heldOn'],'2026-10-31')
        for body in [{'heldOn':'bad'},{'status':'unknown'}]:
            self.assertEqual(self.request('PUT','/api/stats/trainings/'+training['id'],body)[0],400)
        self.assertEqual(self.request('PUT','/api/stats/trainings/'+training['id'],{'status':'completed'})[0],200)
        self.assertEqual(self.stats.snapshot()['players'][0]['joinedOn'],'2026-10-01')

    def test_legacy_roster_and_reviews_migrate_without_enabling_name_only_login(self):
        legacy=self.path.parent/'legacy.sqlite3'
        fixture.API.Store(legacy,fixture.SEEDS)
        with sqlite3.connect(legacy) as db:
            db.execute("CREATE TABLE stats_players (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,number INTEGER NOT NULL,gender TEXT NOT NULL DEFAULT '',updated INTEGER NOT NULL)")
            db.execute("INSERT INTO stats_players VALUES (1,'历史队员',7,'male',1700000000000)")
            db.execute('CREATE TABLE stats_comments (id INTEGER PRIMARY KEY AUTOINCREMENT,game_id TEXT NOT NULL,player_id INTEGER NOT NULL,text TEXT NOT NULL,author_name TEXT NOT NULL,author_number INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,UNIQUE(game_id,player_id))')
            db.execute("INSERT INTO stats_comments VALUES (1,'old-game',1,'历史心得','历史队员',7,1700000000000,1700000000000)")
        upgraded=fixture.API.STATS_MODULE.StatsStore(legacy)
        player=upgraded.snapshot()['players'][0]
        self.assertEqual((player['name'],player['joinedOn'],player['loginReady']),('历史队员','',False))
        with upgraded.connect() as db:
            self.assertEqual(db.execute('SELECT text FROM stats_comments').fetchone()[0],'历史心得')
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        self.assertIsNone(upgraded.identity_version(1))
