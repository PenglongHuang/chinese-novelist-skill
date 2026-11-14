# Summary Shell Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Continue the existing native execution method; user approved the shown shell and requested implementation.

**Goal:** 让 skill 的通用摘要框架与工作台识别、状态门槛一致，精简重复模板说明。
**Architecture:** Shared pure summary parsing/merge in documents.js; state reconcile consumes merge; one Markdown template supplies writing and editing rules.
**Tech Stack:** Existing Node>=16 / browser ES modules, no dependencies.
**Spec:** ../specs/2026-11-15-summary-shell-design.md

## Global Constraints
保留旧版摘要、正式有效内容与非章节说明；不更改已有小说；不新增写作状态或依赖；沿用并发编辑协议；使用至少两位数值章号。

## Review Focus
- 含三个字段标题/注释/待补充文字的空壳不算有效摘要。
- 人物/条件栏已填而事件栏为空时不通过完成门槛。
- 批次汇总填入中间空章，不重复章号，不动前后有效章与非章节说明。
- 新模板的规划、写前、串行填写、并行暂存与汇总指令一致。
- 旧自由叙述摘要、CRLF、代码块内假标题继续可用。

### Task 1: Template contract and summary handling

**Files:** new references/guides/summary-template.md; modify planning/checklist/state/parallel/shared references and outline/character/chapter templates; documents.js, state.mjs; documents/catalog/state tests.

**Interfaces:** `parseChapterSummaries(markdown)` retains the existing entry shape and returns only valid summaries. New `mergeChapterSummaries(markdown, additions)` returns canonical text with empty sections filled in place; existing valid entries remain authoritative. `reconcileProject` consumes the merged text.

- [ ] Capture old-skill Agent baseline; add failing parser/catalog/state scenarios for the five review cases.
- [ ] Run `node scripts/workbench/tests/run.mjs documents catalog state`; expect new assertions to fail.
- [ ] Implement shared validity and merge, update state reconcile; add the summary template and align all writing modes; remove repeated guidance from related templates.
- [ ] Run `node scripts/workbench/tests/run.mjs`; expect zero failures. Repeat under Node16.20.2 and run Chrome suite with B: test temporary directory.
- [ ] Run a fresh Agent against the updated references; expect all planned empty chapter shells and precise read/Edit/batch rules.
- [ ] Independent review, one necessary fix pass, sync global installation with backups, refresh live service and verify. Commit changes on the existing local branch.
