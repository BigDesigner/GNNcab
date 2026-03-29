# AGENTS.md

Legacy/supporting operator document only.
Primary active bootstrap source is `agents/SESSION_SNAPSHOT.md`.
For fresh ChatGPT sessions, use `agents/CHATGPT_NEW_CHAT_PROTOCOL.md`.

Before performing any work:

1. Read `PROJECT.md`
2. Read and follow `STANDARD.md`
3. Read and execute `TASK.md`

## Core Priorities

Always prioritize:

- security
- production stability
- minimal unnecessary refactoring

## Execution Rules

- Do not rewrite working systems unless explicitly requested.
- Do not refactor unrelated files during a hotfix or micro-fix task.
- Prefer minimal, targeted, production-safe changes.
- Preserve existing lifecycle, safety, and state-management behavior unless the task explicitly requires changing them.
- Keep the current architecture intact unless a structural change is explicitly requested.

## Deployment Responsibility

Deployment files are part of the product and must remain synchronized with application changes.

Whenever backend, frontend, database, environment variables, process model, WebSocket behavior, build system, ports, paths, domains, production dependencies, or static output structure change, also review and update the `/deploy` directory.

Never assume deployment scripts, PM2 configuration, Nginx configuration, environment templates, SSL setup, or backup scripts remain valid after architecture or runtime changes.

## Language Policy

When interacting with the user:
- Always communicate in Turkish.

When writing code, documentation, comments, commit messages, or any project files:
- Always use English.

This applies to:
- source code
- identifiers
- variable names
- function names
- database schema
- API routes
- configuration files
- comments
- documentation
- commit messages

Turkish must only be used when communicating with the user in chat.

## Response Expectations

Unless the task explicitly asks for something else, provide:

1. the exact files changed
2. a concise explanation of what was changed
3. confirmation of what was intentionally left unchanged
4. any required deployment impact
5. remaining limitations or follow-up risks
