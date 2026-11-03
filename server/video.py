"""Bilibili embeds: parse IDs locally; resolve only allowlisted short-link redirects."""
import json
import re
import time
from functools import lru_cache
from urllib.parse import urlparse, parse_qs, urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

BVID = re.compile(r'^BV[0-9A-Za-z]{10}$')
HOSTS = {'www.bilibili.com','bilibili.com','m.bilibili.com','player.bilibili.com'}
SHORT = {'b23.tv','bili2233.cn'}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def parse_video(url):
    parsed = urlparse(url)
    if parsed.hostname not in HOSTS or parsed.username or parsed.password or parsed.port not in (None,80,443):
        return None
    query = parse_qs(parsed.query)
    match = re.search(r'/video/(BV[0-9A-Za-z]{10}|av[0-9]+)(?:/|$)', parsed.path)
    bvid = (query.get('bvid') or [''])[0] if parsed.hostname == 'player.bilibili.com' else ''
    aid = (query.get('aid') or [''])[0] if parsed.hostname == 'player.bilibili.com' else ''
    if match:
        if match[1].startswith('BV'): bvid = match[1]
        else: aid = match[1][2:]
    if not BVID.fullmatch(bvid) and not (aid.isdigit() and 0 < int(aid) < 2**53):
        return None
    try:
        page = int((query.get('p') or query.get('page') or ['1'])[0])
        if not 1 <= page <= 1000: raise ValueError()
    except ValueError:
        raise ValueError('B 站视频分 P 需为 1–1000。') from None
    return {'key':bvid if BVID.fullmatch(bvid) else 'av'+aid, 'page':page}

def resolve_video(url):
    parsed = urlparse(url)
    if parsed.hostname not in SHORT:
        return parse_video(url)
    current = url
    opener = build_opener(NoRedirect())
    for _ in range(3):
        parsed = urlparse(current)
        if parsed.scheme != 'https' or parsed.hostname not in SHORT | HOSTS or parsed.username or parsed.password or parsed.port not in (None,443):
            raise ValueError('短链接目标无效，请粘贴 B 站完整视频链接。')
        info = parse_video(current)
        if info: return info
        try:
            with opener.open(Request(current,headers={'User-Agent':'Mozilla/5.0'}),timeout=6) as response:
                target = response.headers.get('Location')
        except HTTPError as error:
            if error.code not in (301,302,303,307,308):
                raise ValueError('暂时无法解析短链接，请粘贴 B 站完整 BV 视频链接。') from None
            target = error.headers.get('Location')
            error.close()
        except (URLError,TimeoutError,OSError):
            raise ValueError('暂时无法解析短链接，请粘贴 B 站完整 BV 视频链接。') from None
        if not target: break
        current = urljoin(current,target)
    raise ValueError('无法识别这个短链接，请粘贴 B 站完整 BV 视频链接。')

@lru_cache(maxsize=128)
def _parts(key, time_bucket):
    # The time bucket expires replaced uploads without fetching on every seek.
    param = 'bvid='+key if BVID.fullmatch(key) else 'aid='+key[2:]
    request = Request('https://api.bilibili.com/x/player/pagelist?'+param,
                      headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.bilibili.com/'})
    try:
        with build_opener(NoRedirect()).open(request, timeout=5) as response:
            payload = json.loads(response.read(1024*1024))
        if payload.get('code') != 0 or not isinstance(payload.get('data'),list):
            raise ValueError()
        return {p['page']: p['cid'] for p in payload['data'] if isinstance(p,dict)
                and type(p.get('page')) is int and type(p.get('cid')) is int and 0 < p['cid'] < 2**53}
    except (ValueError, OSError, AttributeError) as error:
        raise ValueError('暂时无法从 B 站获取分 P，请重试或在 B 站打开。') from error


def video_part(key, page):
    if not (BVID.fullmatch(key) or re.fullmatch(r'av[1-9][0-9]{0,15}',key)):
        raise ValueError('视频编号无效。')
    cid = _parts(key, int(time.time())//600).get(page)
    if not cid:
        raise ValueError(f'B 站未返回 P{page}，请核对录像链接。')
    return {'key':key,'page':page,'cid':cid}
