# 章节状态与落盘契约

本文件是状态规则的单一事实源。所有写作模式执行相同门槛，工作台仅观察，不能代替 Agent 宣布完成。

## 状态

`pending`（待创作）→ `in_progress`（写作中）→ `validating`（校验收尾）→ `completed`（已完成）。检查失败进入 `failed`（需修复），修复时回 `in_progress`。恢复旧正文可从 pending 进入 validating。没有暂停状态，不因工作台阅读或意见打断本轮创作。

只有满足以下条件才能进入 completed：正文存在、按本书 minWordsPerChapter 统计达标、99-章节摘要.md 有本章有效摘要、进度及校验记录成功写入。连贯性、文风等内容检查仍由 Agent 执行，脚本只能执行文件与字数门槛。

## 统一提交入口

使用绝对 skill 安装目录调用，`--project` 指向单部小说目录：

```bash
node "{skillBaseDir}/scripts/writing/chapter-state.mjs" --project "{projectPath}" --chapter 1 --status in_progress
node "{skillBaseDir}/scripts/writing/chapter-state.mjs" --project "{projectPath}" --chapter 1 --status validating
node "{skillBaseDir}/scripts/writing/chapter-state.mjs" --project "{projectPath}" --chapter 1 --status completed
```

首次写正文前提交 in_progress；正文写完后提交 validating。完成润色、正式摘要、词典更新及必要文风校准后提交 completed。完成提交失败必须修正原因，禁止手工改 completed 绕过门槛。提交时脚本锁定后重读 JSON，原子写回并填入实测字数/通过标记，避免并行批次覆盖其他章节。failed 提交会增加 retryCount。锁等待失败时重试，不删除其他进程仍在使用的锁。

## 摘要与并行收尾

规划时按 [summary-template.md](../guides/summary-template.md) 预建全部章节标题，每章收尾在标题下填写摘要段落，不要求固定分栏。空标题、注释和占位不算摘要。已有叙述或分栏摘要继续可读，无须批量重写。

若宿主编辑冲突迫使子 Agent 输出 `_batchN-summaries.md`，使用相同格式并报告未汇总，章节停留 validating。主 Agent 在所有批次返回后汇总、核对覆盖与冲突，再完成逐章提交；脚本填入对应空小节，不覆盖已有有效正式摘要。

```bash
# 先报告缺章和冲突，不改正文
node "{skillBaseDir}/scripts/writing/chapter-state.mjs" --project "{projectPath}" --reconcile
# 备份元数据、合并已有摘要、填入实测字数
node "{skillBaseDir}/scripts/writing/chapter-state.mjs" --project "{projectPath}" --reconcile --apply
```

备份位于作品内 `.state-backups/`。正式摘要优先，冲突批次不能覆盖正式记录。缺少的摘要必须回读对应正文补写，不得从大纲杜撰。汇总不自动把旧章节标 completed，只将已存在正文推进 validating；主 Agent 仍须核对内容及提交完成。

全书校验以正文、摘要和进度共同为准。最多三轮自动修复后仍有问题时，项目标 needs_attention，列明缺失项和失败章，不得标 completed。只有全部章节 completed 且收尾核对无问题时，项目才能 completed。

工作台的“状态待同步”是观察异常，不是写作阶段：例如 pending 但已存在正文、completed 却缺摘要或字数记录不符。页面展示实际字数和摘要来源，不静默修复计划。
