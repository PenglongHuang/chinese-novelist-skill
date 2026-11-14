# 第二阶段：规划 + 二次确认

> **前置条件**：本阶段使用 Phase 1 Layer 3 用户确认的小说标题。标题信息从对话上下文中获取，用于命名项目目录、写入大纲文件头和写作计划 JSON。

执行以下步骤：

1. **创建项目文件夹**：`./chinese-novelist/{YYYYMMDD-HHmmss}-{Layer 3 确认的标题}/`（相对当前工作目录，使用用户在 Layer 3 选定的小说标题）
2. **生成人物档案**：创建 `00-人物档案.md`，使用 [character-template.md](../guides/character-template.md) 模板，参考 [character-building.md](../guides/character-building.md) 创建主角、反派、配角档案。**人物档案必须详细**：每个角色的性格核心、致命缺陷、说话风格/口头禅、恐惧/弱项、背景故事都要具体到可以直接指导写作的程度
3. **生成大纲**：创建 `01-大纲.md`，使用 [outline-template.md](../guides/outline-template.md) 模板，参考 [plot-structures.md](../guides/plot-structures.md) 填入完整的章节规划。**大纲必须以人物驱动情节** 参照 `00-人物档案.md`，确保情节服务于人物成长弧线
3.5. **生成文风基准**：创建 `03-文风基准.md`，包含四部分：
   - **文风指纹**：对话使用倾向、句子节奏、段落呼吸、叙述距离、描写倾向，基于 Layer 2 已有的基调/风格参考/目标读者生成；用正文范例说明，不预设统一对话比例或句长限制
   - **基准段落**：2 段体现目标文风的正文范例（各 500-800 字）。用户在问答中提供过喜欢的作品片段则直接采用
   - **负面清单**：引用 [chapter-guide.md](../guides/chapter-guide.md)「AI 写作痕迹清除」条目
   - **本书校准段落**：（初始为空，第 1 章完成后由 Phase 3 回填）
3.7. **创建章节摘要文件**：创建空的 `99-章节摘要.md`，文件头为 `# 章节摘要` 加一行说明“按章保存约 300–500 字摘要：关键事件与后果、人物当前处境、行动条件及未了事项；改稿时更新原章记录”。每章收尾时写入，具体写法见 [chapter-checklist.md](chapter-checklist.md) 阶段 D，大纲文件保持纯规划文档不随进度膨胀
4. **生成写作计划**：创建 `02-写作计划.json`，基于大纲内容填充，结构如下：
   ```json
   {
     "version": 1,
     "novelName": "[小说名称]",
     "projectPath": "./chinese-novelist/{timestamp}-[小说名称]",
     "totalChapters": [章节数],
     "minWordsPerChapter": 3000,
     "createdAt": "[ISO时间]",
     "updatedAt": "[ISO时间]",
     "status": "planning",
     "writingMode": "[serial|subagent-parallel|agent-teams]",
     "chapters": [
       {
         "chapterNumber": 1,
         "title": "[章节标题]",
         "filePath": "第01章-[章节标题].md",
         "status": "pending",
         "wordCount": null,
         "wordCountPass": null,
         "retryCount": 0
       }
     ]
   }
   ```

准备资料生成后，按 [workbench.md](workbench.md) 启动本地只读小说书房，向用户提供访问地址，让用户查看大纲、人物和文风资料。安装目录与作品目录分别传入；不将工作台代码复制进小说目录。启动失败时提供重启命令并继续正常规划确认，不能因此丢失或重写产物。

工作台只负责查看，打开页面、切换资料或离开页面都不代表同意写作。完成后，仍执行以下两步：

**1. 展示规划摘要并请求确认**

向用户展示规划摘要（小说名称、总章数、目标字数、主要人物、文风基准来源）并请求确认。

**2. 写作模式选择**（用户确认规划后）

使用 `AskUserQuestion` 询问：

```
Question: 选择写作模式
Options:
- 逐章串行（主 Agent 自己逐章写，全程无中断，适合短中篇）
- 子Agent并行（分批派生子 Agent 并行写作，大纲驱动连贯性，适合中长篇）
- Agent Teams（Claude Code 多 Agent 协作模式，Agent 间可通讯，需手动开启）
```

用户选择后：
- 更新 `02-写作计划.json` 的 `writingMode` 字段
- 更新 `status` 为 `"in_progress"`
- 进入第三阶段：疯狂创作 → 详见 [phase3-writing.md](phase3-writing.md)
