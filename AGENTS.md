# Frisbee project instructions

- This repository is the source of truth for https://jaredan.site/frisbee/.
- Deploy on Aliyun-RMMT in /root/frisbee. Keep other services and main-domain routes intact.
- After every authorized code update, run the relevant checks, commit the change, and push to git@github.com:Jaredanwolfgang/frisbee.git. Do not force-push.
- Server tactics live in the SQLite database mounted at /root/frisbee/data. Never overwrite or delete runtime data during deployment.
- Never commit editor keys, .env files, cookies, databases, backups, or users' tactics to Git.
- Public visitors may read the shared library. Writes require the editor cookie/key. Preserve this separation.
- Preserve existing browser backups. Migration must keep conflicting records as copies rather than overwrite team edits.
- Keep mobile landscape/fullscreen, offensive and defensive player roles, and step playback working.
- Run `python3 -m unittest discover -s tests` and `node scripts/verify-catalog.cjs` before deploying changes that affect storage or the tactic model.
