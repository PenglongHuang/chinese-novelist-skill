# 共享机制

本文件定义跨阶段共享的机制和规则。

## 本地只读小说书房

启动命令为 `node "{skillBaseDir}/scripts/workbench.mjs" --workspace "{作品集合目录绝对路径}"`。`{skillBaseDir}` 是本 skill 安装目录，不是用户工作目录。工作区默认是当前工作目录下的 `chinese-novelist/`，也可显式指定单部小说目录。启动和浏览不修改偏好、计划或正文，也不代表确认开写。详细启动、生命周期与错误处理见 [workbench.md](workbench.md)。

---

## 三大黄金法则

1. **展示而非讲述** - 用动作和对话表现，不要直接陈述
2. **冲突驱动剧情** - 每章必须有冲突或转折
3. **悬念承上启下** - 每章结尾必须留下钩子

---

## 用户偏好系统

### 存储文件

`user-preferences.json`（项目根目录，首次使用后自动创建）

### 数据结构

```json
{
  "version": 1,
  "updatedAt": "2026-04-12",
  "preferences": {
    "favoriteGenres": [],
    "preferredProtagonist": "",
    "preferredPerspective": "",
    "preferredTone": "",
    "typicalChapterCount": null,
    "styleReferences": [],
    "dislikes": [],
    "creationHistory": []
  }
}
```

### 偏好更新规则

| 时机 | 行为 |
|------|------|
| 每完成一层问答 | 静默将本层回答同步到偏好文件（追加/更新，不删除历史） |
| 用户说"记住我的偏好" | 保存当前所有配置到偏好 |
| 用户说"忘记XX偏好" | 清除指定维度的偏好 |
| 用户说"重置偏好" | 清空所有偏好数据 |
| 一部长篇创作完成 | 将作品信息追加到 `creationHistory` |

### 偏好如何影响交互

1. **启动欢迎语**：有偏好时显示"欢迎回来！" + 个性化提示
2. **选项排序**：Q1中将 `favoriteGenres` 匹配项排前面
3. **常用标记**：基调问（第二层调用一）、章节数问（第二层调用二）中对应用⭐标记"你的常用"/"上次选择"
4. **需求报告**：结合偏好给个性化建议（如"你之前喜欢悬疑+第三人称限制，这次要不要试试多视角？"）
5. **随机生成**：优先从偏好范围内随机选取，保持一致性
6. **风格参考追问**：优先推荐 `styleReferences` 中的作者

### 错误恢复

- **回退修改**：用户随时可说"重新问XX"、"修改XX"，AI 回退到指定问题重新询问
- **中途暂存**：通过 `02-写作计划.json` 实现自动暂存；下次触发SKILL时 Phase 0 自动检测未完成项目，询问"继续上次的《XXX》？"
- **偏好文件损坏**：JSON解析失败时忽略偏好，使用默认值，并在后台修复文件

---

## 标题传递机制

### 传递方式

标题通过**对话上下文**在阶段间传递，不单独持久化到文件。

**传递链路**：
1. Phase 1 Layer 3：用户选择/确认标题 → 标题存入对话上下文
2. Phase 2：从上下文读取标题 → 写入项目目录名、`02-写作计划.json`、`01-大纲.md`

### 中断恢复

若会话在 Layer 3 完成、Phase 2 开始前中断：
- Phase 0 不会找到已创建的项目目录（因为 Phase 2 尚未执行）
- 用户将重新进入 Layer 3 重新选择标题（标题选择耗时很短，重新选择成本可接受）

## 写作计划系统

### 存储文件

`02-写作计划.json`（项目文件夹内，Phase 2 创建）

### 作用

- **进度跟踪**：记录每章创作状态（pending/in_progress/validating/completed/failed）。状态及完成门槛见 [chapter-state.md](chapter-state.md)，通过统一 CLI 提交，不能并行整体覆写 JSON。
- **写作模式**：记录用户选择的写作模式（serial/subagent-parallel/agent-teams）
- **中断续写**：Phase 0 读取 JSON 检测未完成项目，支持从断点继续
- **校验依据**：Phase 4 基于 JSON 校验章节完成度和字数
- **并行协调**（可选）：多 Agent 并行写作时通过 JSON 状态避免冲突

### 与大纲的关系

- `01-大纲.md`：章节规划（核心事件、悬念钩子、承接上章、出场人物、场景列表）+ 设定词典（设定名词的首现与揭示跟踪），纯规划文档，不随创作进度膨胀
- `99-章节摘要.md`：按章保存约 300–500 字的关键事件与后果、人物当前处境、行动条件及未了事项，每章收尾时写入，改稿更新原记录；写法以 [chapter-checklist.md](chapter-checklist.md) 阶段 D 为准
- `02-写作计划.json`：章节状态、字数、重试次数、写作模式（机器可读的进度跟踪）
- Phase 3 创作每章时必须读取 `01-大纲.md` 中对应章节的规划信息，作为创作依据
- 两者严格对应：JSON 中的 `chapterNumber` 和 `title` 必须与大纲中的章节规划一致

### JSON 损坏处理

- JSON 解析失败时：提示用户，尝试从 `99-章节摘要.md` 推断完成进度
- 章节状态丢失时：通过文件存在性和字数脚本重建状态

---

## 字数检查脚本

使用 `{skillBaseDir}/scripts/check_chapter_wordcount.mjs` 检查章节字数（Node 脚本，零依赖）。`{skillBaseDir}` 指 SKILL.md 所在的 skill 安装根目录（如 `~/.claude/skills/chinese-novelist`）——脚本不在用户项目内，**必须用 skill 安装目录的绝对路径调用**，禁止写相对路径 `scripts/...`（那只存在于 skill 源码目录，用户项目解析不到）。

```bash
# 检查单个章节（--json 输出机读结果，含 word_count 与达标状态）
node {skillBaseDir}/scripts/check_chapter_wordcount.mjs ./chinese-novelist/项目文件夹/第01章.md <minWordsPerChapter> --json

# 检查所有章节（按章号数值排序，第10章不会排在第2章前面）
node {skillBaseDir}/scripts/check_chapter_wordcount.mjs --all ./chinese-novelist/项目文件夹/ <minWordsPerChapter> --json

# 自定义最小字数
node {skillBaseDir}/scripts/check_chapter_wordcount.mjs ./chinese-novelist/项目文件夹/第01章.md 3500 --json
```

### 环境要求与降级

`<minWordsPerChapter>` 必须替换为本书 `02-写作计划.json` 中的数值，未设置时为 3000；单章、批量与状态脚本统一使用这个下限。

脚本依赖 Node（≥16；`npx skills add` 安装本 skill 的用户必然已满足）。若调用报 `node: command not found`（Windows 为「'node' 不是内部或外部命令」）：

1. 停止自动检查，提示用户安装 Node.js：<https://nodejs.org/>；
2. **禁止**改为 Agent 自行阅读章节估算字数——模型计数不可靠，脚本存在的意义就是确定性；
3. 用户安装前如需继续写作，字数以写作目标为准，并在完稿报告中注明「字数未经脚本校验」。

### 退出码

| 退出码 | 含义 |
|-------|------|
| 0 | 全部达标 |
| 1 | 有章节不达标 |
| 2 | 文件/目录错误 |

Agent 优先用 `--json` + 退出码判断结果：`results[].word_count` 可直接填入 `02-写作计划.json` 的 `wordCount`，无需解析文本报告。

### 使用场景

| 阶段 | 用途 |
|------|------|
| Phase 3（逐章创作） | 撰写后按本书 minWordsPerChapter 检查单章字数，不足时扩充 |
| Phase 4（自动校验） | 批量检查所有章节字数，不合格章节自动重写 |

低于本书字数下限的章节必须使用 [content-expansion.md](../guides/content-expansion.md) 的扩充技巧进行扩充。
