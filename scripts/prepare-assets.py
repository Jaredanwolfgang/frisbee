"""Create versioned asset URLs from a pushed checkout, without changing source files."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import sys
from urllib.parse import urlsplit


def prepare(directory):
    root = Path(directory).resolve()
    html = (root/'index.html').read_text()
    scripts = []
    for source in re.findall(r'<script src="([^"]+)"></script>',html):
        parsed = urlsplit(source)
        if parsed.scheme or parsed.netloc:raise ValueError('Release scripts must be local')
        old = re.fullmatch(r'assets/([0-9a-f]{16})/bundle\.js',parsed.path)
        if old:
            scripts.extend(json.loads((root/'assets'/old[1]/'entrypoints.json').read_text()))
        else:
            scripts.append(re.sub(r'^assets/[0-9a-f]{16}/','',parsed.path))
    if not scripts:raise ValueError('No entry scripts found')
    for name in scripts:
        file=(root/name).resolve()
        if not file.is_relative_to(root) or file.suffix!='.js' or not file.is_file():raise ValueError('Invalid entry script')
    files = sorted(p for p in root.rglob('*') if p.is_file() and 'assets' not in p.relative_to(root).parts and not any(part.startswith('.') for part in p.relative_to(root).parts) and p.suffix in {'.js','.css','.svg','.json','.png','.webp'})
    digest = hashlib.sha256(Path(__file__).read_bytes())
    digest.update(json.dumps(scripts).encode())
    for file in files:
        digest.update(str(file.relative_to(root)).encode())
        digest.update(file.read_bytes())
    version = digest.hexdigest()[:16]
    target = root/'assets'/version
    for file in files:
        copy = target/file.relative_to(root)
        copy.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(file,copy)
    bundle = '\n;\n'.join('// '+name+'\n'+(root/name).read_text() for name in scripts)
    (target/'bundle.js').write_text(bundle)
    (target/'entrypoints.json').write_text(json.dumps(scripts))
    html = re.sub(r' data-assets-version="[^"]*"', '', html)
    html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-assets-version="'+version+'">', 1)
    def reference(match):
        original = match.group(2)
        parsed = urlsplit(original)
        if parsed.scheme or parsed.netloc or original.startswith(('#','/')):return match.group(0)
        path = re.sub(r'^assets/[0-9a-f]{16}/','',parsed.path)
        file = (root/path).resolve()
        if not file.is_relative_to(root) or not file.is_file() or file.suffix not in {'.js','.css','.svg'}:return match.group(0)
        return match.group(1)+'"assets/'+version+'/'+path+'"'
    html = re.sub(r'((?:src|href)=)"([^"]+)"', reference, html)
    first_script = True
    def bundled(match):
        nonlocal first_script
        if not first_script:return ''
        first_script=False
        return '<script src="assets/'+version+'/bundle.js"></script>'
    html=re.sub(r'<script src="[^"]+"></script>',bundled,html)
    (root/'index.html').write_text(html)
    return version


if __name__=='__main__':
    print('Asset version:', prepare(sys.argv[1] if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'dist'))
