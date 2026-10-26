#!/usr/bin/env bash
# Repair the shared jaredan.site certificate on the existing Aliyun proxy.
# Certificates/account keys remain on the server and never enter Git.
set -euo pipefail
tls_host=${1:-Aliyun-RMMT}
ssh -o BatchMode=yes "$tls_host" 'python3 -' <<'PY'
from pathlib import Path
import datetime
import os
import secrets
import shutil
import subprocess
import time
import urllib.request

config = Path('/root/v1/deploy/nginx/default.conf')
renewal = Path('/etc/letsencrypt/renewal/jaredan.site.conf')
webroot = Path('/etc/letsencrypt/webroot')
challenge = webroot / '.well-known/acme-challenge'
hook = Path('/etc/letsencrypt/renewal-hooks/deploy/40-reload-rmmt-proxy')
domains = ['jaredan.site', 'www.jaredan.site', 'rmmt.jaredan.site', 'admin.jaredan.site']
original = config.read_text()
old = '''server {
    listen 80;
    server_name jaredan.site www.jaredan.site rmmt.jaredan.site admin.jaredan.site;
    return 301 https://$host$request_uri;
}'''
new = '''server {
    listen 80;
    server_name jaredan.site www.jaredan.site rmmt.jaredan.site admin.jaredan.site;

    # Certbot HTTP-01: serve only challenge files from the existing read-only mount.
    location ^~ /.well-known/acme-challenge/ {
        root /etc/letsencrypt/webroot;
        default_type text/plain;
        try_files $uri =404;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}'''
if old not in original and new not in original:
    raise SystemExit('HTTP server configuration differs from the reviewed layout; inspect it before modifying.')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = Path('/root/frisbee/backups') / ('tls-' + stamp + '-' + secrets.token_hex(3))
backup.mkdir(parents=True, mode=0o700)
for source, name in [(config, 'default.conf'), (renewal, 'renewal.conf'), (hook, 'previous-deploy-hook')]:
    if source.exists():
        target = backup / name
        shutil.copyfile(source, target)
        target.chmod(0o600)
print('Configuration backup:', backup)
challenge.mkdir(parents=True, exist_ok=True, mode=0o755)
# Preserve the bind-mounted file inode; do not replace it with rename().
try:
    if old in original:
        config.write_text(original.replace(old, new, 1))
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-t'], check=True)
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-s', 'reload'], check=True)
except Exception:
    config.write_text(original)
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-t'], check=True)
    subprocess.run(['docker', 'exec', 'rmmt-proxy', 'nginx', '-s', 'reload'], check=True)
    raise
# The probe is public, random, disposable text, not a credential.
probe = challenge / ('certbot-probe-' + secrets.token_hex(12))
try:
    probe.write_text('jaredan-acme-webroot-ok\n')
    probe.chmod(0o644)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, message, headers, target):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    for domain in domains:
        url = 'http://' + domain + '/.well-known/acme-challenge/' + probe.name
        for attempt in range(5):
            try:
                with opener.open(url, timeout=20) as response:
                    if response.status != 200 or response.read() != b'jaredan-acme-webroot-ok\n':
                        raise RuntimeError('HTTP challenge check failed for ' + domain)
                break
            except Exception:
                if attempt == 4:
                    raise
                # A graceful Nginx reload hands new connections to new workers.
                time.sleep(0.5)
        print('HTTP-01 route verified:', domain)
finally:
    probe.unlink(missing_ok=True)
hook.parent.mkdir(parents=True, exist_ok=True)
hook.write_text('''#!/bin/sh
set -eu
[ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/jaredan.site" ] || exit 0
/usr/bin/docker exec rmmt-proxy nginx -t
/usr/bin/docker exec rmmt-proxy nginx -s reload
''')
hook.chmod(0o700)
print('Renewal deploy hook installed:', hook)
PY
# A successful renewal persists the webroot authenticator for the existing timer.
ssh -o BatchMode=yes "$tls_host" 'certbot renew --cert-name jaredan.site --authenticator webroot --webroot-path /etc/letsencrypt/webroot --no-random-sleep-on-renew --non-interactive'
# If already current, certbot does not run hooks. Ensure the current cert is loaded.
ssh -o BatchMode=yes "$tls_host" 'docker exec rmmt-proxy nginx -t && docker exec rmmt-proxy nginx -s reload'
# Test the saved renewal configuration and deploy hook, without replacing the cert.
ssh -o BatchMode=yes "$tls_host" 'certbot renew --cert-name jaredan.site --dry-run --run-deploy-hooks --no-random-sleep-on-renew --non-interactive'
