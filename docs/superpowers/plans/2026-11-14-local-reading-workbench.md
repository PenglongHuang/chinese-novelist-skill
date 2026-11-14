# Local Reading Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking.

**Goal:** 提供随本地小说文件变化更新的只读工作台，展示多作品书架和现有全部产物。

**Architecture:** Node 标准库提供文件目录、按需文档读取和 SSE 版本通知。浏览器使用原生模块展示“阅读书房 / 细线书页”界面，保留 Markdown/JSON 为唯一内容来源。当前文档变化提示重载，其他元数据自动更新。

**Tech Stack:** Node.js >=16；原生 HTML/CSS/JavaScript；浏览器端 markdown-it 15.0.3 与 DOMPurify 3.4.17（2026-11-14 核对 npm 官方 registry）。依赖只采用浏览器分发资产，固定版本和校验摘要，随仓库打包；维护期可更新，运行时不从 CDN 获取。DOMPurify 采用 Apache-2.0 授权路径，保留完整适用许可证；markdown-it 保留 MIT 许可。版本分发资产必须经实现时的浏览器测试确认；不将浏览器包引入 Node 运行路径。

**Spec:** `docs/superpowers/specs/2026-11-14-local-reading-workbench-design.md`。

## Global Constraints

- Node 环境要求与现有 skill 声明一致：>=16；无启动前 npm install 或前端构建步骤。
- 仅监听 127.0.0.1。读取限定于显式指定工作区的实际路径；HTTP 不提供写入操作。
- 不改动、迁移或补写任何小说文件。无数据库、模型 API、编辑、待办、创作控制或导出。
- 首次默认书架，深链接允许直接进入作品；浏览器刷新和前进后退恢复相同资源。
- 页面不伪造内容；状态与字数标注来源，不将 completed 当成全部验收通过。
- 运行时离线可用；不自动请求远程图片。
- 视觉基准为已选“细线书页”：暖纸色、细线文字导航、衬线正文、平面书目、浅深色适配。

## Review Focus

- 中文、空格、百分号及同名目录：资源 ID 稳定唯一，地址不会泄露任意文件读取能力；由 Task 1/2 测试。
- 旧章节模板和代码围栏中的伪标题：不会静默截掉正文，无法提取时显示完整原文；由 Task 3 测试。
- JSON 部分写入、章节替换与目录删除：保留可读缓存并提示异常，不能将异常当作零章或已完稿；由 Task 1/2/4 测试。
- 长篇更新与浏览器历史：正在阅读的内容与滚动位置不因后台更新或书目刷新而被替换；由 Task 4 浏览器测试。
- 恶意 Markdown、外部图片、链接和符号链接：不会执行脚本或读取/请求越界资源；由 Task 2/3 测试。

## File Structure

- `scripts/workbench.mjs`：CLI 参数、启动及关闭，导入 server。
- `scripts/workbench/paths.mjs`：真实路径限制、稳定 ID、支持资源路径映射。
- `scripts/workbench/catalog.mjs`：项目发现、计划读取、章节文件索引、缓存及目录版本。
- `scripts/workbench/server.mjs`：HTTP 路由、静态资源、SSE 生命周期。
- `scripts/workbench/web/index.html`：离线资源入口、语义页面骨架。
- `scripts/workbench/web/styles.css`：细线书页设计、正文排版、响应式与暗色。
- `scripts/workbench/web/app.js`：路由、数据加载与文件更新协调。
- `scripts/workbench/web/views.js`：书架、作品导航、元数据和错误展示。
- `scripts/workbench/web/reader.js`：正文视图、排版设置、阅读位置。
- `scripts/workbench/web/markdown.js`：安全 Markdown 渲染与资源链接转换。
- `scripts/workbench/web/documents.js`：纯文档章节提取、正文边界和旧摘要回退，可在 Node 测试中导入。
- `scripts/workbench/web/vendor/`：固定浏览器分发包、许可证及来源清单，不提交 node_modules。
- `scripts/workbench/tests/run.mjs`：使用 node:assert 的测试入口，兼容 Node16，不依赖 node:test。
- `scripts/workbench/tests/{catalog,server,documents}.test.mjs`：真实临时工作区中的数据、接口及提取测试。
- `scripts/workbench/tests/helpers.mjs`：受控临时工作区与清理，禁止触碰真实作品。
- `scripts/workbench/tests/browser-check.mjs`：开发期浏览器验证；工具及依赖可在独立缓存中准备，不改变生产启动依赖。
- `scripts/workbench/THIRD_PARTY.md`：供应资产版本、来源、摘要及许可证。
- `README.md`、`SKILL.md`、`references/flows/{phase0-initialization,phase2-planning,shared-infrastructure}.md`：只读工作台的发现、启动及重启说明。

## Task 1: 作品目录与安全文件索引

**Interfaces**

- `createCatalog(workspacePath)` 返回含 `refresh()`、`listProjects()`、`getProject(id)`、`readDocument(projectId, documentId)`、`readAsset(projectId, assetId)` 的目录实例。
- 项目元数据：`id, directoryName, title, genre, totalChapters, completedChapters, recordedWords, updatedAt, warnings, documents, chapters`。
- 章节：`id, number, title, fileName, exists, recordedStatus, wordCount, wordCountPass, unplanned`。
- 文档：`id, name, exists, version`；读取结果含 `text, version, stale, warnings`。版本只用于变化检测，不是审定状态。
- `refresh()` 返回新的目录版本及变化项目/文档 ID。不存在根目录返回空目录和原因，不创建根目录。

- [ ] 编写 `catalog.test.mjs`：同名小说、中文空格路径和直接项目路径可发现；只有普通 README 的目录不发现；具有标准章节或多个编号资料的无计划作品可发现；隐藏/备份目录不扫描。
- [ ] 编写状态测试：计划缺正文仍保留计划项、无计划正文可访问、数字章号排序、坏 JSON 不崩溃；先好后坏保留原记录并标 stale；删除当前项目返回不存在。
- [ ] 运行 `node scripts/workbench/tests/run.mjs catalog`，确认缺失模块导致失败。
- [ ] 实现 paths/catalog/helper。先通过 realpath 限定目录，再登记资源；计划 filePath 仅接受本项目内文件，排除外链和越界路径。章节正文不在书架扫描时读取，计划与资料仅缓存必要元信息。文档内容按需读取，缓存上一次成功值。
- [ ] 再运行 catalog 测试，全部通过；读取前后比对测试工作区文件内容，确认无写入。

## Task 2: 本地 HTTP 与变化通知

**Interfaces**

- `startWorkbench({workspace, port=0, intervalMs=1500})` 返回 `{url, close, catalog}`；close 关闭 interval、SSE 和 HTTP，便于测试及退出。
- `GET /api/projects`：`{version, projects, warnings}`。
- `GET /api/projects/:id`：项目详细索引，不存在返回 404。
- `GET /api/projects/:id/documents/:docId`：Task 1 的读取结果；缺失 404，首次不可读 503，缓存降级成功结果带 stale。
- `GET /api/projects/:id/assets/:assetId`：仅登记且真实路径受限的本地资源；图片类型白名单，不以 HTML 内联执行文件。
- `GET /api/events`：SSE `catalog` 事件包含 `{version, changedProjects, changedDocuments}`；建立连接先发送当前版本；断线重连也可重新核对完整索引。
- 静态资源仅通过已知资产白名单提供，不将工作区挂载为静态站。

- [ ] 写 server 测试：有效路由、404、POST 405、Unicode ID、遍历编码、越界计划路径、符号链接逃逸、远程资源拒绝；平台不能建立 symlink 时明确记录跳过原因。
- [ ] 写通知测试：连接 SSE 后修改 fixture、主动 refresh 发布变化，新增和删除作品产生目录变化；并发刷新串行合并，不交错覆盖索引；close 后无悬挂连接或定时器。
- [ ] 运行 server 测试确认失败，再实现 server/CLI。CLI 必须给出参数错误、端口占用、缺失工作区的清晰消息；缺失目录不崩溃，目录后续创建可被发现。
- [ ] 服务只接受本地 Host、拒绝跨源读取及 CORS 通配，设置 CSP 和 nosniff；资源 URL 使用服务端映射，不接受任意磁盘路径参数。
- [ ] 开启 1500ms 扫描并对变化合并：相同扫描不通知；原子替换/临时错误有有限重试，旧值带警告。SSE 心跳 15 秒；客户端未响应时清理连接。
- [ ] 运行 catalog+server 测试，全通过；用 CLI 启动测试目录，记录地址并验证能正常关闭。生产运行无需包安装。

## Task 3: 文档提取、安全渲染与离线资产

**Interfaces**

- `extractReadingContent(markdown)` 返回 `{markdown, mode: 'reading'|'full', notice}`，只在确认标准 H1/H2 模板时隐藏概要/备注。保留标题与引子，无法识别显示完整文本。
- `extractSection(markdown, headings)` 返回 `{markdown, found}`；按相同或更高标题级别截取，忽略围栏代码块内伪标题。
- `renderMarkdown(markdown, {projectId, assets, routeForDocument})` 返回经过清理的 HTML；标题锚点稳定且重复标题不碰撞。DOM 插入只能使用该返回值或明确转义的内部模板。

- [ ] 写 documents 测试：LF/CRLF、BOM、标准模板、纯正文、备注词语出现在对话中、围栏伪标题、同名标题、旧大纲内摘要、词典两种标题。明确断言真实正文不丢失。
- [ ] 运行 documents 测试确认失败，再实现文档纯函数与渲染模块。
- [ ] 从 npm 官方版本 tarball 获取并核对 markdown-it 15.0.3 与 DOMPurify 3.4.17 浏览器分发资产，记录 SHA256、来源和许可证。仅保留所需分发资产和法律文件。
- [ ] markdown-it 禁用原始 HTML，渲染后使用 DOMPurify 清理；链接和图片经受限映射转换。外部链接只允许 http/https 并在新标签打开，远程图片显示阻止加载说明；本地 Markdown 链接映射到应用路由，文档锚点保留。
- [ ] 在浏览器恶意内容 fixture 中断言 script/onerror/javascript URL 不执行；网络日志中无外部图片请求；受限本地图片可见。断开网络后标准 Markdown 标题、表格、列表、引用正常显示。
- [ ] 运行文档测试，全通过。

## Task 4: 细线书页界面与实时阅读协调

**Interfaces**

- Hash 路由 `#/`（书架）与 `#/projects/<id>/<view>[/<chapterId>]`；view 为 outline/people/facts/style/summaries/progress/read。
- `app.js` 维护 `{route, catalogVersion, currentDocumentVersion, reloadAvailable, connectionState}`；SSE 只能更新数据索引或标记重载，不能替换当前正文。
- `reader.js` 管理正文/原文件模式、章节目录、上一章下一章，按作品+章节保存 scrollY；localStorage 失败应降级为本次会话状态，不阻塞阅读。

- [ ] 先写浏览器验证用例：首次书架→切换同名作品→浏览资料→正文上一章下一章；刷新/返回保留路由；设置字体行距；无正文/缺资料有明确状态。
- [ ] 创建 HTML 骨架、CSS 和视图模块，采用原型细线书页的文字导航、平面书目、暖纸色和衬线阅读排版，不复用前两版的待办或暂停组件。
- [ ] 实现按需读取和取消过期请求：快速切书不会被旧请求结果覆盖；当前文档过期显示“此文档已更新，点击载入”，只有用户点击才替换当前内容。非当前资料下次进入读取新值。
- [ ] 实现元数据与正文异常提示、服务断线/重试和复制重启命令；没有完整可用数据时不显示虚构统计。章节进度区分计划状态与正文存在性。
- [ ] 在浏览器验证当前正文滚动后，后台改文件/新增章节/修改计划不会跳动；点击重载后显示新文档；删除作品有返回书架入口；服务重启后恢复连接。
- [ ] 检查 1440、1024、736、390px 和暗色外观，目录/表格不挤压或溢出正文；键盘可展开书目与排版。交互和稳定阅读测试未通过不得宣称完成。

## Task 5: Skill 集成、兼容验证与交付

- [ ] 补充工作台启动/访问/关闭说明；CLI 路径必须取 skill 安装目录绝对路径，workspace 取作品集合目录或明确的小说路径，不混淆源码仓库与用户产物路径。
- [ ] Phase 0 支持用户请求查看已有作品；Phase 2 在准备资料生成后可启动只读工作台供查看；不将页面浏览视为批准写作，也不改变现有确认链路。
- [ ] 更新 README 功能、输出与命令示例，ROADMAP 对应条目根据实际验收结果更新，未通过前不提前标记已完成。
- [ ] 运行全部 Node 测试；用 Node16 运行服务与测试验证最低版本兼容；离线启动验证浏览器资产完整，未留下 npm install 等运行前置步骤。
- [ ] 回归现有 check_chapter_wordcount.mjs 的单章与批量 JSON 输出/退出码，确保未引入副作用。
- [ ] 对照设计的 8 项验收完成一次分支级审查，修复问题并复跑受影响检查；记录启动命令、验证结果与限制。
- [ ] 保留用户已有改动，不擅自合并、推送或提交无关文件。任务检查后将改动作为可审阅交付；若执行技能要求提交，仅提交本功能相关内容。

## Execution Handoff

计划自检：设计中的发现/浏览/文档降级/实时变化/只读约束分别由 Task 1–4 覆盖；集成与运行兼容由 Task 5 覆盖。

建议本会话直接执行：各任务共享目录与文档接口，串行实施容易及时修正接口，当前不需要多个实现者并行。待用户审阅计划并选择执行方式后，读取对应执行技能再实现。当前尚未创建分支或 worktree，尚未写产品代码。
