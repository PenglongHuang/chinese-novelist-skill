# Phase 1 Layer 3 标题生成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 chinese-novelist skill 的 Phase 1 中新增 Layer 3 标题生成阶段，AI 基于已收集的创意元素自动生成候选标题供用户选择。

**Architecture:** 新建两个文件（流程文件 + 指南文件），修改四个现有文件以接入新阶段。标题通过对话上下文传递给 Phase 2，无需额外持久化机制。

**Tech Stack:** Markdown 流程文件，与现有 flows/guides 架构一致

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `references/guides/title-guide.md` | 标题创作指南：题材风格映射、创作技巧、质量标准 |
| Create | `references/flows/phase1-layer3-title.md` | Layer 3 流程定义：4 步标题生成流程 |
| Modify | `references/flows/phase1-layer2-customize.md:175` | 将"进入 Phase 2"改为"进入 Layer 3" |
| Modify | `SKILL.md:33-38` | Phase 1 描述中补充 Layer 3 |
| Modify | `references/flows/phase2-planning.md:1` | 标题信息已就位说明 |
| Modify | `references/flows/shared-infrastructure.md:1` | 补充标题传递说明 |

---

### Task 1: 创建标题创作指南 `title-guide.md`

**Files:**
- Create: `references/guides/title-guide.md`

- [ ] **Step 1: 创建 `references/guides/title-guide.md`**

文件内容如下，格式与 `hook-techniques.md` 等现有指南一致（Markdown 标题 + 表格 + 示例 + 关键要素列表）：

```markdown
# 标题创作指南

标题是小说的第一印象。好的标题能在读者心中种下好奇的种子，驱动点击和传播。

本指南供 Phase 1 Layer 3 标题生成阶段使用。AI 应根据故事的题材、冲突、角色、主题等元素，参照本指南生成候选标题。

---

## 题材-风格映射

不同题材的标题有不同的风格倾向。生成标题时，应先确定题材类型，再匹配对应的风格规则。

| 题材 | 风格特征 | 常用结构 | 示例 |
|------|----------|----------|------|
| 悬疑/推理 | 悬念感、未解之谜 | "谜、局、消失的X、第N个X" | 《消失的第十一天》《第七个证人》 |
| 言情/甜宠 | 诗意/温暖感 | 意象、四字短语、对比结构 | 《半夏微凉》《你是迟来的欢喜》 |
| 奇幻/仙侠 | 宏大/古风感 | "录、传、纪、诀、歌" | 《九州风雷录》《沧溟诀》 |
| 科幻 | 未来感/哲思感 | 技术意象、悖论结构 | 《深空回响》《最后一个问题》 |
| 历史 | 厚重感/时代感 | 年代、地名、事件锚点 | 《长安十二时辰》《大明王朝》 |
| 都市/现实 | 接地气/生活化 | 口语化表达、反差结构 | 《都挺好》《人间烟火》 |
| 惊悚/恐怖 | 压迫感/禁忌感 | 暗示、未完成句式 | 《别回头》《十三楼》 |

> 如果故事跨题材（如"悬疑+言情"），优先匹配核心冲突对应的题材风格，同时在标题中融入次要题材的元素。

---

## 标题创作技巧

生成候选标题时，应运用以下技巧，确保每个候选使用不同的技巧。

### 1. 核心冲突提炼法

从故事核心冲突中提炼关键词，组合成标题。标题直指故事的核心矛盾。

**示例：**

> 【悬疑】故事核心是追查一桩连环失踪案 → 《失踪者线索》
> 【历史】核心冲突是宫廷权力斗争 → 《棋局未终》
> 【科幻】核心是AI觉醒后与人类的对立 → 《造物者的困境》

**关键要素：**
- 标题中的关键词与故事核心冲突直接相关
- 读者看到标题能大致感知故事方向

### 2. 主角命名法

以主角的特征、身份、名字为核心构建标题。让标题与主角产生强关联。

**示例：**

> 【都市】主角是一个深夜食堂的老板 → 《深夜掌勺人》
> 【奇幻】主角是被放逐的王子 → 《放逐者归来》
> 【言情】主角是一位失忆的女孩 → 《她的陌生日记》

**关键要素：**
- 标题突出主角最独特的一面
- 避免直接使用主角全名（太像传记）

### 3. 意象隐喻法

用核心意象暗示主题，留有解读空间。标题本身是一个可以被反复品味的象征。

**示例：**

> 【悬疑】故事关于真相与谎言的交织 → 《雾中灯塔》
> 【言情】故事跨越时空的爱恋 → 《折叠的情书》
> 【科幻】故事探讨意识与现实的边界 → 《镜中之镜》

**关键要素：**
- 意象与主题有隐喻关系，但不是一一对应
- 读者能在阅读过程中不断重新理解标题

### 4. 反差法

在标题层面制造认知反差，用看似矛盾的元素并置来引发好奇心。

**示例：**

> 【惊悚】温柔与恐惧并存 → 《她最后一次微笑》
> 【历史】繁华与衰败对比 → 《盛世的裂缝》
> 【都市】平凡与非凡的反差 → 《小人物的大日子》

**关键要素：**
- 两个看似矛盾的元素放在一起
- 制造"为什么会这样"的好奇心

### 5. 悬念留白法

标题不揭示全部真相，留下想象空间。让读者产生"到底是什么"的疑问。

**示例：**

> 【悬疑】不说明是什么案件 → 《第三封信》
> 【奇幻】不说明是什么地方 → 《门后的世界》
> 【言情】不说明是什么约定 → 《那年冬天的约定》

**关键要素：**
- 标题指向某个具体事物，但不解释
- 留下的空白就是悬念

---

## 质量标准

生成候选标题时必须遵守以下标准：

### 必须满足

- **字数**：2-8 字为主流，特殊题材可到 10 字
- **原创性**：避免与知名作品标题雷同
- **可读性**：朗朗上口、易于记忆和传播
- **多样性**：同一批候选中，每个标题使用不同的创作技巧

### 必须避免

- AI 套路化表达：禁止使用"XX之道""XX的觉醒""XX纪元""XX崛起"等 AI 味浓重的结构
- 过于笼统：如"命运""选择""真相"等没有具体指向的单字/双字标题
- 过于直白：直接剧透故事结局或核心转折
- 标题党：使用"震惊""竟然""不敢相信"等网络标题党风格
```

- [ ] **Step 2: 验证文件格式与现有指南一致**

检查点：
- 一级标题是文件名主题
- 二级标题分隔主要板块
- 表格用于映射关系
- 每个技巧有"示例"和"关键要素"（与 `hook-techniques.md` 的结构一致）
- 最后有"质量标准"板块（与 `chapter-guide.md` 的"质量清单"类似）

- [ ] **Step 3: 提交**

```bash
git add references/guides/title-guide.md
git commit -m "feat: add title generation guide with genre-style mapping and techniques"
```

---

### Task 2: 创建 Layer 3 流程文件 `phase1-layer3-title.md`

**Files:**
- Create: `references/flows/phase1-layer3-title.md`
- Reference: `references/flows/phase1-layer1-core.md`（格式参考）
- Reference: `references/flows/phase1-layer2-customize.md`（格式参考）
- Reference: `references/guides/title-guide.md`（被引用的指南）

- [ ] **Step 1: 创建 `references/flows/phase1-layer3-title.md`**

文件内容如下，格式与 `phase1-layer1-core.md` / `phase1-layer2-customize.md` 保持一致（使用 AskUserQuestion 交互模式，包含明确的步骤指令和过渡文本）：

```markdown
# 第一阶段·第三层：标题生成

> 本层在 Layer 1（核心定位）和 Layer 2（深度定制）完成后执行。
> AI 根据已收集的创意元素，参照 [title-guide.md](../guides/title-guide.md) 生成候选标题，用户选择或自定义后进入 Phase 2。

---

## Step 1：分析创意元素

进入本层后，首先从 Layer 1 和 Layer 2 收集的信息中提取以下关键元素：

- **题材类型**：从 Q1 记录中获取（悬疑、言情、奇幻、科幻、历史、都市、惊悚等）
- **核心冲突**：从 Q3 记录中获取
- **主角特征**：从 Q2 记录中获取（身份、性格、目标）
- **核心主题**：从 Q6 记录中获取
- **氛围/基调**：从 Q5B 记录中获取

根据题材类型，匹配 [title-guide.md](../guides/title-guide.md) 中的"题材-风格映射"表，确定标题风格方向。

---

## Step 2：生成候选标题

根据匹配的风格规则，运用 [title-guide.md](../guides/title-guide.md) 中的"标题创作技巧"生成候选标题：

- **简单/单一题材故事**：生成 **3 个**候选
- **复杂/跨题材故事**：生成 **5 个**候选
- 每个候选必须使用**不同的创作技巧**，避免风格雷同

每个标题附带简短说明（一句话）：
- 使用了什么创作技巧
- 为什么适合这个故事

---

## Step 3：展示与选择

使用 `AskUserQuestion` 工具展示候选标题：

```
Question: 基于您的故事元素，以下是为您生成的候选标题，请选择：
Options:
- 《[标题1]》—— [技巧名称]，[一句话说明]
- 《[标题2]》—— [技巧名称]，[一句话说明]
- 《[标题3]》—— [技巧名称]，[一句话说明]
- 重新生成一组新的候选标题
multiSelect: false
```

> 用户可通过 "Other" 自行输入标题。
> 用户选择"重新生成"后，回到 Step 2 重新生成一组候选。

### 迭代策略

维护一个内部计数器跟踪重新生成次数。当重新生成超过 **5 轮**时，在展示候选标题前追加提示：

> "您已尝试多轮选择，也可以直接在下方输入您心中的标题。"

---

## Step 4：确认标题并过渡

用户确认最终标题后，执行以下操作：

### 1. 展示确认信息

```
✅ 小说标题已确定：《[标题]》
接下来将进入规划阶段，为您生成大纲和人物档案。
```

### 2. 标题信息传递

标题存入当前对话上下文。Phase 2 规划阶段启动时，从上下文中读取标题，用于：

- **命名项目目录**：`./chinese-novelist/{timestamp}-{标题}/`
- **写入 `03-写作计划.json`** 的 `novelName` 字段
- **写入 `00-大纲.md`** 的文件头

### 3. 中断恢复

标题仅在对话上下文中传递，不单独持久化。若用户在本层完成后、Phase 2 开始前中断会话，Phase 0 不会找到已创建的项目目录（因为 Phase 2 尚未执行），用户将重新经历 Phase 1 问答流程，最终在本层重新选择标题。

---

→ 进入 **第二阶段：规划与确认**，详见 [phase2-planning.md](phase2-planning.md)
```

- [ ] **Step 2: 验证流程文件格式**

检查点：
- 一级标题是阶段名称
- 使用与 Layer 1/Layer 2 一致的格式（步骤编号、AskUserQuestion 代码块、记录指令）
- 引用 `title-guide.md` 使用相对路径 `../guides/title-guide.md`（与 Layer 1 引用 `shared-infrastructure.md` 的模式一致）
- 结尾有过渡文本指向 Phase 2（与 Layer 1 结尾指向 Layer 2 的模式一致）

- [ ] **Step 3: 提交**

```bash
git add references/flows/phase1-layer3-title.md
git commit -m "feat: add Phase 1 Layer 3 title generation flow"
```

---

### Task 3: 修改 Layer 2 过渡文本

**Files:**
- Modify: `references/flows/phase1-layer2-customize.md:175`

- [ ] **Step 1: 修改 `phase1-layer2-customize.md` 第 175 行**

将当前的过渡文本：
```
用户确认后 → **进入第二阶段：规划**。
```

改为：
```
用户确认后 → **进入第三层：标题生成**，详见 [phase1-layer3-title.md](phase1-layer3-title.md)。
```

同时确认 Layer 2 的配置确认摘要（第 153-164 行）中不包含标题字段——这是正确的，标题在 Layer 3 才生成。

- [ ] **Step 2: 提交**

```bash
git add references/flows/phase1-layer2-customize.md
git commit -m "feat: update Layer 2 transition to point to Layer 3 title generation"
```

---

### Task 4: 更新 `SKILL.md`

**Files:**
- Modify: `SKILL.md:33-38`

- [ ] **Step 1: 在 SKILL.md 的"第一阶段"区块中补充 Layer 3**

当前内容（第 33-38 行）：
```markdown
### 第一阶段：三层递进式问答

通过递进式问答收集创作需求，确定小说定位：

- **核心定位**（必答，Q1-Q3）：题材创意、主角设定、核心冲突 → 详见 [phase1-layer1-core.md](references/flows/phase1-layer1-core.md)
- **深度定制与规格**（Q4-Q8）：世界观、视角基调、核心主题、读者定位、章节数量、配置确认 → 详见 [phase1-layer2-customize.md](references/flows/phase1-layer2-customize.md)
```

改为：
```markdown
### 第一阶段：三层递进式问答

通过递进式问答收集创作需求，确定小说定位与标题：

- **核心定位**（必答，Q1-Q3）：题材创意、主角设定、核心冲突 → 详见 [phase1-layer1-core.md](references/flows/phase1-layer1-core.md)
- **深度定制与规格**（Q4-Q8）：世界观、视角基调、核心主题、读者定位、章节数量、配置确认 → 详见 [phase1-layer2-customize.md](references/flows/phase1-layer2-customize.md)
- **标题生成**：AI 基于创意元素生成候选标题，用户选择或自定义 → 详见 [phase1-layer3-title.md](references/flows/phase1-layer3-title.md)
```

变更点：
1. 描述文字"确定小说定位"改为"确定小说定位与标题"
2. 新增 Layer 3 行，格式与前两行保持一致

- [ ] **Step 2: 提交**

```bash
git add SKILL.md
git commit -m "feat: add Layer 3 title generation to SKILL.md Phase 1 description"
```

---

### Task 5: 更新 `phase2-planning.md`

**Files:**
- Modify: `references/flows/phase2-planning.md:1`

- [ ] **Step 1: 在 `phase2-planning.md` 开头补充前置条件说明**

在第 1 行 `# 第二阶段：规划 + 二次确认` 之后（紧跟标题行），添加前置条件注释：

```markdown

> **前置条件**：本阶段使用 Phase 1 Layer 3 用户确认的小说标题。标题信息从对话上下文中获取，用于命名项目目录、写入大纲文件头和写作计划 JSON。
```

注意：前置条件注释放在标题之后，与 `phase1-layer1-core.md`、`phase1-layer2-customize.md` 的格式一致（先标题，再引用说明）。

同时，将步骤 1 中的项目文件夹命名说明更明确地标注标题来源。当前第 5 行：

```
1. **创建项目文件夹**：`./chinese-novelist/{YYYYMMDD-HHmmss}-{小说名称}/`（相对当前工作目录）
```

改为：

```
1. **创建项目文件夹**：`./chinese-novelist/{YYYYMMDD-HHmmss}-{Layer 3 确认的标题}/`（相对当前工作目录，使用用户在 Layer 3 选定的小说标题）
```

- [ ] **Step 2: 提交**

```bash
git add references/flows/phase2-planning.md
git commit -m "feat: update Phase 2 planning to use title from Layer 3"
```

---

### Task 6: 更新 `shared-infrastructure.md`

**Files:**
- Modify: `references/flows/shared-infrastructure.md`

- [ ] **Step 1: 在"错误恢复"部分之后、"写作计划系统"之前，补充标题传递说明**

在第 64 行 `---`（"错误恢复"结束标记）之后、第 67 行 `## 写作计划系统` 之前，插入：

注意：第 64 行已有 `---` 分隔符，插入内容不要重复添加 `---`。

```markdown
## 标题传递机制

### 传递方式

标题通过**对话上下文**在阶段间传递，不单独持久化到文件。

**传递链路**：
1. Phase 1 Layer 3：用户选择/确认标题 → 标题存入对话上下文
2. Phase 2：从上下文读取标题 → 写入项目目录名、`03-写作计划.json`、`00-大纲.md`

### 中断恢复

若会话在 Layer 3 完成、Phase 2 开始前中断：
- Phase 0 不会找到已创建的项目目录（因为 Phase 2 尚未执行）
- 用户将重新进入 Layer 3 重新选择标题（标题选择耗时很短，重新选择成本可接受）
```

- [ ] **Step 2: 提交**

```bash
git add references/flows/shared-infrastructure.md
git commit -m "feat: add title passing mechanism to shared infrastructure"
```

---

### Task 7: 最终验证与集成提交

**Files:**
- All modified files

- [ ] **Step 1: 验证所有文件变更**

检查点清单：
- [ ] `references/guides/title-guide.md` 存在，格式与 `hook-techniques.md` 一致
- [ ] `references/flows/phase1-layer3-title.md` 存在，格式与 `phase1-layer1-core.md` 一致
- [ ] `references/flows/phase1-layer2-customize.md` 第 175 行过渡到 Layer 3
- [ ] `SKILL.md` 第一阶段包含 Layer 3 条目
- [ ] `references/flows/phase2-planning.md` 有前置条件说明，文件夹命名引用 Layer 3 标题
- [ ] `references/flows/shared-infrastructure.md` 包含标题传递机制说明

- [ ] **Step 2: 验证交叉引用**

确认所有文件间的引用关系正确：
- `SKILL.md` → `phase1-layer3-title.md`（相对路径 `references/flows/phase1-layer3-title.md`）
- `phase1-layer2-customize.md` → `phase1-layer3-title.md`（相对路径 `phase1-layer3-title.md`）
- `phase1-layer3-title.md` → `title-guide.md`（相对路径 `../guides/title-guide.md`）
- `phase1-layer3-title.md` → `phase2-planning.md`（相对路径 `phase2-planning.md`）

- [ ] **Step 3: 如果 Step 1-2 全部通过，创建集成标签（可选）**

```bash
git tag -a v2.1-title-generation -m "feat: Phase 1 Layer 3 title generation stage"
```
