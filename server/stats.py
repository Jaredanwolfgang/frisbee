"""Team roster and live game statistics. Python stdlib + SQLite; Pillow normalizes avatar uploads."""
from contextlib import contextmanager
from pathlib import Path
import json
import hashlib
import importlib.util
from datetime import datetime, timezone
import re
import sqlite3
import time
import uuid

TEAM_SPEC = importlib.util.spec_from_file_location('frisbee_team', Path(__file__).with_name('team.py'))
TEAM = importlib.util.module_from_spec(TEAM_SPEC)
TEAM_SPEC.loader.exec_module(TEAM)

MAX_PLAYERS = 40
MAX_GAMES = 300
MAX_EVENTS = 600
MAX_LINE = 14
MAX_COMMENT = 800
MAX_TRAININGS = 200
MAX_WARMUP = 2000
MAX_DRILLS = 20
EVENT_KINDS = {'pass', 'goal', 'turnover', 'defense', 'point'}
GAME_STATUS = {'live', 'finished'}
POINT_START = {'offense', 'defense'}
GENDERS = {'male', 'female'}
GAME_ID = re.compile(r'^[A-Za-z0-9_-]{1,64}$')
TACTIC_ID = re.compile(r'^[A-Za-z0-9_-]{1,149}$')


class StatsError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def text(value, limit, label, required=True):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise StatsError(400, f'{label}需为 1–{limit} 字。')
    return value.strip()


def player_fields(raw):
    if not isinstance(raw, dict):
        raise StatsError(400, '队员信息格式无效。')
    number = raw.get('number')
    if type(number) is not int or not 0 <= number <= 99:
        raise StatsError(400, '号码需为 0–99 的整数。')
    gender = raw.get('gender')
    if gender not in GENDERS:
        raise StatsError(400, '请选择队员性别。')
    return text(raw.get('name'), 24, '盘名'), number, gender


def player_id(value):
    if type(value) is not int or not 1 <= value <= 2 ** 31:
        raise StatsError(400, '队员编号无效。')
    return value


def video_link(value):
    value = text(value, 500, '录像链接', required=False)
    if value and not value.startswith(('http://', 'https://')):
        raise StatsError(400, '录像链接需以 http:// 或 https:// 开头。')
    return value


def id_values(raw, key, low, high, label):
    values = raw.get(key)
    if not isinstance(values, list) or not low <= len(values) <= high:
        raise StatsError(400, f'{label}数量需为 {low}–{high}。')
    out = []
    for value in values:
        pid = player_id(value)
        if pid in out:
            raise StatsError(400, f'{label}有重复。')
        out.append(pid)
    return out


def line_ids(raw):
    values = raw.get('line')
    if not isinstance(values, list) or not 1 <= len(values) <= MAX_LINE:
        raise StatsError(400, f'请选择这一分的上场队员（1–{MAX_LINE} 人）。')
    line = []
    for value in values:
        pid = player_id(value)
        if pid in line:
            raise StatsError(400, '上场队员重复。')
        line.append(pid)
    return line


class StatsStore:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS stats_players (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, number INTEGER NOT NULL, gender TEXT NOT NULL DEFAULT \'\', updated INTEGER NOT NULL)')
            db.execute("CREATE TABLE IF NOT EXISTS stats_games (id TEXT PRIMARY KEY, name TEXT NOT NULL, opponent TEXT NOT NULL DEFAULT '', video TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'live', created INTEGER NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)")
            db.execute('CREATE TABLE IF NOT EXISTS stats_events (game_id TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, from_id INTEGER, to_id INTEGER, line TEXT, start TEXT, created INTEGER NOT NULL, PRIMARY KEY (game_id, seq))')
            db.execute('CREATE TABLE IF NOT EXISTS stats_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT, training_id TEXT, player_id INTEGER NOT NULL, text TEXT NOT NULL, author_name TEXT NOT NULL, author_number INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS stats_trainings (id TEXT PRIMARY KEY, name TEXT NOT NULL, warmup TEXT NOT NULL DEFAULT \'\', attendees TEXT NOT NULL DEFAULT \'[]\', drills TEXT NOT NULL DEFAULT \'[]\', created INTEGER NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)')
            # Older databases keep their rows; new columns are added in place.
            for statement in ("ALTER TABLE stats_players ADD COLUMN gender TEXT NOT NULL DEFAULT ''",
                              'ALTER TABLE stats_events ADD COLUMN line TEXT',
                              'ALTER TABLE stats_events ADD COLUMN start TEXT',
                              'ALTER TABLE stats_games ADD COLUMN video TEXT NOT NULL DEFAULT \'\'',
                              'ALTER TABLE stats_games ADD COLUMN training_id TEXT',
                              'ALTER TABLE stats_comments ADD COLUMN training_id TEXT'):
                try:
                    db.execute(statement)
                except sqlite3.OperationalError:
                    pass
            additions = [
                "ALTER TABLE stats_players ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE stats_players ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1",
                "ALTER TABLE stats_players ADD COLUMN joined_on TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE stats_players ADD COLUMN avatar_digest TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE stats_trainings ADD COLUMN held_on TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE stats_trainings ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'",
            ]
            for statement in additions:
                try:
                    db.execute(statement)
                except sqlite3.OperationalError:
                    pass
            db.execute("UPDATE stats_trainings SET held_on=strftime('%Y-%m-%d',created/1000,'unixepoch') WHERE held_on=''")
            db.execute('CREATE TABLE IF NOT EXISTS stats_avatars (player_id INTEGER PRIMARY KEY, digest TEXT NOT NULL, image BLOB NOT NULL)')
            # Databases created before training reviews declare game_id NOT NULL;
            # rebuild the table so training comments can leave game_id empty.
            columns = {r['name']: r['notnull'] for r in db.execute('PRAGMA table_info(stats_comments)')}
            if columns.get('game_id'):
                db.execute('CREATE TABLE stats_comments_fixed (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT, training_id TEXT, player_id INTEGER NOT NULL, text TEXT NOT NULL, author_name TEXT NOT NULL, author_number INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL)')
                db.execute('INSERT INTO stats_comments_fixed(id,game_id,training_id,player_id,text,author_name,author_number,created,updated) SELECT id,game_id,training_id,player_id,text,author_name,author_number,created,updated FROM stats_comments')
                db.execute('DROP TABLE stats_comments')
                db.execute('ALTER TABLE stats_comments_fixed RENAME TO stats_comments')
            db.execute("INSERT OR IGNORE INTO metadata VALUES ('stats_revision', 1)")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA busy_timeout=10000')
        return db

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def revision(db, bump=False):
        if bump:
            db.execute("UPDATE metadata SET value=value+1 WHERE key='stats_revision'")
        return db.execute("SELECT value FROM metadata WHERE key='stats_revision'").fetchone()[0]

    @staticmethod
    def now():
        return int(time.time() * 1000)

    @staticmethod
    def player(row):
        return {'id': row['id'], 'name': row['name'], 'number': row['number'], 'gender': row['gender'], 'updated': row['updated'],
                'joinedOn': row['joined_on'], 'loginReady': bool(row['password_hash']),
                'avatar': ('api/stats/avatars/'+str(row['id'])+'/'+row['avatar_digest']) if row['avatar_digest'] else ''}

    @staticmethod
    def event(row):
        out = {'seq': row['seq'], 'kind': row['kind'], 'from': row['from_id'], 'to': row['to_id'], 'at': row['created']}
        if row['kind'] == 'point':
            try:
                out['line'] = json.loads(row['line'] or '[]')
            except ValueError:
                out['line'] = []
            out['start'] = row['start'] or 'offense'
        return out

    @staticmethod
    def comment(row):
        return {'player': row['player_id'], 'text': row['text'], 'at': row['updated'],
                'name': row['p_name'] if row['p_name'] is not None else row['author_name'],
                'number': row['p_number'] if row['p_number'] is not None else row['author_number']}

    def game(self, db, row):
        events = db.execute('SELECT * FROM stats_events WHERE game_id=? ORDER BY seq', (row['id'],))
        comments = db.execute('SELECT c.*, p.name AS p_name, p.number AS p_number FROM stats_comments c LEFT JOIN stats_players p ON p.id=c.player_id WHERE c.game_id=? ORDER BY c.created, c.id', (row['id'],))
        return {'id': row['id'], 'name': row['name'], 'opponent': row['opponent'], 'video': row['video'], 'status': row['status'],
                'created': row['created'], 'updated': row['updated'], 'events': [self.event(e) for e in events],
                'comments': [self.comment(c) for c in comments]}

    def training(self, db, row):
        games = [self.game(db, r) for r in db.execute('SELECT * FROM stats_games WHERE training_id=? AND deleted=0 ORDER BY created DESC, rowid DESC', (row['id'],))]
        comments = db.execute('SELECT c.*, p.name AS p_name, p.number AS p_number FROM stats_comments c LEFT JOIN stats_players p ON p.id=c.player_id WHERE c.training_id=? ORDER BY c.created, c.id', (row['id'],))
        drills = []
        for drill_id in json.loads(row['drills'] or '[]'):
            found = db.execute('SELECT document FROM tactics WHERE id=?', (drill_id,)).fetchone()
            name = json.loads(found['document']).get('name') if found else None
            drills.append({'id': drill_id, 'name': name or '已删除的 Drill'})
        return {'id': row['id'], 'name': row['name'], 'warmup': row['warmup'],
                'attendees': json.loads(row['attendees'] or '[]'), 'drills': drills, 'heldOn': row['held_on'], 'status': row['status'],
                'created': row['created'], 'updated': row['updated'],
                'games': games, 'comments': [self.comment(c) for c in comments]}

    def snapshot(self, known_revision=None):
        db = self.connect()
        try:
            db.execute('BEGIN')
            revision = self.revision(db)
            if known_revision == revision:
                return {'unchanged': True, 'revision': revision}
            players = [self.player(r) for r in db.execute('SELECT * FROM stats_players ORDER BY number, id')]
            games = [self.game(db, r) for r in db.execute('SELECT * FROM stats_games WHERE deleted=0 AND training_id IS NULL ORDER BY created DESC, rowid DESC')]
            trainings = [self.training(db, r) for r in db.execute('SELECT * FROM stats_trainings WHERE deleted=0 ORDER BY created DESC, rowid DESC')]
            return {'players': players, 'games': games, 'trainings': trainings, 'revision': revision}
        finally:
            db.commit()
            db.close()

    def ensure_number_free(self, db, number, exclude=0):
        if db.execute('SELECT 1 FROM stats_players WHERE number=? AND id<>?', (number, exclude)).fetchone():
            raise StatsError(409, f'{number} 号已被其他队员使用。')

    def player_access_fields(self, raw):
        updates = {}
        try:
            if 'password' in raw and raw['password'] != '':
                updates['password_hash'] = TEAM.password_hash(raw['password'])
            if 'joinedOn' in raw:
                updates['joined_on'] = TEAM.calendar_date(raw['joinedOn'], '入队日期') if raw['joinedOn'] else ''
        except ValueError as error:
            raise StatsError(400, str(error)) from None
        return updates

    def set_player_access(self, db, pid, updates):
        if not updates:
            return
        if 'password_hash' in updates:
            db.execute('UPDATE stats_players SET auth_version=auth_version+1 WHERE id=?', (pid,))
        db.execute('UPDATE stats_players SET '+', '.join(key+'=?' for key in updates)+' WHERE id=?', (*updates.values(), pid))

    def add_player(self, raw):
        name, number, gender = player_fields(raw)
        access = self.player_access_fields(raw)
        with self.transaction() as db:
            if db.execute('SELECT count(*) FROM stats_players').fetchone()[0] >= MAX_PLAYERS:
                raise StatsError(400, f'名单最多 {MAX_PLAYERS} 人。')
            self.ensure_number_free(db, number)
            cursor = db.execute('INSERT INTO stats_players(name,number,gender,updated) VALUES (?,?,?,?)', (name, number, gender, self.now()))
            self.set_player_access(db, cursor.lastrowid, access)
            row = db.execute('SELECT * FROM stats_players WHERE id=?', (cursor.lastrowid,)).fetchone()
            return {'player': self.player(row), 'revision': self.revision(db, True)}

    def update_player(self, id_, raw):
        name, number, gender = player_fields(raw)
        access = self.player_access_fields(raw)
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_players WHERE id=?', (id_,)).fetchone():
                raise StatsError(404, '这名队员不存在。')
            self.ensure_number_free(db, number, id_)
            db.execute('UPDATE stats_players SET name=?, number=?, gender=?, updated=? WHERE id=?', (name, number, gender, self.now(), id_))
            self.set_player_access(db, id_, access)
            row = db.execute('SELECT * FROM stats_players WHERE id=?', (id_,)).fetchone()
            return {'player': self.player(row), 'revision': self.revision(db, True)}

    def delete_player(self, id_):
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_players WHERE id=?', (id_,)).fetchone():
                raise StatsError(404, '这名队员不存在。')
            # Soft-deleted games keep their events for recovery, but they no longer pin the roster.
            active = 'FROM stats_events JOIN stats_games ON stats_games.id=stats_events.game_id WHERE stats_games.deleted=0'
            if db.execute(f'SELECT 1 {active} AND (stats_events.from_id=? OR stats_events.to_id=?) LIMIT 1', (id_, id_)).fetchone():
                raise StatsError(409, '这名队员在未删除的比赛中还有记录，不能删除；可先删除相关比赛，或修改盘名与号码。')
            for row in db.execute(f"SELECT stats_events.line AS line {active} AND stats_events.kind='point' AND stats_events.line IS NOT NULL"):
                if id_ in json.loads(row['line'] or '[]'):
                    raise StatsError(409, '这名队员在未删除比赛的上场阵容里，不能删除；可先删除相关比赛，或修改盘名与号码。')
            db.execute('DELETE FROM stats_players WHERE id=?', (id_,))
            db.execute('DELETE FROM stats_avatars WHERE player_id=?', (id_,))
            return {'deleted': id_, 'revision': self.revision(db, True)}

    def add_game(self, raw):
        if not isinstance(raw, dict):
            raise StatsError(400, '比赛信息格式无效。')
        name = text(raw.get('name'), 100, '比赛名称')
        opponent = text(raw.get('opponent', ''), 100, '对手名称', required=False)
        video = video_link(raw.get('video', ''))
        training_id = raw.get('trainingId')
        if training_id is not None and (not isinstance(training_id, str) or not GAME_ID.fullmatch(training_id)):
            raise StatsError(400, '训练编号无效。')
        with self.transaction() as db:
            if db.execute('SELECT count(*) FROM stats_games WHERE deleted=0').fetchone()[0] >= MAX_GAMES:
                raise StatsError(400, f'最多保存 {MAX_GAMES} 场比赛，请先删除旧记录。')
            if training_id is not None:
                if not db.execute('SELECT 1 FROM stats_trainings WHERE id=? AND deleted=0', (training_id,)).fetchone():
                    raise StatsError(404, '这场训练不存在或已删除。')
            id_, stamp = str(uuid.uuid4()), self.now()
            db.execute("INSERT INTO stats_games(id,name,opponent,video,training_id,status,created,updated) VALUES (?,?,?,?,?,'live',?,?)", (id_, name, opponent, video, training_id, stamp, stamp))
            row = db.execute('SELECT * FROM stats_games WHERE id=?', (id_,)).fetchone()
            return {'game': self.game(db, row), 'revision': self.revision(db, True)}

    def update_game(self, game_id, raw):
        if not isinstance(raw, dict):
            raise StatsError(400, '比赛信息格式无效。')
        name = text(raw.get('name'), 100, '比赛名称')
        opponent = text(raw.get('opponent', ''), 100, '对手名称', required=False)
        video = video_link(raw.get('video', ''))
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_games WHERE id=? AND deleted=0', (game_id,)).fetchone():
                raise StatsError(404, '这场比赛不存在或已删除。')
            db.execute('UPDATE stats_games SET name=?, opponent=?, video=?, updated=? WHERE id=?', (name, opponent, video, self.now(), game_id))
            row = db.execute('SELECT * FROM stats_games WHERE id=?', (game_id,)).fetchone()
            return {'game': self.game(db, row), 'revision': self.revision(db, True)}

    def add_comment(self, player_id, raw, game_id=None, training_id=None):
        body = text((raw or {}).get('text'), MAX_COMMENT, '总结')
        with self.transaction() as db:
            if game_id is not None:
                if not db.execute('SELECT 1 FROM stats_games WHERE id=? AND deleted=0', (game_id,)).fetchone():
                    raise StatsError(404, '这场比赛不存在或已删除。')
            elif not db.execute('SELECT 1 FROM stats_trainings WHERE id=? AND deleted=0', (training_id,)).fetchone():
                raise StatsError(404, '这次训练不存在或已删除。')
            row = db.execute('SELECT * FROM stats_players WHERE id=?', (player_id,)).fetchone()
            if not row:
                raise StatsError(401, '名单里已没有这名队员，请重新登录。')
            stamp = self.now()
            existing = db.execute('SELECT id FROM stats_comments WHERE game_id IS ? AND training_id IS ? AND player_id=?', (game_id, training_id, player_id)).fetchone()
            if existing:
                db.execute('UPDATE stats_comments SET text=?, updated=?, author_name=?, author_number=? WHERE id=?', (body, stamp, row['name'], row['number'], existing['id']))
            else:
                db.execute('INSERT INTO stats_comments(game_id,training_id,player_id,text,author_name,author_number,created,updated) VALUES (?,?,?,?,?,?,?,?)', (game_id, training_id, player_id, body, row['name'], row['number'], stamp, stamp))
            if game_id is not None:
                db.execute('UPDATE stats_games SET updated=? WHERE id=?', (stamp, game_id))
            else:
                db.execute('UPDATE stats_trainings SET updated=? WHERE id=?', (stamp, training_id))
            comment = {'player': player_id, 'text': body, 'at': stamp, 'name': row['name'], 'number': row['number']}
            return {'comment': comment, 'revision': self.revision(db, True)}

    def delete_comment(self, player_id, game_id=None, training_id=None):
        with self.transaction() as db:
            if game_id is not None:
                if not db.execute('SELECT 1 FROM stats_games WHERE id=? AND deleted=0', (game_id,)).fetchone():
                    raise StatsError(404, '这场比赛不存在或已删除。')
            elif not db.execute('SELECT 1 FROM stats_trainings WHERE id=? AND deleted=0', (training_id,)).fetchone():
                raise StatsError(404, '这次训练不存在或已删除。')
            cursor = db.execute('DELETE FROM stats_comments WHERE game_id IS ? AND training_id IS ? AND player_id=?', (game_id, training_id, player_id))
            if not cursor.rowcount:
                raise StatsError(404, '你还没有写过总结。')
            return {'deleted': True, 'revision': self.revision(db, True)}

    def training_updates(self, db, raw):
        if not isinstance(raw, dict):
            raise StatsError(400, '训练信息格式无效。')
        sets = {}
        try:
            if 'heldOn' in raw:
                sets['held_on'] = TEAM.calendar_date(raw['heldOn'], '训练日期')
        except ValueError as error:
            raise StatsError(400, str(error)) from None
        if 'status' in raw:
            if raw['status'] not in ('planned', 'completed', 'cancelled'):
                raise StatsError(400, '训练状态无效。')
            sets['status'] = raw['status']
        if 'name' in raw:
            sets['name'] = text(raw['name'], 100, '训练名称')
        if 'warmup' in raw:
            sets['warmup'] = text(raw['warmup'], MAX_WARMUP, '热身计划', required=False)
        if 'attendees' in raw:
            attendees = id_values(raw, 'attendees', 0, MAX_PLAYERS, '出勤队员')
            for pid in attendees:
                if not db.execute('SELECT 1 FROM stats_players WHERE id=?', (pid,)).fetchone():
                    raise StatsError(400, '出勤名单里有队员不在名单中，请刷新后重试。')
            sets['attendees'] = json.dumps(attendees)
        if 'drills' in raw:
            values = raw.get('drills')
            if not isinstance(values, list) or len(values) > MAX_DRILLS:
                raise StatsError(400, f'Drill 数量无效（最多 {MAX_DRILLS} 个）。')
            drills = []
            for value in values:
                if not isinstance(value, str) or not TACTIC_ID.fullmatch(value):
                    raise StatsError(400, 'Drill 编号无效。')
                if value in drills:
                    raise StatsError(400, 'Drill 重复。')
                drills.append(value)
            for drill_id in drills:
                if not db.execute('SELECT 1 FROM tactics WHERE id=? AND deleted=0', (drill_id,)).fetchone():
                    raise StatsError(400, '训练库里已没有这个 Drill，请刷新后重试。')
            sets['drills'] = json.dumps(drills)
        if not sets:
            raise StatsError(400, '没有要修改的内容。')
        return sets

    def add_training(self, raw):
        if not isinstance(raw, dict):
            raise StatsError(400, '训练信息格式无效。')
        name = text(raw.get('name'), 100, '训练名称')
        with self.transaction() as db:
            if db.execute('SELECT count(*) FROM stats_trainings WHERE deleted=0').fetchone()[0] >= MAX_TRAININGS:
                raise StatsError(400, f'最多保存 {MAX_TRAININGS} 次训练，请先删除旧记录。')
            id_, stamp = str(uuid.uuid4()), self.now()
            db.execute("INSERT INTO stats_trainings(id,name,warmup,attendees,drills,created,updated) VALUES (?,?,'','[]','[]',?,?)", (id_, name, stamp, stamp))
            held_on = datetime.now(timezone.utc).date().isoformat()
            db.execute('UPDATE stats_trainings SET held_on=?, status=? WHERE id=?', (held_on, 'planned', id_))
            if 'heldOn' in raw or 'status' in raw:
                updates = self.training_updates(db, {k:raw[k] for k in ('heldOn','status') if k in raw})
                db.execute('UPDATE stats_trainings SET '+', '.join(k+'=?' for k in updates)+' WHERE id=?', (*updates.values(), id_))
            row = db.execute('SELECT * FROM stats_trainings WHERE id=?', (id_,)).fetchone()
            return {'training': self.training(db, row), 'revision': self.revision(db, True)}

    def update_training(self, training_id, raw):
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_trainings WHERE id=? AND deleted=0', (training_id,)).fetchone():
                raise StatsError(404, '这次训练不存在或已删除。')
            sets = self.training_updates(db, raw)
            assignments = ', '.join(key + '=?' for key in sets)
            db.execute(f'UPDATE stats_trainings SET {assignments}, updated=? WHERE id=?', (*sets.values(), self.now(), training_id))
            row = db.execute('SELECT * FROM stats_trainings WHERE id=?', (training_id,)).fetchone()
            return {'training': self.training(db, row), 'revision': self.revision(db, True)}

    def delete_training(self, training_id):
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_trainings WHERE id=? AND deleted=0', (training_id,)).fetchone():
                raise StatsError(404, '这次训练不存在或已删除。')
            # Soft delete keeps warmup plans, attendance and scrimmage history recoverable.
            db.execute('UPDATE stats_trainings SET deleted=1, updated=? WHERE id=?', (self.now(), training_id))
            return {'deleted': training_id, 'revision': self.revision(db, True)}

    def authenticate(self, identity, password):
        if not isinstance(identity, str) or len(identity) > 24:
            raise StatsError(400, '请输入盘名或号码。')
        db = self.connect()
        try:
            identity = identity.strip().lstrip('#')
            rows = list(db.execute('SELECT * FROM stats_players WHERE name=? OR CAST(number AS TEXT)=?', (identity, identity)))
            if len(rows) > 1:
                raise StatsError(409, '盘名有重名，请用唯一的队员号码登录。')
            if not rows or not TEAM.password_matches(password, rows[0]['password_hash']):
                raise StatsError(401, '盘名、号码或口令不正确；首次登录请让管理员设置个人口令。')
            return self.player(rows[0]), rows[0]['auth_version']
        finally:
            db.close()

    def identity_version(self, pid):
        db = self.connect()
        try:
            row = db.execute('SELECT auth_version,password_hash FROM stats_players WHERE id=?', (pid,)).fetchone()
            return row['auth_version'] if row and row['password_hash'] else None
        finally:
            db.close()

    def update_self(self, pid, raw):
        if not isinstance(raw, dict) or not raw or set(raw)-{'avatar','password','currentPassword'}:
            raise StatsError(400, '只能更新自己的头像和口令。')
        avatar = None
        access = {}
        try:
            if 'avatar' in raw:
                avatar = TEAM.avatar_jpeg(raw['avatar'])
            if 'password' in raw:
                access['password_hash'] = TEAM.password_hash(raw['password'])
        except ValueError as error:
            raise StatsError(400, str(error)) from None
        if avatar is None and not access:
            raise StatsError(400, '没有要更新的内容。')
        with self.transaction() as db:
            row = db.execute('SELECT * FROM stats_players WHERE id=?', (pid,)).fetchone()
            if not row:
                raise StatsError(401, '请重新登录。')
            if access and not TEAM.password_matches(raw.get('currentPassword'), row['password_hash']):
                raise StatsError(401, '当前队员口令不正确。')
            if avatar is not None:
                digest = hashlib.sha256(avatar).hexdigest()[:24]
                db.execute('INSERT OR REPLACE INTO stats_avatars VALUES (?,?,?)', (pid, digest, avatar))
                db.execute('UPDATE stats_players SET avatar_digest=? WHERE id=?', (digest,pid))
            self.set_player_access(db, pid, access)
            db.execute('UPDATE stats_players SET updated=? WHERE id=?', (self.now(),pid))
            player = self.player(db.execute('SELECT * FROM stats_players WHERE id=?', (pid,)).fetchone())
            return {'player':player, 'reauthenticate':bool(access), 'revision':self.revision(db,True)}

    def avatar(self, pid, digest):
        db = self.connect()
        try:
            row = db.execute('SELECT image FROM stats_avatars WHERE player_id=? AND digest=?', (pid,digest)).fetchone()
            if not row:
                raise StatsError(404, '头像不存在。')
            return row['image']
        finally:
            db.close()

    def players_by_name(self, name):
        db = self.connect()
        try:
            return [{'id': r['id'], 'name': r['name'], 'number': r['number']} for r in db.execute('SELECT id,name,number FROM stats_players WHERE name=? ORDER BY number', (name,))]
        finally:
            db.close()

    def player_brief(self, pid):
        db = self.connect()
        try:
            row = db.execute('SELECT * FROM stats_players WHERE id=?', (pid,)).fetchone()
            return self.player(row) if row else None
        finally:
            db.close()

    @staticmethod
    def live_game(db, id_):
        row = db.execute('SELECT * FROM stats_games WHERE id=? AND deleted=0', (id_,)).fetchone()
        if not row:
            raise StatsError(404, '这场比赛不存在或已删除。')
        if row['status'] != 'live':
            raise StatsError(409, '比赛已结束；先点“重新开始”再修改记录。')
        return row

    def add_event(self, game_id, raw):
        if not isinstance(raw, dict) or raw.get('kind') not in EVENT_KINDS:
            raise StatsError(400, '记录类型无效。')
        kind = raw['kind']
        from_id = to_id = None
        line_json = start = None
        if kind == 'point':
            line = line_ids(raw)
            start = raw.get('start')
            if start not in POINT_START:
                raise StatsError(400, '请选择这一分由进攻还是防守开。')
            line_json = json.dumps(line)
        else:
            from_id = player_id(raw.get('from'))
            if kind in ('pass', 'goal'):
                to_id = player_id(raw.get('to'))
            elif kind == 'turnover':
                to_id = player_id(raw.get('to')) if raw.get('to') is not None else None
            elif raw.get('to') is not None:
                raise StatsError(400, '抢断只需要记录防守队员。')
            if to_id == from_id:
                raise StatsError(400, '传盘人和接盘人不能是同一人。')
        with self.transaction() as db:
            self.live_game(db, game_id)
            player_ids = {from_id, to_id} - {None} | (set(line) if kind == 'point' else set())
            for pid in player_ids:
                if not db.execute('SELECT 1 FROM stats_players WHERE id=?', (pid,)).fetchone():
                    raise StatsError(400, '记录中的队员不在名单里，请先刷新名单。')
            last = db.execute('SELECT max(seq) FROM stats_events WHERE game_id=?', (game_id,)).fetchone()[0] or 0
            if last >= MAX_EVENTS:
                raise StatsError(400, f'单场最多记录 {MAX_EVENTS} 条，请新建比赛。')
            stamp = self.now()
            db.execute('INSERT INTO stats_events(game_id,seq,kind,from_id,to_id,line,start,created) VALUES (?,?,?,?,?,?,?,?)',
                       (game_id, last + 1, kind, from_id, to_id, line_json, start, stamp))
            db.execute('UPDATE stats_games SET updated=? WHERE id=?', (stamp, game_id))
            row = db.execute('SELECT * FROM stats_events WHERE game_id=? AND seq=?', (game_id, last + 1)).fetchone()
            return {'event': self.event(row), 'revision': self.revision(db, True)}

    def undo_event(self, game_id):
        with self.transaction() as db:
            self.live_game(db, game_id)
            row = db.execute('SELECT * FROM stats_events WHERE game_id=? ORDER BY seq DESC LIMIT 1', (game_id,)).fetchone()
            if not row:
                raise StatsError(400, '这场比赛还没有记录。')
            db.execute('DELETE FROM stats_events WHERE game_id=? AND seq=?', (game_id, row['seq']))
            db.execute('UPDATE stats_games SET updated=? WHERE id=?', (self.now(), game_id))
            return {'removed': self.event(row), 'revision': self.revision(db, True)}

    def set_status(self, game_id, raw):
        if not isinstance(raw, dict) or raw.get('status') not in GAME_STATUS:
            raise StatsError(400, '比赛状态无效。')
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_games WHERE id=? AND deleted=0', (game_id,)).fetchone():
                raise StatsError(404, '这场比赛不存在或已删除。')
            db.execute('UPDATE stats_games SET status=?, updated=? WHERE id=?', (raw['status'], self.now(), game_id))
            row = db.execute('SELECT * FROM stats_games WHERE id=?', (game_id,)).fetchone()
            return {'game': self.game(db, row), 'revision': self.revision(db, True)}

    def delete_game(self, game_id):
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_games WHERE id=? AND deleted=0', (game_id,)).fetchone():
                raise StatsError(404, '这场比赛不存在或已删除。')
            # Soft delete keeps the event history recoverable from the database file.
            db.execute('UPDATE stats_games SET deleted=1, updated=? WHERE id=?', (self.now(), game_id))
            return {'deleted': game_id, 'revision': self.revision(db, True)}

    def dispatch(self, method, segments, data):
        """Route an already-authorized /api/stats/<segments> write request."""
        if segments == ['players'] and method == 'POST':
            return self.add_player(data)
        if len(segments) == 2 and segments[0] == 'players' and re.fullmatch(r'[0-9]{1,9}', segments[1]):
            if method == 'PUT':
                return self.update_player(int(segments[1]), data)
            if method == 'DELETE':
                return self.delete_player(int(segments[1]))
        if segments == ['games'] and method == 'POST':
            return self.add_game(data)
        if segments == ['trainings'] and method == 'POST':
            return self.add_training(data)
        if len(segments) >= 2 and segments[0] == 'trainings' and GAME_ID.fullmatch(segments[1]):
            training_id, rest = segments[1], segments[2:]
            if rest == [] and method == 'PUT':
                return self.update_training(training_id, data)
            if rest == [] and method == 'DELETE':
                return self.delete_training(training_id)
        if len(segments) >= 2 and segments[0] == 'games' and GAME_ID.fullmatch(segments[1]):
            game_id, rest = segments[1], segments[2:]
            if rest == [] and method == 'PUT':
                return self.update_game(game_id, data)
            if rest == [] and method == 'DELETE':
                return self.delete_game(game_id)
            if rest == ['events'] and method == 'POST':
                return self.add_event(game_id, data)
            if rest == ['events'] and method == 'DELETE':
                return self.undo_event(game_id)
            if rest == ['status'] and method == 'POST':
                return self.set_status(game_id, data)
        raise StatsError(404, '统计接口不存在。')
