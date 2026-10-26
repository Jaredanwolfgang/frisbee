"""Enable streaming only for the existing Frisbee route; preserve the proxy inode."""
from pathlib import Path
import datetime
import re
import subprocess

config=Path('/root/v1/deploy/nginx/default.conf')
original=config.read_text()
anchor='    location /frisbee/ {'
if original.count(anchor)!=1:
    raise SystemExit('Expected one existing Frisbee route; inspect the proxy before modifying.')
start=original.index(anchor);end=original.index('\n    }',start)+len('\n    }')
block=original[start:end]
if 'frisbee-web:80' not in block:
    raise SystemExit('The Frisbee upstream differs from the reviewed setup.')
changed=block
if 'proxy_buffering off;' not in changed:
    changed=changed.replace('        proxy_http_version 1.1;', '        proxy_buffering off;\n        proxy_http_version 1.1;',1)
if 'proxy_read_timeout' not in changed:
    changed=changed.replace('        proxy_http_version 1.1;', '        proxy_read_timeout 180s;\n        proxy_http_version 1.1;',1)
if changed==block:
    print('Frisbee streaming proxy already configured.')
else:
    target=original[:start]+changed+original[end:]
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup=Path('/root/frisbee/backups')/('proxy-before-ai-'+stamp+'.conf')
    backup.write_text(original);backup.chmod(0o600)
    try:
        config.write_text(target)
        subprocess.run(['docker','exec','rmmt-proxy','nginx','-t'],check=True)
        subprocess.run(['docker','exec','rmmt-proxy','nginx','-s','reload'],check=True)
    except Exception:
        config.write_text(original)
        subprocess.run(['docker','exec','rmmt-proxy','nginx','-t'],check=False)
        subprocess.run(['docker','exec','rmmt-proxy','nginx','-s','reload'],check=False)
        raise
    print('Frisbee streaming configured; backup:',backup)
