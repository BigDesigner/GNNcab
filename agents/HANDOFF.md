# HANDOFF

Last updated: 2026-03-19

## Project Snapshot

GNNcab is a backend-first monorepo for a transportation dispatch platform. The core production stack is Node.js, TypeScript, Express, WebSocket, Drizzle ORM, and PostgreSQL, with PM2 and Nginx for deployment.

## Confirmed Current State

- The backend bootstrap is wired to:
  - create the HTTP server
  - attach WebSocket
  - run startup cleanup
  - signal PM2 readiness after the server is actually listening
- PM2 readiness mismatch has been fixed in code.
- Cluster mode was audited and found unsafe by default for the current repository state.
- PM2 production defaults now use a single worker to preserve realtime correctness.
- Startup cleanup now also repairs the highest-risk lost-timer orphan case:
  - `DRIVER_ASSIGNED` trip paired with a driver released from `RESERVED` at boot
  - affected trips are moved to `DRIVER_NO_RESPONSE` and redispatch is resumed
- Startup cleanup now also resumes orphaned `REQUESTED` trips:
  - if a trip is still `REQUESTED` with no assigned driver at boot
  - it is re-entered into the normal `dispatchTrip(...)` flow
- Startup cleanup now also resumes persisted retryable redispatch states:
  - `DRIVER_NO_RESPONSE`
  - `DRIVER_REJECTED`
  - both now re-enter the existing `tryRedispatch(...)` flow at boot
- Browser/runtime boundary hardening is now verified:
  - `ALLOWED_ORIGINS` is required
  - wildcard and unsafe origin values now fail closed at startup
  - HTTP CORS uses the explicit allowlist only
  - browser WebSocket requests with `Origin` must match the same allowlist
- Browser WebSocket token transport is now hardened:
  - browser clients no longer send JWT in the WebSocket URL query string
  - browser clients now send JWT via WebSocket subprotocol
  - server-side WebSocket auth now prefers the subprotocol token
  - browser-style requests that send `Origin` can no longer use query-token fallback
  - temporary query-token fallback remains only for compatibility-oriented no-`Origin` requests
  - successful no-`Origin` query-token fallback authentication now emits narrow observability logs
  - no JWT/token values are logged and auth behavior is unchanged
- Legacy hosted-IDE metadata retirement is now complete at repository metadata level:
  - no active runtime/build/deploy dependency on legacy hosted-IDE metadata was found
  - non-doc legacy hosted-IDE metadata leftovers are removed
  - markdown/spec/process docs and `scripts/post-merge.sh` were intentionally left untouched
- Backend clean-clone closure for Blocker 1 is now verified:
  - committed backend runtime no longer depends on a missing/untracked `pubsub` module
  - `pubsub.ts` is now tracked as a real backend runtime module
  - backend manifest/lock state now includes the required runtime dependency graph for that slice
  - `websocket.ts` required no code change
- Full Blocker 1 is now closed:
  - the frontend websocket authority slice is resolved
  - exactly one authoritative frontend websocket hook implementation remains in the deployable revision
- Blocker 2 is now closed at the content/behavior level:
  - deploy setup/update now use the canonical repo `https://github.com/BigDesigner/GNNcab`
  - deploy setup/update now use the deploy branch `master`
  - update-time nginx application is now explicit and DOMAIN-driven
  - local Ubuntu setup/testing no longer forces Certbot/TLS bootstrap
  - deployment docs now match the verified single-worker safe mode
  - real Linux shell syntax validation still remains as an operational check only
- Blocker 3 is now closed at the patch/content level:
  - production deploy no longer runs the shared seed script
  - first admin creation now requires the explicit `bootstrap-admin` CLI command
  - bootstrap creates exactly one admin and no sample app data
  - development seed remains available, but aborts in production
- Blocker 4 Slice A is now closed at the patch/content level:
  - production setup/update now use checked-in Drizzle migrations instead of live `push`
  - `deploy/update.sh` now requires a successful local backup gate before DB-changing migration
  - `deploy/setup.sh` is now limited to new/empty DB bootstrap and aborts on existing/non-empty DB
  - `DEPLOYMENT.md` now matches this DB deployment truth
  - real Linux shell syntax validation remains an operational check only
- Blocker 4 Slice B is now closed at the patch/content level:
  - `deploy/backup.sh` now guards against partial final backup output and supports stronger verification
  - `deploy/backup-restore.sh` now requires stronger destructive confirmation and an emergency local backup before live primary restore
  - `DEPLOYMENT.md` now contains an executable downtime-based rollback / restore runbook
  - Linux shell syntax validation for backup / restore scripts remains an operational check only
- Backup publication safety now also includes the remaining overwrite guard:
  - `deploy/backup.sh` now aborts if the final archive path already exists
  - `deploy/backup.sh` now aborts if the final checksum path already exists
  - final artifact publication still follows temp-file -> verify -> move
- Local backup invocation/auth truth is now aligned with local PostgreSQL auth:
  - `deploy/backup.sh` now obtains local PostgreSQL access through the `postgres` OS user context
  - root/manual backup use, update-time backup gate use, and restore-time emergency backup use now share one consistent invocation model
  - `DEPLOYMENT.md` now documents that same invocation truth
- Real Ubuntu deploy-script shell validation is now complete:
  - `bash -n` passed for `deploy/setup.sh`, `deploy/update.sh`, `deploy/backup.sh`, and `deploy/backup-restore.sh`
  - `shellcheck deploy/*.sh` was run on Ubuntu
- Deploy shellcheck hardening is now complete for the Ubuntu-reported target files:
  - `deploy/setup.sh`
  - `deploy/backup.sh`
  - `deploy/security-hardening.sh`
  - real Ubuntu shellcheck is now clean for those patched target files
- The production routing mode blocker is now closed at the patch/content level:
  - production can no longer silently fall back to `mock`
  - routing provider selection is now explicit
  - production requires `ROUTING_PROVIDER="osrm"`
  - production OSRM failure now fails closed instead of degrading to straight-line/mock routing
  - `.env.example` and deployment docs now treat `mock` as local/dev-only
- Release packaging flow is now implemented on `master`:
  - latest controlled commit on `master` is `bd2773c072020ac189af9d89918fb01267c4867e` (`fix(deploy): harden shellcheck findings in deploy scripts`)
  - reproducible generated deploy output now builds under `release/gnncab-deploy`
  - `release/` remains generated output only and is not part of the maintained source tree for normal review/audit/patch work
- `master` is currently clean:
  - no pending changes remain in the working tree
  - unrelated dirty development state was safely parked on `codex/parking/pre-shellcheck-dirty-worktree`

## Still Open

- The code/doc deploy-blocker plan is now closed at patch/content level.
- First production deployment still requires remaining operational hardening and high-risk follow-up before it should be treated as low-risk.
- High-risk follow-up remains open after the hard blockers:
  - health/readiness depth
  - `.env.example` alignment
  - localStorage JWT / XSS posture
  - backup / restore drill
- Full no-`Origin` query-token fallback retirement still needs telemetry-backed compatibility validation after deployment/runtime review.

## Do Not Change Casually

- Do not re-enable PM2 cluster mode by default unless Redis/pubsub is provisioned, configured, and verified.
- Do not remove PM2 readiness signaling while `wait_ready: true` remains in PM2 config.
- Do not broaden stabilization work into architecture refactors without a confirmed blocker.

## Safest Next Step

Start with the highest-priority remaining follow-up:
- continue with health/readiness depth
- keep scope narrow and production-oriented

The no-`Origin` WebSocket telemetry review remains a later runtime-validation task, not the immediate coding blocker.

Manual-review shortlist remains relevant to the current blocker plan:
- package/workspace manifests
- `lib/db/src/schema/drivers.ts`
- frontend `use-websocket` file authority/migration

## Maintenance Discipline

Update these operational memory files minimally after meaningful work:

- analysis only:
  - usually `SESSION_STATE.md`, `NEXT_ACTIONS.md`, `HANDOFF.md`
- technical decision:
  - `DECISIONS.md`
- patch applied but not verified:
  - `SESSION_STATE.md`, `NEXT_ACTIONS.md`, `HANDOFF.md`
- patch verified:
  - `VERIFIED_WORKLOG.md` and `NEXT_ACTIONS.md`
- project direction change:
  - `DECISIONS.md`, `SESSION_STATE.md`, `HANDOFF.md`
