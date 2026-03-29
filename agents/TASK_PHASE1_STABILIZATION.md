# TASK_PHASE1_STABILIZATION (ARCHIVED)

Status: COMPLETED
Archive reason: Phase 1 stabilization tasks completed and verified.
Active task list moved to agents/NEXT_ACTIONS.md
This file is archive-only / legacy and is kept for historical reference only.

This document is kept only for historical reference.

# TASK.md

You are continuing an existing monorepo project. Do NOT rebuild from scratch.

Your task is to audit, repair, and complete the current codebase.

## Project Goals
- portable development environment
- production deployment target: DigitalOcean Ubuntu VM
- PostgreSQL
- Express backend
- React frontend
- security-first architecture
- local transportation dispatch platform
- scalable architecture for future multi-city growth

## IMPORTANT RULES

- Do not replace the project with a new scaffold
- Do not throw away existing code unless absolutely necessary
- First stabilize the current repository
- Fix build errors, type errors, broken imports, dependency issues, and runtime issues
- Remove unnecessary hosted-IDE-specific coupling
- Keep the current architecture where possible
- Only refactor where needed for correctness, security, and maintainability

WORK IN THIS ORDER:

1. Audit the repository structure and explain:
- what is already implemented
- what is broken
- what is incomplete
- what is coupled to hosted-IDE assumptions
- what is production-ready
- what is placeholder-only

2. Fix workspace/package problems:
- ensure pnpm workspace works cleanly
- fix broken package references
- fix tsconfig/project references
- fix path alias issues
- fix missing scripts
- remove or replace hosted-IDE-only Vite plugins if they are unnecessary or harmful outside a local/server deployment

3. Fix backend first:
- ensure api-server builds and runs
- fix auth issues
- fix middleware issues
- validate all routes
- ensure JWT auth works correctly
- review WebSocket authentication
- fix audit logging issues
- fix dispatch service issues
- fix trip lifecycle transition correctness

4. Fix database integration:
- validate Drizzle schema
- validate db exports/imports
- validate migrations/push workflow
- ensure seed scripts work
- confirm PostgreSQL compatibility for DigitalOcean

5. Fix frontend next:
- ensure React app builds
- fix broken imports/components/hooks
- fix route wiring
- ensure login flow works
- ensure admin, driver, and customer dashboards connect correctly to backend APIs
- remove dead mock code where harmful

6. Complete critical missing Phase 1 gaps:
- replace fake routing estimation with a proper routing service abstraction
- clearly mark OSRM integration points
- improve zone-aware dispatch foundation
- verify payment data flow
- improve role-based route protection
- ensure audit logs are written for critical actions

7. PWA reality check:
- if PWA is incomplete, implement the real minimum foundation:
  - manifest.json
  - service worker
  - offline fallback
  - safe caching strategy

8. Deployment readiness:
- validate deploy scripts
- ensure DigitalOcean single-VM deployment remains the target
- keep PostgreSQL on the same VM for now
- preserve Nginx + PM2 + Let's Encrypt flow

9. Deployment sync check:
- review the `/deploy` directory after code changes
- update setup scripts if dependencies or services changed
- update update/deploy scripts if build or runtime commands changed
- update nginx config if routing, websocket, headers, caching, or static output changed
- update PM2 config if process names, entry points, cluster strategy, memory limits, or env vars changed
- update PostgreSQL setup and backup scripts if schema or operational requirements changed
- update DEPLOYMENT.md to reflect the real current deployment process

Do not leave `/deploy` outdated relative to the application.

## DELIVERABLES

- repaired codebase
- explanation of all fixes made
- list of remaining gaps
- prioritized next-step checklist

## CRITICAL

Do not respond with only a plan.
Start making the actual code changes.

Follow the language rules defined in AGENTS.md and STANDARD.md.
