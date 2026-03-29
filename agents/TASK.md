# TASK.md

Legacy/supporting operator document only.
It is preserved for reference, but active session continuity now starts from `agents/SESSION_SNAPSHOT.md`.

You are continuing an existing monorepo project. Do NOT rebuild from scratch.

Your task is to execute the current requested work on the existing codebase.

## Project Context

This is a local transportation dispatch platform built as a monorepo.

Current project direction:

- portable development environment
- production deployment target: DigitalOcean Ubuntu VM
- PostgreSQL
- Express backend
- React frontend
- WebSocket realtime flows
- security-first architecture
- scalable foundation for future multi-city growth

## General Rules

- Do not replace the project with a new scaffold.
- Do not discard existing code unless absolutely necessary.
- Do not rewrite working systems unless explicitly requested.
- Do not refactor unrelated files during a hotfix or micro-fix task.
- Keep the current architecture where possible.
- Only make changes required for correctness, security, stability, or the explicitly requested task.
- Prefer minimal, targeted, production-safe changes.

## Execution Scope

Before making changes:

1. Identify the exact files relevant to the requested task.
2. Limit changes to the smallest safe scope.
3. Preserve existing lifecycle, safety, and state-management behavior unless the task explicitly requires changing them.
4. Review `/deploy` if the requested task affects runtime, build, environment variables, ports, paths, domains, WebSocket behavior, static outputs, or production dependencies.

## Task Mode

Choose the correct execution mode based on the requested work:

### 1. Audit Mode
Use when the request is analysis-only.

Expected behavior:
- inspect the relevant code
- explain what is implemented
- explain what is broken, risky, incomplete, or non-compliant
- do not change code unless explicitly requested

### 2. Hotfix / Micro-Fix Mode
Use when the request is a narrow behavioral or correctness fix.

Expected behavior:
- change only the files directly related to the issue
- preserve architecture
- preserve existing working flows
- avoid opportunistic refactors
- do not widen scope without necessity

### 3. Repair / Completion Mode
Use when the request explicitly asks for broader repair or completion work.

Expected behavior:
- fix build, type, import, dependency, runtime, or integration issues relevant to the requested scope
- complete clearly missing required pieces
- keep deployment files in sync if runtime behavior changes

## Priority Order

Unless the task explicitly says otherwise, prioritize in this order:

1. security
2. production stability
3. correctness
4. minimal change scope
5. maintainability

## Deployment Sync Rule

Deployment files are part of the product.

If application behavior changes in a way that affects deployment, also review and update `/deploy`.

This includes possible changes to:

- Nginx config
- PM2 config
- environment templates
- setup scripts
- deploy/update scripts
- backup scripts
- deployment documentation

Do not leave `/deploy` outdated relative to the application.

## Deliverables

Unless the task explicitly asks for a different format, always provide:

1. exact files changed
2. summary of code changes made
3. confirmation of what was intentionally left unchanged
4. deployment impact, if any
5. remaining limitations, risks, or follow-up needs

## Critical Rule

Do not respond with only a plan if the task explicitly requests code changes.

Follow the language rules defined in `AGENTS.md` and `STANDARD.md`.
