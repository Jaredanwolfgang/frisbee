"""Add only the /frisbee route to the existing jaredan.site server block.

Run remotely after starting frisbee-web. Preserve the inode because the proxy
bind-mounts this file. Restore the original contents if nginx validation fails.
"""
from pathlib import Path
import datetime
import subprocess

config = Path('/root/v1/deploy/nginx/default.conf')
original = config.read_text()
server = '    server_name jaredan.site www.jaredan.site;'
assert original.count(server) == 1, 'Expected exactly one main domain server'
start = original.index(server)
end = original.index('\n}\n', start)
block = original[start:end]
assert 'location /frisbee/' not in block, 'Frisbee route already exists; inspect before updating'
anchor = '    location / {'
assert anchor in block
route = '''    # Frisbee playbook - isolated static service on the existing Docker network.
    location = /frisbee { return 301 /frisbee/; }
    location /frisbee/ {
        set $upstream_frisbee frisbee-web:80;
        rewrite ^/frisbee/(.*)$ /$1 break;
        proxy_pass http://$upstream_frisbee;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

'''
modified = original[:start] + block.replace(anchor, route + anchor, 1) + original[end:]
backup = config.with_name('default.conf.before-frisbee-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.bak')
backup.write_text(original)
try:
    config.write_text(modified)
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-t'], check=True)
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-s', 'reload'], check=True)
except Exception:
    config.write_text(original)
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-t'], check=False)
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-s', 'reload'], check=False)
    raise
print('Frisbee route installed. Backup:', backup)
