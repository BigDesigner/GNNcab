# NEXT_ACTIONS

Last updated: 2026-03-19

## Verified Complete

- [x] Patch the backend bootstrap to send the PM2 ready signal after the HTTP server is actually listening.
- [x] Verify the bootstrap order still preserves WebSocket setup and startup cleanup before readiness.
- [x] Change the production PM2 default from unsafe cluster mode to a single-worker safe default.
- [x] Verify the PM2 config now defaults to `instances: 1` and `exec_mode: "fork"`.
- [x] Implement the smallest safe boot-time recovery for orphaned `REQUESTED` trips whose async initial dispatch never resumed after restart.
- [x] Add an explicit no-overwrite guard so `deploy/backup.sh` refuses to replace existing final backup artifacts silently.
- [x] Align local backup invocation with the local PostgreSQL auth model so root/manual backup, the update-time backup gate, and restore-time emergency backup use one consistent path.
- [x] Run real Linux shell syntax validation for `deploy/setup.sh` and `deploy/update.sh`.
- [x] Run real Linux shell syntax validation for `deploy/backup.sh` and `deploy/backup-restore.sh`.

## Active Next Steps

- [x] Align deployment-facing markdown with the single-worker safe default and the Redis requirement for future cluster mode.
- [x] Audit startup cleanup against dispatch/trip orphan scenarios, not only orphaned `RESERVED` drivers.
- [x] Implement the smallest safe boot-time repair for orphaned dispatch/trip states, starting with `DRIVER_ASSIGNED` + `RESERVED/AVAILABLE` divergence after restart.
- [x] Decide whether remaining boot-time orphan states (`DRIVER_NO_RESPONSE`, `DRIVER_REJECTED`, `REQUESTED`) need targeted repair or can remain deferred.
- [x] Decide whether the remaining `DRIVER_NO_RESPONSE` / `DRIVER_REJECTED` restart continuity gaps should be repaired or explicitly deferred.
- [x] Implement the narrow startup recovery for persisted `DRIVER_NO_RESPONSE` and `DRIVER_REJECTED` trips by reusing `tryRedispatch(...)`.
- [x] Verify the boot-time `DRIVER_NO_RESPONSE` / `DRIVER_REJECTED` recovery path at code and type-check level.
- [x] Audit CORS behavior against production requirements, especially wildcard fallback behavior.
- [x] Audit WebSocket connection validation beyond JWT parsing, including origin/production boundary expectations.
- [x] Harden browser/runtime origin handling so `ALLOWED_ORIGINS` fails closed and wildcard origins are rejected.
- [x] Remove browser WebSocket JWT carriage through the URL query string and move browser transport to WebSocket subprotocols.
- [x] Verify browser WebSocket token transport hardening at API and frontend TypeScript level.
- [x] Apply a transitional restriction so browser-style WebSocket requests (`Origin` present) can no longer use query-token fallback.
- [x] Verify the transitional WebSocket fallback restriction at backend TypeScript level.
- [x] Audit no-`Origin` compatibility fallback usage and define the narrowest safe full-retirement path for query-token auth.
- [x] Add minimal observability for successful no-`Origin` query-token fallback authentication without logging JWT/token values.
- [x] Confirm no active hosted-IDE runtime/build/deploy dependency remains and remove non-doc hosted-IDE metadata leftovers only.

## Deploy Blockers

- [x] Establish a clean reproducible deployable revision.
- [x] Close the backend half of Blocker 1 by making the committed backend runtime complete from a clean clone:
  - `artifacts/api-server/src/lib/pubsub.ts`
  - `artifacts/api-server/package.json`
  - `pnpm-lock.yaml`
- [x] Close the frontend half of Blocker 1 by making the frontend websocket authority slice clean-clone complete:
  - keep one authoritative websocket hook implementation
  - remove legacy frontend websocket-hook ambiguity from the deployable revision
- [x] Replace placeholder repo assumptions with the real repo URL and real deployment branch in `deploy/setup.sh` and `deploy/update.sh`.
- [x] Make nginx config propagation explicit in the update flow so deploy-time nginx changes actually reach production.
- [x] Remove production seeding from the deploy path and define a safe admin bootstrap path.
- [x] Close Blocker 4 Slice A at the patch/content level:
  - move the production schema path to checked-in Drizzle migrations
  - require a successful local backup gate before DB-changing update-time migration
  - treat `deploy/setup.sh` as new/empty DB bootstrap only and abort on existing/non-empty DB
- [x] Close Blocker 4 Slice B:
  - harden `backup.sh`
  - harden `backup-restore.sh`
  - define and document the executable rollback runbook
- [x] Decide and lock the intended production routing mode so production cannot fall into accidental `mock` routing.

## Remaining Operational Checks

- [x] Apply narrow shellcheck hardening for `deploy/setup.sh`.
- [x] Apply narrow shellcheck hardening for `deploy/backup.sh`.
- [x] Apply narrow shellcheck hardening for `deploy/security-hardening.sh`.

## Immediate Next Task

- [ ] Deepen health/readiness beyond the current shallow health endpoint.

## High-Risk Follow-Up

- [ ] Align `.env.example` and deploy-facing guidance with current runtime truth.
- [ ] Review and decide the localStorage JWT / XSS posture.
- [ ] Run and document a backup / restore operational drill.

## Post-Deploy Runtime Validation

- [ ] Run a 7-day production telemetry review for no-`Origin` query-token fallback usage using:
  - `"[WS] Query-token fallback authenticated for no-Origin request"`
- [ ] Approve full fallback removal only if all are true:
  - zero fallback-hit usage across the full 7-day review window
  - healthy WebSocket traffic is present in the same window
  - no known logging gaps during the review window
  - no known external/non-browser/native dependency on query-token fallback
- [ ] Decide and document the long-term production direction:
  - single-worker realtime
  - or Redis-backed cluster mode

## Rules For Updating This File

- Mark an item complete only after the repository state or resulting behavior has been verified.
- If work is patched but not yet verified, keep the item unchecked and reflect that state in `SESSION_STATE.md`.
