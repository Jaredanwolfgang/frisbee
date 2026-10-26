"""Import normative HTML text only; never embed or execute third-party HTML/scripts.
Usage: python3 scripts/import-rules-html.py path/to/urules-all.html
Run build-rules-index.py first with WFDF_SOURCE_DIR pointing at downloaded PDFs
for the official Chinese translation and cross-checks. PDFs are build inputs only.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import json
import re
import sys

class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []
    def text(self, skip=()):
        if self.tag in skip or 'sessecomment' in self.attrs.get('class', ''):
            return ''
        return ''.join(c if isinstance(c, str) else c.text(skip) for c in self.children) + ('\n' if self.tag in ('p', 'div', 'li', 'summary', 'tr') else '')

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Node()
        self.nodes = []
    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.current)
        self.current.children.append(n)
        self.nodes.append(n)
        if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):
            self.current = n
    def handle_endtag(self, tag):
        n = self.current
        while n.parent:
            if n.tag == tag:
                self.current = n.parent
                break
            n = n.parent
    def handle_data(self, data):
        self.current.children.append(data)

def clean(text):
    return re.sub(r'\s+', ' ', text).strip()

def parent(n, tag):
    while n.parent and n.tag != tag:
        n = n.parent
    return n

ROOT = Path(__file__).resolve().parents[1]
p = Parser()
p.feed(Path(sys.argv[1]).read_text())
path = ROOT / 'dist/wfdf/index.json'
data = json.loads(path.read_text())
old_core = {e['ref']: e for e in data['entries'] if e['doc'] == 'core' and e['chapter'] != 'definitions'}
core, extra = [], []
for n in p.nodes:
    href = n.attrs.get('href', '')
    if n.tag != 's-i' or '#' not in href:
        continue
    ref = href.split('#')[1]
    if re.fullmatch(r'\d{1,2}(?:\.\d+)+', ref) and href.startswith('ch'):
        li = parent(n, 'li')
        text = re.sub(r'^' + re.escape(ref) + r'\.\s*', '', clean(li.text(('ol','ul','details','svg','script','style'))))
        entry = old_core[ref]
        # 1.12 has a sentence after its numbered children. Keep the HTML suffix.
        entry.update(en=text, url=urljoin('https://urules.org/', href))
        core.append(entry)
    elif href.startswith('defs.html#'):
        title = n.attrs.get('keywords', ref.replace('-', ' ').title())
        extra.append({'key': 'definition:' + ref, 'doc': 'core', 'ref': title, 'title': '名词定义 · Definitions', 'chapter': 'definitions', 'en': clean(n.text()), 'url': urljoin('https://urules.org/', href)})
    elif re.fullmatch(r'[A-F]\d+(?:\.\d+)*', ref) and href.startswith('appendix-'):
        li = parent(n, 'li') if '.' in ref else n
        text = re.sub(r'^' + re.escape(ref) + r'\.\s*', '', clean(li.text(('ol','ul','details','svg','script','style'))))
        extra.append({'key': 'appendix:' + ref, 'doc': 'appendix', 'ref': ref, 'chapter': '', 'title': '赛事附录 · ' + ref.split('.')[0], 'en': text, 'url': urljoin('https://urules.org/', href)})
# Use the official v2.0 appendix text: the HTML appendix contains numbering/edition differences.
extra = [e for e in extra if e['doc'] != 'appendix']
# Import official annotations separately; exclude Steinar's non-normative comments.
for n in p.nodes:
    if n.tag != 'details' or 'sessecomment' in n.attrs.get('class', ''):
        continue
    spans = [c for c in p.nodes if c.tag == 'span' and c.attrs.get('id', '').startswith('ann') and parent(c, 'details') is n]
    if not spans:
        continue
    span = spans[0]
    ref = span.attrs['id'][3:]
    li = parent(n, 'li')
    rule = next((c for c in li.children if isinstance(c, Node) and c.tag == 's-i' and re.search(r'#\d', c.attrs.get('href',''))), None)
    target = rule.attrs['href'] if rule else f'ch{ref.split(".")[0]}.html'
    title = clean(span.text()).removeprefix('Annotation:').strip()
    content = clean(n.text(('summary','script','style','svg')))
    extra.append({'key': 'annotations:' + ref, 'doc': 'annotations', 'ref': ref, 'chapter': ref.split('.')[0], 'title': title, 'en': content, 'related': target.split('#')[-1] if '#' in target else '', 'url': 'https://urules.org/' + target.split('#')[0] + '#ann' + ref})
assert len(core) == len(old_core) == 368, len(core)
# URules has two distinct annotations with anchor ann18.4; preserve both.
seen = {}
for e in extra:
    key = e['key']
    seen[key] = seen.get(key, 0) + 1
    if seen[key] > 1:
        e['key'] += ':' + str(seen[key])
assert len(set(e['key'] for e in core + extra)) == len(core + extra)
# Preserve the Chinese definitions as text, rather than a PDF viewer.
zh_defs = [e for e in data['entries'] if e.get('source') == 'zh']
for e in zh_defs:
    e.pop('file', None)
    e['url'] = 'https://rules.wfdf.sport/resources/'
appendix = [e for e in data['entries'] if e['doc'] == 'appendix']
for e in appendix:
    e['url'] = 'https://rules.wfdf.sport/resources/'
    e['refs'] = list(dict.fromkeys(re.findall(r'\b[A-F]\d+(?:\.\d+)*', e['en'])))
    e['title'] = '赛事附录 v2.0 · 官方文本'
for e in core:
    if e['ref'] == '1.10':
        e['en'] = old_core['1.10']['en'].replace('best perspective.', 'best perspective on the play.')
for e in zh_defs:
    if '名词定义' in e.get('zh', ''):
        e['zh'] = e['zh'].split('名词定义', 1)[1].strip()
data['entries'] = core + zh_defs + extra + appendix
data['htmlSource'] = 'https://urules.org/all.html'
data['sources']['core']['html'] = 'https://urules.org/all.html'
for e in data['entries']:
    e.pop('page', None)
    e.pop('zhPage', None)
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print('Imported HTML:', {k: sum(e['doc'] == k for e in data['entries']) for k in ('core','annotations','appendix')})
