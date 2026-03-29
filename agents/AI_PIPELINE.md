# AI_PIPELINE

Last updated: 2026-03-17

## Purpose

Define the official AI-assisted development workflow for this repository so sessions remain consistent, auditable, and production-safe.

## Model Usage Policy

- Use a high-capability coding model for repository analysis, patching, and validation-critical tasks.
- Use smaller/faster models only for low-risk formatting or drafting work that does not decide runtime behavior.
- Do not treat model output as truth; repository state and executed verification are the source of truth.

## Operational Stages

### 1) SESSION BOOT

- Read `agents/SESSION_SNAPSHOT.md` first.
- For fresh ChatGPT sessions, also follow `agents/CHATGPT_NEW_CHAT_PROTOCOL.md`.
- Confirm current task, known safe baseline, open work, and dirty-worktree constraints.
- Do not assume unstaged files belong to current scope.

### 2) ANALYSIS

- Inspect only the files needed for the requested task.
- Identify exact risk, affected runtime path, and minimal safe change surface.
- Prefer narrow stabilization over redesign.

### 3) PATCH

- Implement the smallest safe change that satisfies the task.
- Keep architecture intact unless explicitly requested otherwise.
- Avoid opportunistic cleanup and unrelated edits.

### 4) PATCH REVIEW

- Re-read changed files and confirm behavior against requirements.
- Verify no forbidden broadening (scope, architecture, unrelated files).
- Confirm security and production constraints are preserved.

### 5) VALIDATION

- Run the narrowest relevant checks (for example targeted TypeScript/project checks).
- Mark work as complete only when verification is actually run and passes.
- If verification cannot be run, state it explicitly.

### 6) MEMORY UPDATE

- Update operational memory files minimally and only with verified outcomes.
- Keep next task explicit, narrow, and production-oriented.
- Do not mark temporary compatibility paths as removed until actually removed and verified.

### 7) COMMIT

- If the worktree is dirty, run pre-commit inspection first:
  - `git status --short`
  - `git diff --name-only`
  - explicit allowed-file review
  - `git diff --cached --name-only`
- Stage only task-scope files; never use broad staging commands for dirty worktrees.
- Verify staged file list before commit (`git diff --cached --name-only`).
- Create one logical commit per stabilization slice.

### 8) SESSION SNAPSHOT

- Refresh `agents/SESSION_SNAPSHOT.md` so a new chat can continue cleanly.
- Record:
  - latest controlled commit
  - verified state
  - current safe baseline
  - remaining open work
  - exact next task
  - non-negotiable decisions

## Operational Guardrails

- Security and production stability take priority over speed.
- No wildcard browser-origin behavior in production hardening paths.
- Keep compatibility fallbacks explicit and temporary.
- Generated output under `release/` is not part of the maintained source tree and must be ignored during normal review, audit, patching, and repository analysis unless explicitly requested.
- Do not use destructive git/file actions unless explicitly requested.
- Do not revert unrelated user changes.

## Memory Update Rules

- `SESSION_STATE.md`: current verified state and active risks.
- `NEXT_ACTIONS.md`: checklist status with verified completion only.
- `VERIFIED_WORKLOG.md`: dated record of what was changed and how it was verified.
- `HANDOFF.md`: concise continuity for the next operator/session.
- `SESSION_SNAPSHOT.md`: bootstrap source of truth for the next chat.
- `DECISIONS.md`: update only when a durable policy/architecture decision is made.

## Commit Discipline

- Commit only files in the approved task slice.
- Keep commit message aligned to the actual verified outcome.
- Leave unrelated dirty files unstaged.
- Prefer one commit per completed, verified stabilization unit.

## Snapshot Rules

- Snapshot must reflect repository reality at handoff time, not intent.
- Include only verified outcomes.
- Keep the next task narrow enough to execute in a single focused slice.
