#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit and push all source changes before deploying.' >&2
  exit 1
fi
git fetch origin main
revision=$(git rev-parse HEAD)
if [[ "$revision" != "$(git rev-parse origin/main)" ]]; then
  echo 'HEAD must match the pushed origin/main revision.' >&2
  exit 1
fi
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
deploy_host=${1:-Aliyun-RMMT}
archive=$(mktemp "${TMPDIR:-/tmp}/frisbee-source.XXXXXX")
trap 'rm -f "$archive"' EXIT
git archive --format=tar HEAD | gzip > "$archive"
ssh -o BatchMode=yes "$deploy_host" "mkdir -p /root/frisbee/releases/$revision"
scp -o BatchMode=yes "$archive" "$deploy_host:/root/frisbee/releases/$revision/source.tar.gz"
ssh -o BatchMode=yes "$deploy_host" "FRISBEE_REVISION=$revision bash -s" <<'REMOTE'
set -euo pipefail
cd /root/frisbee
test -f .env
chmod 600 .env
mkdir -p data backups
chown 65534:65534 data
chmod 700 data
python3 - <<'PY'
from pathlib import Path
import datetime
import sqlite3
source = Path('/root/frisbee/data/playbook.sqlite3')
if source.exists():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = Path('/root/frisbee/backups') / ('before-deploy-' + stamp + '.sqlite3')
    with sqlite3.connect(str(source)) as db, sqlite3.connect(str(target)) as backup:
        db.backup(backup)
    target.chmod(0o600)
    print('Database backup created.')
PY
release="/root/frisbee/releases/$FRISBEE_REVISION"
tar -xzf "$release/source.tar.gz" -C "$release"
python3 - "$release" <<'PY'
from pathlib import Path
import shutil
import sys
release, target = Path(sys.argv[1]), Path('/root/frisbee')
for name in ['dist', 'server', 'scripts', 'tests']:
    shutil.copytree(release / name, target / name, dirs_exist_ok=True)
for name in ['compose.yaml', 'nginx.conf', 'README.md', 'AGENTS.md']:
    # Preserve the inode of Nginx's bind-mounted configuration file.
    shutil.copyfile(release / name, target / name)
PY
python3 -B scripts/configure-ai-proxy.py
APP_VERSION="$FRISBEE_REVISION" docker compose --env-file .env up -d --wait --wait-timeout 90
docker exec frisbee-web nginx -t
docker exec frisbee-web nginx -s reload
printf '%s\n' "$FRISBEE_REVISION" > REVISION
curl --fail --silent --show-error https://jaredan.site/frisbee/api/health
printf '\nDeployed commit: %s\n' "$FRISBEE_REVISION"
REMOTE
