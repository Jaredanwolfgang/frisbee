# Tiga战术库

球队内部使用的精简战术与 Drill 工具：<https://jaredan.site/frisbee/>。部署在 Aliyun-RMMT 的 `/root/frisbee`，代码仓库为 `git@github.com:Jaredanwolfgang/frisbee.git`。

## 使用

- 队友打开网址即可查看服务器里的战术，无需登录。
- 在更多菜单中点击“开启编辑”并输入编辑口令，可新建、编辑、导入或删除战术；点击“保存”后，其他设备重新打开即可看到。已打开的页面每 20 秒检查一次更新；编辑未保存草稿时暂停刷新。
- “复制链接”会先保存当前修改，再复制 `#tactic=...` 链接，直接打开对应战术，不包含编辑权限。
- 修改采用版本检查。若队友已保存了新版本，会提示将当前草稿另存为副本，保留双方内容。
- 旧浏览器的自建、修改过的战术会显示“上传旧战术到服务器”。需要编辑权限，原浏览器备份继续保留；同编号、不同内容会另存副本。
- 没有账号和个人收藏；用名称、标签、说明和各步骤的执行要点搜索，按战术 / Drill 和分类筛选。
- 新建 Drill 可先选 1–7 名演示球员（含防守），普通战术每方最多 7 人。人数调整会应用所有步骤，删除球员会清理相关路线，可撤销。
- 手机可新建、拖动排站位，也可点选球员、再点终点绘制路线。名称、说明、标签等可稍后补充。
- 「角标」工具可点击场地添加锥桶标记，拖动调整，点选后命名或删除；支持撤销、方向键微调和 Delete 删除。每套最多 32 个角标，全部步骤共用，独立于球员人数限制，随战术保存到服务器、导出和分享。
- 手机战术板支持全屏横屏；不支持原生全屏时使用页面内旋转布局。

## 界面与规则查询

- 顶部切换「Tiga战术库 / WFDF」，分别保留两种模式的查询。战术以场地图 Gallery 展示；主页不显示编辑按钮和同步状态，编辑入口保留在「···」更多菜单中。
- 球员人数合并到绘图工具栏；编辑器固定在视口内，手机可直接看场地、播放、步骤和本步要点，其他表单由「编辑详情」展开。
- 打开战术，顶部「···」可删除已存在的战术或手动复制专属链接。删除需编辑权限和确认，在服务器保留软删除记录。
- WFDF 规则为本站保存的文字，按中文、英文、条款号和章节搜索；来源和章节作为搜索栏内的限定，常用标签放在下方。空搜索先显示章节目录；结果按小节连续阅读，保留条款层级、条件和例外，统一切换中英对照。版本与来源通过右上角 ⓘ 查看，不嵌入或部署 PDF。
- 相关查询显示 WFDF 官方 24 种手势图和 14 张开盘情形图；点击缩略图放大阅读，开盘图保留飞行/滚动/轴心图例。标签「手势图」可浏览全部手势；图片本地保存，来源记录在 `dist/wfdf/visuals.json`。
- 正文 2025–2028 共 368 条，中译文 367 条（官方中译本缺少 19.2.1.1，显示英文）；含名词定义和 2026-06-01 生效的 147 项官方注释。
- 英文正文与注释提取自 WFDF 官网链接的 URules HTML，排除站长个人评论。HTML 附录存在编号/版本差异，本站附录使用 WFDF 现行 v2.0 的文字，保留表格所在页的文字排版。图示请通过官方来源核对。
- 来源、译者、CC BY 4.0 及整理方式见 `dist/wfdf/NOTICE.txt` 和规则页「版本与来源」。核对日期 2026-10-25；无自动更新承诺。

规则索引的维护（需要 Poppler 的 `pdftotext`，无第三方 Python 库）：从 `index.json` 中的官方来源下载四份原始文档到站点目录外，使用 `rules-en.pdf`、`rules-zh.pdf`、`annotations-en.pdf`、`appendix-en.pdf` 文件名；下载 `https://urules.org/all.html` 到临时文件。随后执行：

```bash
WFDF_SOURCE_DIR=/path/to/source-documents python3 -B scripts/build-rules-index.py
python3 -B scripts/import-rules-html.py /path/to/urules-all.html
node scripts/verify-rules.cjs
```

官方图解资产可使用 Poppler 按源文档版面重新导出（PDF 仍只作为外部输入）：

```bash
python3 -B scripts/build-rule-visuals.py /path/to/hand-signals.pdf /path/to/pull-diagrams.pdf
```

需要在源文件更新时人工检查所有裁切边界、图例和条款对应关系，不能把静态示意当成动作视频。

两步导入会核对 20 章、368 条及中英对应情况；需在更新版本时人工检查 HTML 与官方文档差异、注释版本和附录版本，并更新日期、来源与验证。原始 PDF 和第三方 HTML 不进入部署包，运行时无需抓取外站。

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
node scripts/verify-rules.cjs
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

## HTTPS 证书与续期

`jaredan.site`、`www.jaredan.site`、`rmmt.jaredan.site`、`admin.jaredan.site` 共用服务器上的同一份 Let’s Encrypt 证书。主代理为 `rmmt-proxy`，宿主机 Certbot 的现有 `certbot.timer` 负责定期续期。证书、私钥和 ACME 账户仅保存在服务器 `/etc/letsencrypt`，禁止提交 Git。

使用 `webroot` 验证，避免旧的 `standalone` 验证与现有代理争用 80 端口：HTTP 的 `/.well-known/acme-challenge/` 只映射 `/etc/letsencrypt/webroot` 下的公开验证文件，其余域名 HTTP 请求继续跳转 HTTPS。现有容器已经只读挂载 `/etc/letsencrypt`，无需增加端口或停止代理。

```bash
bash scripts/repair-tls.sh Aliyun-RMMT
```

脚本适用于当前已到续期时间的证书：先在 `/root/frisbee/backups/tls-*` 备份代理配置和续期配置，只修改已识别的域名 HTTP 跳转块，保留文件 inode 和其他应用路由；验证 Nginx 配置并热加载，实测四个域名的 HTTP-01 验证路径后，续签同一份证书。成功续期会保存 Webroot 配置。

服务器的 `/etc/letsencrypt/renewal-hooks/deploy/40-reload-rmmt-proxy` 在续期后先执行 `nginx -t`，再热加载代理。脚本最后通过 `--dry-run --run-deploy-hooks` 测试保存的续期配置与加载钩子；测试证书不会替换正式证书。若证书尚未进入续期窗口而需要首次更改验证方式，应使用 `certbot reconfigure --cert-name jaredan.site --authenticator webroot --webroot-path /etc/letsencrypt/webroot` 并核对结果。

完成后用正常证书验证检查四个域名的线上有效期、主站与 `/frisbee/api/health`；不要使用跳过 TLS 校验的参数掩盖故障。主代理配置位于已有的 RMMT 工作区，修复脚本会保留其未提交改动，不会替该工作区提交或推送。

## 备份与恢复

每次代码部署前，会把数据库一致性快照保存到服务器 `/root/frisbee/backups/`。页面也支持导出 JSON 战术备份。数据库包含软删除记录，种子初始化不会复活删除的战术。

恢复数据库时先停止 `frisbee-api`，将确认过的 SQLite 备份恢复到 `data/playbook.sqlite3`，处理对应的 WAL/SHM 文件并恢复目录所有权，再启动 API。恢复会回退整个团队库，执行前先另存当前数据库。

基础阵型与防守概念参考 USA Ultimate、UGA 教材；场上路线为可编辑教学示例，按球队口令及实际防守调整。

## DeepSeek 文字助手

AI 密钥只配置在服务器 `.env` 的 `AI_API_KEY`，不会发送到浏览器或进入 Git。当前使用同一服务器已有的 DeepSeek 账户；`AI_BASE_URL=https://api.deepseek.com`，规则问答使用 `AI_RULES_MODEL=deepseek-flash`，战术整理使用 `AI_TACTIC_MODEL=deepseek-v4-pro`。模型名需按账户 `/models` 实际支持情况核对，不能依赖旧的 `deepseek-chat` 名称。本阶段仅支持文字。

“新建”里的文字入口或更多菜单中的“AI 生成战术”需要编辑权限。描述与人数设置交给模型整理为传跑计划；服务端根据连续盘权和球员位置编译步骤，校验人数、坐标、持盘跑动、接盘终点与角标。关键动作不清楚时先返回澄清问题。结构校验不能保证模型完全理解教练意图，因此先展示说明、绘图约定与步骤预览，再打开未保存的战术板，由教练核对后点击保存；生成接口本身不写入团队数据库。

WFDF 的“AI 问规则”支持连续追问。服务端从部署的本地规则、官方注释、附录及手势索引检索，先通过 SSE 发送原文与手势，再流式解释；整组条款及其例外一起送入上下文。解释中的条款号必须存在于本次检索结果，否则界面隐藏该次解释并提示核对原文。引用校验不等于事实裁定，信息不充分时应结合原文条件补充情形。赛事附录仅在本场采用时适用。模型不会自行抓取网站。

规则问答公开可用，战术生成沿用编辑会话；均校验同源请求、限制请求长度、并发 3、每 IP 每分钟 12 次。默认总额度每小时 200 次，可通过 `AI_HOURLY_LIMIT` 调整。对话仅保留在当前页面内存中，服务端不保存对话记录；提问和相关规则正文会发往配置的 DeepSeek 接口。不要将密钥或个人敏感信息写入描述。

部署会只对主代理现有 `/frisbee/` 路由关闭响应缓冲、增加读取超时；`scripts/configure-ai-proxy.py` 在改动前备份、保留绑定文件 inode，并验证及热加载 Nginx。其余应用路由和 HTTPS 验证路径保持原有配置。内层代理同样关闭 AI 流式响应的缓冲。

本地无密钥时仍能手动画图和检索规则。测试用固定回复服务可在两个终端启动（不使用真实密钥，不应部署为线上模型）：

```bash
python3 -B tests/ai_fixture.py
env AI_API_KEY=local-fixture-only AI_BASE_URL=http://127.0.0.1:4176/v1 python3 -B scripts/dev.py
```

`tests/test_ai.py` 校验连续传跑及规则检索完整性，`tests/test_ai_api.py` 校验写入权限、草稿不落库、SSE 首批资料即时发送、引用编号及并发释放；实际模型结果还需人工核对。

## Drill 循环演示

Drill 战术板的播放栏提供“↻ 循环”开关。编辑者切换后点击保存，队友打开同一链接即可沿用；只读访客也可临时切换本次播放方式。普通战术仍默认播放一次，循环设置不会带入普通战术。备份导出、导入、服务器重启均保留已保存的设置。

循环开启后，末步自动接回首步，并显示当前轮次。球员和盘权首尾一致时连续衔接；不一致的旧 Drill 会明确提示每轮复位，不补画不存在的跑动。暂停、复位和手动切步均可停止播放。切换循环设置支持撤销。

“二人钟摆”用左、右接盘角标及中间回位角标演示：从 O2 已回盘给 O1 的状态起，O2 回中间 → 切左接 O1 传盘 → O1 回中间 → 切右接 O2 回盘。4 步后回到相同站位与盘权，默认循环开启。接盘人持盘等候，出盘者先回位再切出，避免带盘跑动。角标间距为讲解示意，可按训练场地编辑。

```bash
node scripts/verify-playback.cjs
```

该检查跨三个完整循环核对位置、盘权、传盘终点及单次播放停止行为；后端测试覆盖循环设置的共享保存、重启、导入和输入校验。
