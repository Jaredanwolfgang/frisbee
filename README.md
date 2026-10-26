# 飞盘战术室

球队内部使用的精简战术与 Drill 工具：<https://jaredan.site/frisbee/>。部署在 Aliyun-RMMT 的 `/root/frisbee`，代码仓库为 `git@github.com:Jaredanwolfgang/frisbee.git`。

## 使用

- 队友打开网址即可查看服务器里的战术，无需登录。
- 点击“解锁编辑”并输入编辑口令，可新建、编辑、导入或删除战术；点击“保存到服务器”后，其他设备重新打开即可看到。已打开的页面每 20 秒检查一次更新；编辑未保存草稿时暂停刷新。
- “分享战术”复制 `#tactic=...` 链接，直接打开对应战术，不包含编辑权限。
- 修改采用版本检查。若队友已保存了新版本，会提示将当前草稿另存为副本，保留双方内容。
- 旧浏览器的自建、修改过的战术会显示“上传旧战术到服务器”。需要编辑权限，原浏览器备份继续保留；同编号、不同内容会另存副本。
- 没有账号和个人收藏；用名称、标签、说明和各步骤的执行要点搜索，按战术 / Drill 和分类筛选。
- 新建 Drill 可先选 1–7 名演示球员（含防守），普通战术每方最多 7 人。人数调整会应用所有步骤，删除球员会清理相关路线，可撤销。
- 手机可新建、拖动排站位，也可点选球员、再点终点绘制路线。名称、说明、标签等可稍后补充。
- 手机战术板支持全屏横屏；不支持原生全屏时使用页面内旋转布局。

## 服务与数据

- `dist/`：无构建依赖的 HTML、CSS、JavaScript，包括战术图编辑、动画和教学示例。
- `server/app.py`：Python 标准库 HTTP API，SQLite 数据库，无第三方 Python 依赖。
- `server/seed.json`：仅用于初始化的公开示例。运行 `node scripts/build-seed.cjs` 从前端示例生成稳定种子。
- `compose.yaml`：现有 `rmmt-net` 内的 Nginx 和 Python 服务，不额外暴露主机端口。
- `data/playbook.sqlite3`：持久化战术、版本和删除记录。服务器更新不得覆盖此目录。
- `.env`：编辑口令和访问配置，权限为 600，禁止提交 Git。

写入接口要求编辑会话或编辑 key；浏览器使用 HTTPS 的 HttpOnly、SameSite=Strict Cookie。会话有效期为 7 天。队友只需查看链接；仅向需要编辑的人提供编辑口令。更换 `EDITOR_KEY` 并重新创建 API 容器可撤销已有会话。

## 验证

```bash
python3 -B -m unittest discover -s tests
node scripts/verify-catalog.cjs
node --check dist/app.js
```

集成测试覆盖匿名读取、写入权限、会话 Cookie、请求来源、版本冲突、原子导入、冲突副本、SQLite 重启恢复、删除保留及输入校验。

## 每次更新

```bash
git add .
git commit -m "Describe the change"
git push origin main
bash scripts/deploy.sh Aliyun-RMMT
```

部署脚本拒绝未提交、未推送或与 `origin/main` 不一致的源码，只上传对应 Git 提交的文件；更新前在线备份 SQLite。`.env`、用户数据库及备份不进入 Git。

首次部署需在服务器创建 `.env`（参考 `.env.example`），配置至少 24 字符的随机 `EDITOR_KEY`。反向代理由现有主站的 `/frisbee/` 路径转发到 `frisbee-web`；`install-route.py` 仅用于首次接入，已有路由无需重跑。

## 备份与恢复

每次代码部署前，会把数据库一致性快照保存到服务器 `/root/frisbee/backups/`。页面也支持导出 JSON 战术备份。数据库包含软删除记录，种子初始化不会复活删除的战术。

恢复数据库时先停止 `frisbee-api`，将确认过的 SQLite 备份恢复到 `data/playbook.sqlite3`，处理对应的 WAL/SHM 文件并恢复目录所有权，再启动 API。恢复会回退整个团队库，执行前先另存当前数据库。

基础阵型与防守概念参考 USA Ultimate、UGA 教材；场上路线为可编辑教学示例，按球队口令及实际防守调整。
