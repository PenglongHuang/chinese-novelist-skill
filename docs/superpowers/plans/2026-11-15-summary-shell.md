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

- [x] Capture old-skill Agent baseline; add failing parser/catalog/state scenarios for the five review cases.
- [x] Run `node scripts/workbench/tests/run.mjs documents catalog state`; expect new assertions to fail.
- [x] Implement shared validity and merge, update state reconcile; add the summary template and align all writing modes; remove repeated guidance from related templates.
- [x] Run `node scripts/workbench/tests/run.mjs`; expect zero failures. Repeat under Node16.20.2 and run Chrome suite with B: test temporary directory.
- [x] Run a fresh Agent against the updated references; expect all planned empty chapter shells and precise read/Edit/batch rules.
- [x] Independent review, one necessary fix pass, sync global installation with backups, refresh live service and verify. Commit changes on the existing local branch.

## Results

- Independent Agent before/after probes: old instructions produced heading only; new instructions produced all three correctly numbered chapter shells and the expected read/Edit/batch workflow. Clarified legacy on-edit formatting and the parallel previous-chapter exception.
- Independent review found four important issues: author notes lost on merge; missing events field accepted as legacy; bare placeholders/empty fences counted; commented chapter headings manufactured summaries. All reproduced, fixed in one pass and covered by completion/merge regressions.
- Node24 and Node16.20.2: 25 scenarios each, zero failures. Chrome suite passed, including empty-shell coverage and live filling without interrupting reading. Skill validator passed; all 45 changed local document links resolve.
- Existing outline/character/chapter templates reduced from 1,670 to 1,257 characters, with summary semantics centralized in the new template.
- Global skill synchronized with file hashes and B: backup; 5112 restarted from the global installation. Existing novel files unchanged.
- Scope: structural validity and observed instruction following are verified, not literary quality, factual summary fidelity or a universal guarantee of every Agent. Earlier unrelated workbench features were outside this review; existing compatibility tests still pass.
