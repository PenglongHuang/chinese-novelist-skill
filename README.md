<div align="center">

# chinese-novelist skill

### 让 AI 为你写一部完整的中文小说

[![Version](https://img.shields.io/badge/version-2.3.2-blue.svg)](https://github.com/PenglongHuang/chinese-novelist-skill/releases)
[![Claude Code Skill](https://img.shields.io/badge/Claude_Code-Skill-blue)](https://claude.com/claude-code)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> **v2.0 重构发布**：引入三层递进式问答、偏好记忆系统、中断续写、三种写作模式和自动校验修复！
>
> 查看 [v1.0 → v2.0 升级说明](https://github.com/PenglongHuang/chinese-novelist-skill/pull/10) 了解详情。

</div>


## 📖 为什么用这个？

脑子里有个故事，却总卡在“然后呢”？先定人物和大纲，再逐章写到完稿。面向 Coding Agent、Personal Agent 等各类 Agent：

- **智能问答** - 三层递进式问答，支持快速跳过和随机生成
- **偏好记忆** - 保存题材、视角和文风偏好，减少重复问答
- **中断续写** - 意外中断？自动检测并从断点继续
- **多种写作模式** - 串行 / 子Agent并行 / Agent Teams，按需选择
- **检查与润色** - 逐章审读连贯性与表达，脚本检查字数，不达标时修复
- **章节衔接** - 记录人物处境与事件后果，承接未解悬念

## 🚀 快速开始

安装 Skill：`npx skills add PenglongHuang/chinese-novelist-skill`

装好后，说一句：`使用 chinese-novelist 帮我写一部小说`

## 赞助商

<p align="center">
  <a href="https://www.infistar.cc/register?aff=29SS8B9E&ref_source=link">
    <img src="assets/infistar-banner.png" width="720" alt="Infistar.cc — 一站式全球大模型 API 服务平台"/>
  </a>
</p>

**chinese-novelist-skill × [Infistar.cc](https://www.infistar.cc/register?aff=29SS8B9E&ref_source=link)**

用这个技能包写长篇的朋友都知道：动辄几十万字的大纲回溯、多代理并行出章，额度往往比灵感先耗尽。

如果想放开手脚写长篇，推荐换上 Infistar：

- **零配置接入**：无需修改代码，Claude Code / 客户端只需换上 Base URL 与 Key 即可开工。
- **超低成本试错**：多模型价格极具优势。整卷重构、换文风重写、多代理并行爆肝不再肉疼。
- **全模型任意切**：Claude、GPT、Gemini、DeepSeek 一个 Key 全搞定，改个模型名就能对比打斗与感情戏表现。
- **国内顺畅使用**：RMB 直接结算，全模型支持验真防掺水。
- **专属福利**：通过[专属通道](https://www.infistar.cc/register?aff=29SS8B9E&ref_source=link)注册即送 $5 体验额度。建议领完拿同一份大纲让两个模型各试跑 3 章，感受文笔差异！

---

## ✍️ 使用过程

<table>
  <tr>
    <td align="center"><b>Phase 1 — 交互问答</b></td>
    <td align="center"><b>Phase 2 — 规划确认</b></td>
  </tr>
  <tr>
    <td><img src="assets/phase1-qa.png" width="400"/></td>
    <td><img src="assets/phase2-plan.png" width="400"/></td>
  </tr>
  <tr>
    <td align="center"><b>Phase 3 — 疯狂创作</b></td>
    <td align="center"><b>Phase 4 — 完稿输出</b></td>
  </tr>
  <tr>
    <td><img src="assets/phase3-writing.png" width="400"/></td>
    <td><img src="assets/phase4-done.png" width="400"/></td>
  </tr>
</table>


## 🧠 创作记忆

每次创作后，Skill 会自动学习你的偏好：喜欢的题材类型、叙事风格、章节数量倾向、文字密度等。下次使用时，直接应用你的习惯，省去重复问答。

<p align="center">
  <img src="assets/memory-demo.png" width="600"/>
</p>


## 创作流程

```
用户 → ┌─────────────┐    ┌──────────────────────┐    ┌──────────────┐
       │ Phase 0     │ →  │ Phase 1              │ →  │ Phase 2      │
       │ 初始化      │    │ 三层递进式问答        │    │ 规划 + 确认  │
       │ ·加载偏好   │    │ L1: 核心定位 (必答)   │    │ ·大纲        │
       │ ·检测中断   │    │ L2: 深度定制 (可选)   │    │ ·人物档案    │
       └─────────────┘    └──────────────────────┘    │ ·写作计划JSON│
                                                     └──────┬───────┘
                                                            ↓
                                            ┌───────────────────────────┐
                                            │ Phase 2.5 写作模式选择     │
                                            │ 串行 / 子Agent并行 / Teams │
                                            └─────────┬─────────────────┘
                                                      ↓
       ┌──────────────────────────────────────────────────────────────┐
       │ Phase 3 疯狂创作（全自动，无需确认）                         │
       │ 逐章：写前分析 → 撰写(3000-5000字) → 润色去AI味 → 字数检查  │
       └──────────────────────────────────────────────────────────────┘
                            ↓
       ┌──────────────────────────────────────────────────────────────┐
       │ Phase 4 自动校验与修复（全自动）                             │
       │ 文件与字数检查 → 不合格章节修复（最多3轮）                    │
       └──────────────────────────────────────────────────────────────┘
                            ↓
                       全稿完成
```

### Phase 0：初始化

自动加载用户偏好（`user-preferences.json`），检测是否有未完成的项目可续写，展示个性化欢迎。

### Phase 1：三层递进式问答

**Layer 1 — 核心定位（必答，3问）**：题材创意、主角设定、核心冲突

**Layer 2 — 深度定制（可跳过）**：世界观、叙事视角、核心主题、读者定位、章节数量

> 每个问题都支持随机生成，也可以直接说"跳过"或"都用默认"。

```
Q1：题材与创意
   ○ 悬疑推理   ○ 现代言情   ○ 奇幻玄幻   ○ 科幻未来
   ○ 武侠仙侠   ○ 历史架空   ○ 都市现实   ○ 随机生成

Q2：主角设定
   ○ 男性主角   ○ 女性主角   ○ 双主角     ○ 群像戏

Q3：核心冲突
   ○ 生死存亡   ○ 查明真相   ○ 复仇雪恨   ○ 成长突破
   ○ 爱情阻碍   ○ 权力争夺   ○ 守护保护

   ... Layer 2 可继续定制，也可直接跳到规划 ...
```

### Phase 2：规划 + 确认

AI 生成人物档案、章节大纲和写作计划，展示给你确认：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
规划完成！请确认：

基本信息
  题材：悬疑推理  |  主角：男性侦探  |  冲突：查明真相
  章节数：20章    |  视角：第一人称  |  基调：紧张冷峻

章节规划（前5章）
  第1章：午夜凶铃 - 接到神秘电话...
  第2章：第一具尸体 - 发现密室杀人案...
  ...

主要角色
  主角：李明 - 资深刑警，冷静智慧
  反派：张华 - 高智商罪犯
  配角：王芳 - 法医专家

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
回复"确认" → 选择写作模式 → 立即开始
```

### Phase 2.5：写作模式选择

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **串行** | 主 Agent 逐章写，稳定可靠 | 默认推荐 |
| **子Agent并行** | 多个子 Agent 分批并行写 | 追求速度 |
| **Agent Teams** | Claude Code 多 Agent 协作 | 大型长篇 |

### Phase 3：疯狂创作

确认后按计划连续写作，无需逐章确认；中断时可从已保存的进度继续。

每章严格执行：写前分析 → 撰写(3000-5000字) → 润色去AI味 → 字数检查 → 更新摘要。

```
第1章完成（3247字）
第2章完成（3582字）
第3章完成（3412字）
...
```

### Phase 4：自动校验

全稿完成后检查章节文件与字数，不合格章节自动修复（最多3轮）。连贯性和文字质量由 Agent 审读，仍需作者把关。

---

## 📂 输出样例

```
chinese-novelist/
├── user-preferences.json              # 用户偏好（跨项目共享）
└── 20260412-143000-午夜列车/
    ├── 01-大纲.md                      # 故事概述、章节规划+ 设定词典
    ├── 00-人物档案.md                  # 主角、反派、配角档案
    ├── 02-写作计划.json                # 章节状态与字数记录
    ├── 03-文风基准.md                  # 文风指纹、基准段落、AI味负面清单
    ├── 99-章节摘要.md                  # 逐章事件后果与人物状态
    ├── 第01章-最后一班列车.md
    ├── 第02章-消失的乘客.md
    └── ...
```

---

## 内置参考资料

### 流程文档（`references/flows/`）

| 文件 | 内容 |
|------|------|
| `phase0-initialization.md` | Phase 0：初始化与偏好加载 |
| `phase1-layer1-core.md` | Phase 1 Layer 1：核心定位问答（Q1-Q3） |
| `phase1-layer2-customize.md` | Phase 1 Layer 2：深度定制问答 |
| `phase2-planning.md` | Phase 2：规划与写作计划生成 |
| `phase3-writing.md` | Phase 3：疯狂创作（三种写作模式） |
| `phase4-validation.md` | Phase 4：自动校验与修复 |
| `shared-infrastructure.md` | 共享机制（偏好系统、黄金法则、字数脚本） |

### 写作指南（`references/guides/`）

| 文件 | 内容 |
|------|------|
| `chapter-guide.md` | 章节写作指南（含开头技巧、中文文学技法、连贯性保证、质量检查） |
| `hook-techniques.md` | 悬念设置技巧（13 种结尾钩子类型） |
| `character-building.md` | 人物塑造技法（侧重写作过程中的塑造技巧） |
| `dialogue-writing.md` | 对话写作规范（含节奏进阶、权力博弈） |
| `plot-structures.md` | 情节结构模板 |
| `content-expansion.md` | 内容扩充技巧（含分题材策略、实例对比） |
| `outline-template.md` | 大纲与设定词典模板 |
| `character-template.md` | 人物档案模板 |
| `chapter-template.md` | 章节文件模板 |

---

## 版本与路线

- **更新日志**：[Releases](https://github.com/PenglongHuang/chinese-novelist-skill/releases) — 每个版本的完整变更
- **Roadmap**：[ROADMAP.md](ROADMAP.md) — 已完成 / 进行中 / 计划中

---

## 💬 交流

- [GitHub Discussions](https://github.com/PenglongHuang/chinese-novelist-skill/discussions) — 使用心得、作品分享、功能想法
- [Issues](https://github.com/PenglongHuang/chinese-novelist-skill/issues) — 问题反馈与 bug 报告
- **微信交流群**：扫码入群

<p align="center">
  <img src="assets/wechat-group-qr.png" width="240" alt="微信交流群二维码"/>
</p>

## 赞助

如果这个项目帮你写出了第一部小说，可以考虑[在爱发电赞助我](https://afdian.com/a/penglonghuang)，你的支持直接决定项目的更新速度。

## 许可

[MIT](LICENSE)
