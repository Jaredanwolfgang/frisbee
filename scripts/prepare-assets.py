"""Create versioned asset URLs from a pushed checkout, without changing source files."""
from pathlib import Path
import hashlib
import re
import shutil
import sys
from urllib.parse import urlsplit


def prepare(directory):
    root = Path(directory).resolve()
    files = sorted(p for p in root.rglob('*') if p.is_file() and 'assets' not in p.relative_to(root).parts and p.suffix in {'.js','.css','.svg','.json','.png','.webp'})
    digest = hashlib.sha256()
    for file in files:
        digest.update(str(file.relative_to(root)).encode())
        digest.update(file.read_bytes())
    version = digest.hexdigest()[:16]
    target = root/'assets'/version
    for file in files:
        copy = target/file.relative_to(root)
        copy.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(file,copy)
    html = (root/'index.html').read_text()
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
    (root/'index.html').write_text(html)
    return version


if __name__=='__main__':
    print('Asset version:', prepare(sys.argv[1] if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'dist'))
