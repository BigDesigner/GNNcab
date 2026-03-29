# SESSION_SNAPSHOT

Last updated: 2026-03-19

## Session Close Snapshot

- Latest controlled commit:
  - `bd2773c072020ac189af9d89918fb01267c4867e`
  - `fix(deploy): harden shellcheck findings in deploy scripts`
- The tracked deploy-blocker set is now closed at patch/content level.
- `master` is currently clean:
  - no pending changes remain in the working tree
  - unrelated dirty development state was safely parked on `codex/parking/pre-shellcheck-dirty-worktree`
- Release packaging flow is now implemented:
  - reproducible generated deploy output now builds under `release/gnncab-deploy`
  - optional archive output now builds as `release/gnncab-deploy.tar.gz`
  - `release/` is generated output only and must be ignored during normal review, audit, patching, and repository analysis unless explicitly requested
- Production routing mode is now locked to explicit configuration:
  - `ROUTING_PROVIDER` must be explicitly `mock` or `osrm`
  - production must use `osrm`
  - production OSRM failures now fail closed instead of degrading to `mock`
- Backup / restore discipline now includes:
  - verification-gated backup publication
  - stronger destructive restore confirmation
  - emergency local backup before live primary restore
  - executable downtime-based rollback / restore runbook in `DEPLOYMENT.md`
- Real Ubuntu deploy-script shell validation is now complete:
  - `bash -n` passed for `deploy/setup.sh`
  - `bash -n` passed for `deploy/update.sh`
  - `bash -n` passed for `deploy/backup.sh`
  - `bash -n` passed for `deploy/backup-restore.sh`
  - `shellcheck deploy/*.sh` was run on Ubuntu
- Deploy shellcheck hardening is now complete:
  - `deploy/setup.sh`
  - `deploy/backup.sh`
  - `deploy/security-hardening.sh`
  - real Ubuntu shellcheck is now clean for those patched target files

## Current Safe Baseline

- PM2 readiness signaling is fixed.
- Production PM2 default remains single-worker safe mode.
- Startup cleanup now covers the main restart-sensitive dispatch continuity gaps without introducing new orchestration.
- Browser/runtime origin handling now fails closed without wildcard origins.
- Browser WebSocket clients no longer send JWT in the URL query string.
- Browser WebSocket auth now uses subprotocol transport.
- Browser-style (`Origin` present) requests cannot use query-token fallback.
- Temporary server-side query-token fallback remains only for no-`Origin` compatibility.
- Successful no-`Origin` query-token fallback authentication now has minimal server-side logging for retirement decisions.
- Legacy hosted-IDE metadata retirement is complete at repository metadata level without changing runtime/build/deploy behavior.
- Full Blocker 1 is now closed.
- Blocker 2 is now closed at the content/behavior level.
- Blocker 3 is now closed at the patch/content level.
- Full Blocker 4 is now closed at the patch/content level.
- Production routing mode blocker is now closed at the patch/content level.
- Backup publication now also refuses to overwrite existing final artifacts silently.
- Real Ubuntu shell syntax validation is complete for the tracked deploy and backup/restore scripts.
- Deploy shellcheck hardening is complete for the three Ubuntu-reported target files.
- Release packaging flow is available without creating a second maintained codebase.

## Remaining Open Work

- High-risk follow-up after shellcheck hardening:
  - health endpoint depth / readiness
  - `.env.example` alignment with runtime truth
  - localStorage JWT / XSS posture
  - backup / restore operational drill
- Post-deploy/runtime validation remains open for:
  - 7-day review of no-`Origin` query-token fallback-hit telemetry
  - final no-`Origin` fallback retirement decision
  - long-term realtime production direction
- Manual-review shortlist remains open for:
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `lib/db/src/schema/drivers.ts`
  - frontend websocket hook migration

## Current Next Task

- Continue with health/readiness depth.

## Important Decisions

- PM2 production must stay single-worker by default unless Redis-backed cross-worker realtime is intentionally provisioned and verified.
- PM2 readiness signaling must remain in place while `wait_ready` is used.
- Startup recovery must remain responsible for restart continuity of the current in-process dispatch flow.
- Browser/runtime origin handling must stay explicit and must not use wildcard origins.
- Browser WebSocket auth must keep using subprotocol transport.
- Query-token auth is temporary compatibility fallback only, and must not be used for browser-style (`Origin` present) requests.
- Dispatch orchestration must not be redesigned without an explicit decision to widen scope.
- Production routing must fail closed to explicit OSRM configuration and must not silently fall back to `mock`.

## Working Tree Reminder

- `master` is currently clean.
- Unrelated dirty development state was preserved separately on `codex/parking/pre-shellcheck-dirty-worktree`.
