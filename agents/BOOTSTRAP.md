# BOOTSTRAP

## Purpose

This is the preferred single-file bootstrap for a fresh ChatGPT session in GNNcab.

Use this file to recover the current operating state quickly, then consult deeper operational memory only if review proof or finer detail is needed.

## Current Phase

Phase 1 stabilization and production deployment hardening.

First production deployment is still blocked until the remaining deploy blockers are closed in order.

## Closed Blockers

- Blocker 1: clean reproducible deployable revision
- Blocker 2: deploy setup/update scripts aligned with repository truth
- Blocker 3: production seeding removed and safe admin bootstrap added
- Blocker 4 Slice A: checked-in migrations and backup-gated DB update path

## Active Blocker

Blocker 4 Slice B: backup / restore hardening and executable rollback runbook.

## Exact Next Task

Continue with Blocker 4 Slice B only:

- harden `backup.sh`
- harden `backup-restore.sh`
- define and document the executable rollback runbook

Do not widen into routing, auth, health, or other follow-up work during this slice.

## Current Workflow Rules

- Follow blocker-first progression.
- Codex / Antigravity is the patching and commit engine.
- ChatGPT reviews, orchestrates, reconstructs state, and generates the next exact step.
- Do not widen scope unless repository evidence proves the blocker requires it.
- On a dirty worktree, pre-commit inspection is mandatory before any commit:
  - `git status --short`
  - `git diff --name-only`
  - explicit allowed-file review
  - `git diff --cached --name-only`
- Refresh `SESSION_SNAPSHOT.md` only at real handoff points, not after every small step.

## Source-Of-Truth References

Consult these only when needed:

- `agents/SESSION_SNAPSHOT.md`
- `agents/SESSION_STATE.md`
- `agents/NEXT_ACTIONS.md`
- `agents/HANDOFF.md`
- `agents/VERIFIED_WORKLOG.md`
- `agents/DECISIONS.md`
- `agents/AI_PIPELINE.md`
- `agents/AI_GUARDRAILS.md`
- `agents/CHATGPT_NEW_CHAT_PROTOCOL.md`

## New-Chat Usage

For a fresh ChatGPT session, prefer this bootstrap pair:

- `agents/BOOTSTRAP.md`
- `agents/CHATGPT_NEW_CHAT_PROTOCOL.md`

Only ask for deeper files when code review, contradiction checking, or exact repository-proof detail is needed.

## Recommended New-Chat Prompt

```text
Use the uploaded GNNcab bootstrap documents as the source of truth:
- agents/BOOTSTRAP.md
- agents/CHATGPT_NEW_CHAT_PROTOCOL.md

Do not restart planning from zero.
Do not give generic advice.
Do not replace Codex / Antigravity as the patching engine.

Reconstruct:
- current phase
- closed blockers
- active blocker
- exact next task

Then continue with the correct next action only.
Ask for deeper operational memory files only if exact repo proof is required.
```
