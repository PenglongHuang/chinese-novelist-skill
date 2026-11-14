# Workbench State and Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; inline execution already selected in this conversation.

**Goal:** 将工作台记录与真实正文、摘要和状态门槛对齐。
**Spec:** ../specs/2026-11-14-workbench-status-design.md
**Architecture:** 共享纯文本检查、Node 文件版本缓存、统一 CLI 状态提交、只读界面与独立根目录配置接口。
**Tech Stack:** Existing Node>=16 and vanilla browser modules; no additional dependencies.

## Global constraints
小说正文不重写；状态异常不自动冒充已完成；原目录不改名；保留旧计划兼容；切工作区必须同源且具备会话 token；主题只影响展示。

## Review Focus
并发状态丢失、旧完成记录缺摘要、中文目录与失败切根、批次摘要冲突/缺章、筛选后 SSE 刷新及主题恢复。

### Task 1: Shared inspection and catalog
- [ ] Failing tests: pending+正文提供实测字数/待同步；空摘要回退batch、缺章覆盖；原始项目文件不变。
- [ ] Add shared counting/summary parsing; catalog caches changed document text, computes observations separately from records, exposes summary document with provenance.
- [ ] Run catalog/documents suite.

### Task 2: State CLI
- [ ] Failing tests: cannot complete without canonical summary/count, concurrent different chapters preserve both, reconcile backs up and never falsely completes.
- [ ] Add chapter-state.mjs + state module with lock/re-read/atomic plan persistence, merge summaries without discarding canonical entries; honor per-project minimum.
- [ ] Test CLI on fixtures, update writing/checklist/validation instructions around enforced completion gate.

### Task 3: Workspace and UI
- [ ] Failing server/browser tests for authenticated switching, failure retention, status filtering, theme persistence and summary gaps.
- [ ] Add config API/session token/root switch and atomic catalog generation; UI open-path dialog/recent roots, themes, state diagram/filter/color, observed counts and per-chapter summaries.
- [ ] Avoid empty-template body and normal-prose warning, fix favicon CSP noise.

### Task 4: Integration
- [ ] Full suite on Node24 and Node16; browser interaction/security/mobile checks.
- [ ] Backup and reconcile real project's existing metadata and batch summaries; missing summaries reviewed from real chapter text before filling; keep chapter finalization honest.
- [ ] Independent full-diff review then one fix pass; update global skill install with backup, restart 5112 and verify real project.
