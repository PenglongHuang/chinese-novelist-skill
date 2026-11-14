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
- [x] Failing tests: pending+正文提供实测字数/待同步；空摘要回退batch、缺章覆盖；原始项目文件不变。
- [x] Add shared counting/summary parsing; catalog caches changed document text, computes observations separately from records, exposes summary document with provenance.
- [x] Run catalog/documents suite.

### Task 2: State CLI
- [x] Failing tests: cannot complete without canonical summary/count, concurrent different chapters preserve both, reconcile backs up and never falsely completes.
- [x] Add chapter-state.mjs + state module with lock/re-read/atomic plan persistence, merge summaries without discarding canonical entries; honor per-project minimum.
- [x] Test CLI on fixtures, update writing/checklist/validation instructions around enforced completion gate.

### Task 3: Workspace and UI
- [x] Failing server/browser tests for authenticated switching, failure retention, status filtering, theme persistence and summary gaps.
- [x] Add config API/session token/root switch and atomic catalog generation; UI open-path dialog/recent roots, themes, state diagram/filter/color, observed counts and per-chapter summaries.
- [x] Avoid empty-template body and normal-prose warning, fix favicon CSP noise.

### Task 4: Integration
- [x] Full suite on Node24 and Node16; browser interaction/security/mobile checks.
- [x] Backup and reconcile real project's existing metadata and batch summaries; missing summaries reviewed from real chapter text before filling; keep chapter finalization honest.
- [x] Independent full-diff review then one fix pass; update global skill install with backup, restart 5112 and verify real project.

## Verification and review result

Node 24 and Node 16.20.2: 20 scenarios each, zero failures. Installed global skill: same 20 scenarios and Chrome interaction suite passed. Live 5112: all seven views inspected, 20 chapter rows, 63,158 Han characters, 20/20 canonical summaries, four distinct main-state colors, no console/page errors, no overflow at 390px.

Independent review produced six important findings, resolved in one fix pass: conflicting canonical duplicates, loss of nonchapter summary notes, stale completed status after summary edits, delayed old-root refresh overwriting a new workspace, unresolved failed status being cleared, and hardcoded word minima in writing instructions. Regression tests reproduce the data/state/race failures; writing instructions and both CLI modes now use the book's configured minimum.

The real novel's canonical summaries were completed by another writer during implementation. Existing formal summaries remain authoritative; all 20 chapter body hashes were preserved. Metadata was backed up and reconciled to validating, with no semantic-completion claim. Restored summary notes from the first backup after confirming all parsed chapter entries matched; moved the unused supplemental batch into recovery backup.

C: exhausted disk space during work. Active checkout moved to `B:/AI-projects/chinese-novelist-workbench`, same local branch. Global skill content is installed independently under `B:/AI-projects/agent-skills/`, reached through a directory junction at the original `C:/Users/24303/.agents/skills/chinese-novelist` entry; previous installation preserved in `B:/AI-projects/agent-skill-backups/`. Native desktop worktree attachment did not accept the B: path, so the original C: checkout remains a stale preserved copy. Live service runs from the B: checkout.
