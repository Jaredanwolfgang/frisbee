"""Team roster and live game statistics. Python stdlib + SQLite; no third-party packages."""
from contextlib import contextmanager
from pathlib import Path
import json
import re
import sqlite3
import time
import uuid

MAX_PLAYERS = 40
MAX_GAMES = 300
MAX_EVENTS = 600
MAX_LINE = 14
MAX_COMMENT = 800
EVENT_KINDS = {'pass', 'goal', 'turnover', 'defense', 'point'}
GAME_STATUS = {'live', 'finished'}
POINT_START = {'offense', 'defense'}
GENDERS = {'male', 'female'}
GAME_ID = re.compile(r'^[A-Za-z0-9_-]{1,64}$')


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
            db.execute('CREATE TABLE IF NOT EXISTS stats_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, player_id INTEGER NOT NULL, text TEXT NOT NULL, author_name TEXT NOT NULL, author_number INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE (game_id, player_id))')
            # Older databases keep their rows; new columns are added in place.
            for statement in ("ALTER TABLE stats_players ADD COLUMN gender TEXT NOT NULL DEFAULT ''",
                              'ALTER TABLE stats_events ADD COLUMN line TEXT',
                              'ALTER TABLE stats_events ADD COLUMN start TEXT',
                              'ALTER TABLE stats_games ADD COLUMN video TEXT NOT NULL DEFAULT \'\''):
                try:
                    db.execute(statement)
                except sqlite3.OperationalError:
                    pass
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
        return {'id': row['id'], 'name': row['name'], 'number': row['number'], 'gender': row['gender'], 'updated': row['updated']}

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

    def snapshot(self, known_revision=None):
        db = self.connect()
        try:
            db.execute('BEGIN')
            revision = self.revision(db)
            if known_revision == revision:
                return {'unchanged': True, 'revision': revision}
            players = [self.player(r) for r in db.execute('SELECT * FROM stats_players ORDER BY number, id')]
            games = [self.game(db, r) for r in db.execute('SELECT * FROM stats_games WHERE deleted=0 ORDER BY created DESC, rowid DESC')]
            return {'players': players, 'games': games, 'revision': revision}
        finally:
            db.commit()
            db.close()

    def ensure_number_free(self, db, number, exclude=0):
        if db.execute('SELECT 1 FROM stats_players WHERE number=? AND id<>?', (number, exclude)).fetchone():
            raise StatsError(409, f'{number} 号已被其他队员使用。')

    def add_player(self, raw):
        name, number, gender = player_fields(raw)
        with self.transaction() as db:
            if db.execute('SELECT count(*) FROM stats_players').fetchone()[0] >= MAX_PLAYERS:
                raise StatsError(400, f'名单最多 {MAX_PLAYERS} 人。')
            self.ensure_number_free(db, number)
            cursor = db.execute('INSERT INTO stats_players(name,number,gender,updated) VALUES (?,?,?,?)', (name, number, gender, self.now()))
            row = db.execute('SELECT * FROM stats_players WHERE id=?', (cursor.lastrowid,)).fetchone()
            return {'player': self.player(row), 'revision': self.revision(db, True)}

    def update_player(self, id_, raw):
        name, number, gender = player_fields(raw)
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_players WHERE id=?', (id_,)).fetchone():
                raise StatsError(404, '这名队员不存在。')
            self.ensure_number_free(db, number, id_)
            db.execute('UPDATE stats_players SET name=?, number=?, gender=?, updated=? WHERE id=?', (name, number, gender, self.now(), id_))
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
            return {'deleted': id_, 'revision': self.revision(db, True)}

    def add_game(self, raw):
        if not isinstance(raw, dict):
            raise StatsError(400, '比赛信息格式无效。')
        name = text(raw.get('name'), 100, '比赛名称')
        opponent = text(raw.get('opponent', ''), 100, '对手名称', required=False)
        video = video_link(raw.get('video', ''))
        with self.transaction() as db:
            if db.execute('SELECT count(*) FROM stats_games WHERE deleted=0').fetchone()[0] >= MAX_GAMES:
                raise StatsError(400, f'最多保存 {MAX_GAMES} 场比赛，请先删除旧记录。')
            id_, stamp = str(uuid.uuid4()), self.now()
            db.execute("INSERT INTO stats_games(id,name,opponent,video,status,created,updated) VALUES (?,?,?,?,'live',?,?)", (id_, name, opponent, video, stamp, stamp))
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

    def add_comment(self, game_id, player_id, raw):
        body = text((raw or {}).get('text'), MAX_COMMENT, '赛后总结')
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_games WHERE id=? AND deleted=0', (game_id,)).fetchone():
                raise StatsError(404, '这场比赛不存在或已删除。')
            row = db.execute('SELECT * FROM stats_players WHERE id=?', (player_id,)).fetchone()
            if not row:
                raise StatsError(401, '名单里已没有这名队员，请重新登录。')
            stamp = self.now()
            existing = db.execute('SELECT id FROM stats_comments WHERE game_id=? AND player_id=?', (game_id, player_id)).fetchone()
            if existing:
                db.execute('UPDATE stats_comments SET text=?, updated=?, author_name=?, author_number=? WHERE id=?', (body, stamp, row['name'], row['number'], existing['id']))
            else:
                db.execute('INSERT INTO stats_comments(game_id,player_id,text,author_name,author_number,created,updated) VALUES (?,?,?,?,?,?,?)', (game_id, player_id, body, row['name'], row['number'], stamp, stamp))
            db.execute('UPDATE stats_games SET updated=? WHERE id=?', (stamp, game_id))
            comment = {'player': player_id, 'text': body, 'at': stamp, 'name': row['name'], 'number': row['number']}
            return {'comment': comment, 'revision': self.revision(db, True)}

    def delete_comment(self, game_id, player_id):
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM stats_games WHERE id=? AND deleted=0', (game_id,)).fetchone():
                raise StatsError(404, '这场比赛不存在或已删除。')
            cursor = db.execute('DELETE FROM stats_comments WHERE game_id=? AND player_id=?', (game_id, player_id))
            if not cursor.rowcount:
                raise StatsError(404, '你还没有写过总结。')
            return {'deleted': True, 'revision': self.revision(db, True)}

    def players_by_name(self, name):
        db = self.connect()
        try:
            return [{'id': r['id'], 'name': r['name'], 'number': r['number']} for r in db.execute('SELECT id,name,number FROM stats_players WHERE name=? ORDER BY number', (name,))]
        finally:
            db.close()

    def player_brief(self, player_id):
        db = self.connect()
        try:
            row = db.execute('SELECT id,name,number FROM stats_players WHERE id=?', (player_id,)).fetchone()
            return {'id': row['id'], 'name': row['name'], 'number': row['number']} if row else None
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
