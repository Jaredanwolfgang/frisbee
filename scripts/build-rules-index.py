"""Prepare official WFDF text from external build inputs; source PDFs are never deployed."""
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist/wfdf'
INPUT = Path(os.environ.get('WFDF_SOURCE_DIR', ROOT.parent / 'wfdf'))
SOURCES = {
    'core': {'title': '规则正文', 'version': '2025–2028', 'file': 'rules-en.pdf', 'url': 'https://rules.wfdf.sport/wp-content/uploads/2024/12/WFDF-Rules-of-Ultimate-2025-2028.pdf'},
    'zh': {'title': '规则中文译本', 'version': '2025–2028', 'file': 'rules-zh.pdf', 'url': 'https://rules.wfdf.sport/wp-content/uploads/2025/10/01-WFDF世界飞盘联合会飞盘规则（2025-2028）中文版.pdf'},
    'annotations': {'title': '官方注释（英文）', 'version': '2026-06-01 生效', 'file': 'annotations-en.pdf', 'url': 'https://rules.wfdf.sport/wp-content/uploads/2026/07/WFDF-Rules-of-Ultimate-2025-2028-Official-Annotations.pdf'},
    'appendix': {'title': '赛事附录（英文）', 'version': 'v2.0 · 2026-01-01 生效', 'file': 'appendix-en.pdf', 'url': 'https://rules.wfdf.sport/wp-content/uploads/2026/03/WFDF-Rules-of-Ultimate-2025-2028-Appendix-v2.0.pdf'},
}

def pages(key):
    text = subprocess.check_output(['pdftotext', '-layout', str(INPUT / SOURCES[key]['file']), '-'], text=True)
    return text.rstrip('\f\n').split('\f')

def lines(page):
    return [line.rstrip() for line in page.splitlines() if not re.fullmatch(r'\s*\d+\s*', line) and line.strip() not in ('-    The End –', '- The End –')]

def join(parts, chinese=False):
    text = ' '.join(s.strip() for s in parts if s.strip())
    text = re.sub(r'\s+', ' ', text).strip()
    if chinese:
        text = re.sub(r'(?<=[\u3000-\u9fff，。；：！？、])\s+(?=[\u3000-\u9fff，。；：！？、])', '', text)
    return text

def core(key, start):
    entries, chapters, current = [], {}, None
    for page, raw in enumerate(pages(key), 1):
        if page < start:
            continue
        for line in lines(raw):
            s = line.strip()
            if s in ('Definitions', '名词定义', 'Legal License'):
                current = None
                break
            heading = re.match(r'^(\d{1,2})\.(?!\d)\s*(\S.*)$', s)
            clause = re.match(r'^(\d{1,2}(?:\.\d+)+)\.?(?:\s+|(?=[^\d.\s]))(\S.*)$' if key == 'zh' else r'^(\d{1,2}(?:\.\d+)+)\.\s+(\S.*)$', s)
            if heading and 1 <= int(heading[1]) <= 20:
                chapters[heading[1]] = heading[2]
                current = None
            elif clause and clause[1].split('.')[0] in chapters:
                current = {'id': clause[1], 'chapter': clause[1].split('.')[0], 'page': page, 'parts': [clause[2]]}
                entries.append(current)
            elif current and s:
                current['parts'].append(s)
        # Stop before definitions; don't append them to rule 20.4.
        if any(x in raw for x in ('\nDefinitions\n', '\n名词定义\n', 'Legal License')):
            break
    for item in entries:
        item['text'] = join(item.pop('parts'), key == 'zh')
    return entries, chapters

en, en_chapters = core('core', 2)
zh, zh_chapters = core('zh', 4)
zh_map = {e['id']: e for e in zh}
entries = []
for e in en:
    translated = zh_map.get(e['id'])
    entries.append({'key': 'core:' + e['id'], 'doc': 'core', 'ref': e['id'], 'chapter': e['chapter'], 'title': zh_chapters.get(e['chapter'], en_chapters[e['chapter']]), 'en': e['text'], 'page': e['page'], 'zh': translated['text'] if translated else '', 'zhPage': translated['page'] if translated else None})
# Definitions are tables: keep page layout rather than inventing clause numbers.
for key, title in [('core', '名词定义 · Definitions'), ('zh', '名词定义')]:
    active = False
    for n, raw in enumerate(pages(key), 1):
        active = active or bool(re.search(r'^\s*(Definitions|名词定义)\s*$', raw, re.M))
        if 'Legal License' in raw:
            break
        if active:
            entries.append({'key': f'{key}:definitions:{n}', 'doc': 'core', 'ref': f'名词定义 · {"中文" if key == "zh" else "英文"} p{n}', 'chapter': 'definitions', 'title': title, 'zh' if key == 'zh' else 'en': '\n'.join(lines(raw)).strip(), 'page': n, 'file': SOURCES[key]['file'], 'source': key})
# Annotation numbers identify annotations, not the core rule numbers in brackets.
current, chapter = None, ''
for n, raw in enumerate(pages('annotations'), 1):
    if n < 3:
        continue
    for line in lines(raw):
        s = line.strip()
        h = re.match(r'^(\d{1,2})\.\s+(\S.*)$', s)
        a = re.match(r'^(\d{1,2}\.\d+)\s+(\S.*)$', s)
        if h:
            chapter = h[1]
            current = None
        elif a:
            current = {'key': 'annotations:' + a[1], 'doc': 'annotations', 'ref': a[1], 'chapter': chapter, 'title': a[2], 'page': n, 'parts': []}
            entries.append(current)
        elif current and s:
            current['parts'].append(s)
for e in entries:
    if 'parts' in e:
        e['en'] = join(e.pop('parts'))
# Event appendix contains tables and illustrations: index every content page and link the PDF.
for n, raw in enumerate(pages('appendix'), 1):
    if n < 2:
        continue
    cleaned = '\n'.join(lines(raw)).strip()
    headings = re.findall(r'^\s*([A-H]\d*\.?\s+[A-Z][^\n]+|Appendix [A-H]:[^\n]+)', cleaned, re.M)
    entries.append({'key': f'appendix:page:{n}', 'doc': 'appendix', 'ref': f'附录 p{n}', 'chapter': '', 'title': ' / '.join(h.strip() for h in headings[:3]) or '赛事附录', 'page': n, 'en': cleaned})
assert len(en_chapters) == len(zh_chapters) == 20
assert len(en) == len({e['id'] for e in en}), 'Duplicate core clauses'
missing = set(e['id'] for e in en) - zh_map.keys()
# The source Chinese PDF omits 19.2.1.1; show English explicitly, never fabricate a translation.
assert missing == {'19.2.1.1'}, f'Unexpected missing Chinese clauses: {missing}'
result = {'checked': '2026-10-25', 'sources': SOURCES, 'chapters': [{'id': k, 'title': zh_chapters[k], 'en': v} for k, v in en_chapters.items()], 'entries': entries}
(DEST / 'index.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'WFDF index: {len(en)} bilingual clauses, {sum(e["doc"] == "annotations" for e in entries)} annotations, {len(entries)} total entries')
