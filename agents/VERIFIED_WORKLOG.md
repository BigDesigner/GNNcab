# VERIFIED_WORKLOG

Last updated: 2026-03-19

## 2026-03-16 — PM2 readiness fix verified

- What was done:
  - Added PM2 ready signaling to the backend bootstrap.
- Files involved:
  - `artifacts/api-server/src/index.ts`
- How it was verified:
  - Inspected the bootstrap order directly in code.
  - Confirmed `process.send?.("ready")` is inside the `server.listen(...)` callback.
  - Confirmed WebSocket setup and startup cleanup still occur before readiness.
- Resulting status:
  - Verified at code level.
  - PM2 readiness contract is now implemented by the backend bootstrap.

## 2026-03-16 — Production PM2 safe default verified

- What was done:
  - Changed PM2 production defaults from multi-worker cluster mode to single-worker mode.
- Files involved:
  - `deploy/ecosystem.config.cjs`
- How it was verified:
  - Reviewed the updated PM2 config after patching.
  - Confirmed `instances: 1` and `exec_mode: "fork"` are now the active defaults.
- Resulting status:
  - Verified at configuration level.
  - Production defaults now match the repository's current realtime-safe operating mode.

## 2026-03-16 — Deployment-facing markdown aligned with verified runtime truth

- What was done:
  - Updated deployment documentation to match the verified PM2/runtime behavior.
- Files involved:
  - `DEPLOYMENT.md`
- How it was verified:
  - Reviewed the deployment guide after patching.
  - Confirmed it now states:
    - PM2 defaults to a single worker
    - backend readiness signaling is implemented
    - multi-worker cluster mode requires Redis/pubsub first
- Resulting status:
  - Verified at documentation level.
  - Deployment-facing guidance now matches the current repository-safe production mode.

## 2026-03-16 — Startup cleanup extended for orphaned assigned-trip divergence

- What was done:
  - Extended boot-time cleanup to reconcile the highest-risk restart orphan case:
    - trip still `DRIVER_ASSIGNED`
    - assigned driver had been `RESERVED`
    - boot cleanup released that driver back to `AVAILABLE`
  - The boot flow now moves those trips to `DRIVER_NO_RESPONSE`, records a trip event, and resumes redispatch.
- Files involved:
  - `artifacts/api-server/src/lib/startup.ts`
- How it was verified:
  - Reviewed the patched startup flow in code.
  - Confirmed it targets only trips in `DRIVER_ASSIGNED` whose `driverId` matches a released previously-`RESERVED` driver.
  - Confirmed it transitions those trips into a retryable state and calls `tryRedispatch(...)`.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at code and type-check level.
  - The previously confirmed highest-risk trip/driver divergence is now repaired at boot.

## 2026-03-16 — Startup cleanup extended for orphaned requested-trip recovery

- What was done:
  - Extended boot-time cleanup to resume dispatch for persisted trips that were still `REQUESTED` with no assigned driver.
- Files involved:
  - `artifacts/api-server/src/lib/startup.ts`
- How it was verified:
  - Reviewed the patched startup flow in code.
  - Confirmed it targets only trips with:
    - `status = REQUESTED`
    - `driverId IS NULL`
  - Confirmed it re-enters those trips into the existing `dispatchTrip(...)` flow at boot.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at code and type-check level.
  - Orphaned `REQUESTED` trips no longer remain blocked purely because async initial dispatch was lost on restart.

## 2026-03-17 â€” Startup cleanup extended for persisted redispatch states

- What was done:
  - Extended boot-time cleanup to resume redispatch for persisted trips already in:
    - `DRIVER_NO_RESPONSE`
    - `DRIVER_REJECTED`
  - Reused the existing `tryRedispatch(...)` path instead of introducing new orchestration.
- Files involved:
  - `artifacts/api-server/src/lib/startup.ts`
- How it was verified:
  - Reviewed the patched startup flow in code.
  - Confirmed it selects only trips whose persisted status is `DRIVER_NO_RESPONSE` or `DRIVER_REJECTED`.
  - Confirmed each selected trip is passed into existing `tryRedispatch(...)`.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at code and type-check level.
  - Retryable trips in `DRIVER_NO_RESPONSE` / `DRIVER_REJECTED` no longer remain stranded purely because async redispatch was lost on restart.

## 2026-03-17 - Browser realtime boundary hardening verified

- What was done:
  - Hardened browser/runtime origin handling so `ALLOWED_ORIGINS` is required, wildcard origins are rejected, and unsafe origin values fail closed at startup.
  - Applied the explicit origin allowlist to HTTP CORS.
  - Enforced the same origin boundary for browser-style WebSocket requests that send `Origin`.
  - Removed browser WebSocket JWT carriage through the URL query string.
  - Moved browser WebSocket JWT transport to WebSocket subprotocols.
  - Made server-side WebSocket auth prefer the subprotocol token while retaining temporary query-token fallback for compatibility.
- Files involved:
  - `artifacts/api-server/src/app.ts`
  - `artifacts/api-server/src/lib/websocket.ts`
  - `artifacts/gnncab/src/hooks/use-websocket.tsx`
- How it was verified:
  - Reviewed the updated browser origin and WebSocket auth paths directly in code.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
  - Ran `npx.cmd tsc -p artifacts/gnncab/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at code and type-check level.
  - Browser WebSocket clients no longer send JWT in the URL query string.
  - Browser WebSocket auth now uses subprotocol transport.
  - Server-side query-token fallback still remains temporarily for compatibility and is not yet removed.

## 2026-03-17 - Transitional WebSocket query-token fallback restriction verified

- What was done:
  - Applied a transitional server-side auth restriction for WebSocket token transport.
  - Browser-style requests that send `Origin` can no longer authenticate via query-token fallback.
  - Subprotocol token transport remains the primary path.
  - Temporary query-token fallback remains available only for compatibility-oriented no-`Origin` requests.
- Files involved:
  - `artifacts/api-server/src/lib/websocket.ts`
- How it was verified:
  - Reviewed the updated token selection and origin-gated fallback path in code.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at code and type-check level.
  - Browser-origin requests are no longer eligible for query-token fallback.
  - Full query-token fallback removal is still pending compatibility validation.

## 2026-03-17 - No-Origin WebSocket query-token fallback observability verified

- What was done:
  - Added narrow server-side observability for successful no-`Origin` query-token fallback authentication.
  - Preserved auth behavior: subprotocol remains primary, and fallback acceptance rules were not changed.
  - Kept logs safe by excluding JWT/token values.
- Files involved:
  - `artifacts/api-server/src/lib/websocket.ts`
- How it was verified:
  - Reviewed the fallback-path observability logic directly in code.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at code and type-check level.
  - Fallback-hit logging now exists only for successful no-`Origin` query-token fallback authentication.
  - Full query-token fallback removal is still pending telemetry-backed compatibility confirmation.

## 2026-03-17 - Legacy hosted-IDE metadata retirement verified

- What was done:
  - Audited the repository for active hosted-IDE dependency and confirmed none remained in the current runtime, build, deploy, or operational flow.
  - Removed the remaining non-doc legacy hosted-IDE metadata leftovers only.
  - Left markdown/spec/process docs and `scripts/post-merge.sh` intentionally untouched.
- Files involved:
  - legacy hosted-IDE metadata files
  - legacy hosted-IDE artifact manifests
- How it was verified:
  - Reviewed the repository for hosted-IDE-coupled runtime, build, deploy, and workflow references.
  - Confirmed only metadata leftovers remained in the approved cleanup slice.
- Resulting status:
  - Verified at repository metadata level.
  - Legacy hosted-IDE metadata retirement is now complete at repository metadata level.
  - No active runtime/build/deploy dependency on hosted-IDE metadata was found.

## 2026-03-17 - Backend clean-clone closure slice for Blocker 1 verified

- What was done:
  - Closed the backend half of Blocker 1 by making the committed backend runtime complete for the existing `websocket.ts -> pubsub.ts` path.
  - Tracked `artifacts/api-server/src/lib/pubsub.ts` as a real backend runtime module.
  - Added the required backend runtime dependency for `pubsub`.
  - Reduced lockfile movement to the minimal backend dependency graph needed for that slice.
- Files involved:
  - `artifacts/api-server/src/lib/pubsub.ts`
  - `artifacts/api-server/package.json`
  - `pnpm-lock.yaml`
- How it was verified:
  - Reviewed the backend import/dependency path directly in repository code.
  - Confirmed `artifacts/api-server/src/lib/websocket.ts` required no code change.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at code and type-check level.
  - The backend runtime no longer depends on a missing/untracked `pubsub` module.
  - The backend half of Blocker 1 is now closed.
  - At the time of this backend-half verification, the frontend authority slice still remained open.

## 2026-03-18 - Blocker 2 deployment-truth alignment verified at content/behavior level

- What was done:
  - Aligned the setup/update/deployment path with the canonical repository and deployment truth.
  - Set the canonical repo URL to `https://github.com/BigDesigner/GNNcab`.
  - Set the canonical deploy branch to `master`.
  - Made `deploy/update.sh` require explicit `DOMAIN` and re-apply the repo nginx template before reload.
  - Added local-domain / local-Ubuntu deploy-script handling without forced Certbot/TLS bootstrap.
  - Updated deployment-facing documentation to match the explicit DOMAIN-driven flow and single-worker safe mode.
- Files involved:
  - `deploy/setup.sh`
  - `deploy/update.sh`
  - `DEPLOYMENT.md`
- How it was verified:
  - Reviewed the patched setup/update script behavior directly in repository code.
  - Reviewed the deployment guide after patching.
  - Confirmed the accepted repository-truth outcomes were present in file content.
  - Attempted shell syntax validation, but real Linux-shell validation could not be completed in the current Windows environment.
- Resulting status:
  - Verified at content/behavior level.
  - Blocker 2 is now closed.
  - Real Linux shell syntax validation remains a separate operational check and is not keeping Blocker 2 open.

## 2026-03-18 - Blocker 3 production-bootstrap hardening verified at patch/content level

- What was done:
  - Removed production deploy-time use of the shared seed script.
  - Added a dedicated `bootstrap-admin` CLI command for first-admin creation.
  - Kept sample seeding available for development only and added a production abort guard to the seed script.
  - Updated deployment guidance so production uses explicit admin bootstrap instead of seed.
- Files involved:
  - `deploy/setup.sh`
  - `DEPLOYMENT.md`
  - `scripts/package.json`
  - `scripts/src/seed.ts`
  - `scripts/src/bootstrap-admin.ts`
- How it was verified:
  - Reviewed the patched deploy and scripts flow directly in repository code.
  - Confirmed production deploy no longer runs `pnpm --filter @workspace/scripts run seed`.
  - Confirmed `bootstrap-admin` creates only the first admin and aborts safely when admin/email state is unexpected.
  - Ran `npx.cmd tsc -p scripts/tsconfig.json --noEmit` successfully.
- Resulting status:
  - Verified at patch/content level.
  - Blocker 3 is now closed.
  - Development seed remains available, but production deploy no longer runs it.
  - Linux shell syntax validation for `deploy/setup.sh` remains a separate operational check.

## 2026-03-18 - Blocker 4 Slice A database deployment discipline verified at patch/content level

- What was done:
  - Replaced live production `drizzle-kit push` usage with checked-in Drizzle migrations as the authoritative production schema path.
  - Added authoritative `migrate` and maintainer-facing `generate` scripts in the DB workspace package.
  - Added checked-in baseline migration assets under `lib/db/drizzle/`.
  - Updated `deploy/update.sh` to require a successful local backup gate before DB-changing migration.
  - Updated `deploy/setup.sh` so setup is limited to new/empty DB bootstrap and aborts on an existing non-empty DB.
  - Updated deployment documentation to match the checked-in migration and backup-gated update flow.
- Files involved:
  - `lib/db/package.json`
  - `lib/db/drizzle/0000_init.sql`
  - `lib/db/drizzle/meta/0000_snapshot.json`
  - `lib/db/drizzle/meta/_journal.json`
  - `deploy/setup.sh`
  - `deploy/update.sh`
  - `DEPLOYMENT.md`
- How it was verified:
  - Generated the baseline migration using the local Drizzle CLI already present in the repository.
  - Reviewed the patched setup/update/documentation flow directly in repository code.
  - Ran `npx.cmd tsc -p lib/db/tsconfig.json --noEmit` successfully.
  - Attempted Linux-shell syntax validation for the deploy scripts, but it could not be completed in the current Windows environment.
- Resulting status:
  - Verified at patch/content level.
  - Blocker 4 Slice A is now closed.
  - Full Blocker 4 remains open pending Slice B backup/restore hardening and executable rollback runbook work.
  - Linux shell syntax validation remains a separate operational check only.

## 2026-03-18 - Blocker 4 Slice B backup/restore hardening verified at patch/content level

- What was done:
  - Hardened the local backup script so final backup artifacts are only published after successful dump, gzip integrity check, and checksum creation.
  - Added backup verification improvements and made retention cleanup safe to run without accidentally producing a new backup.
  - Hardened the restore script so destructive live restore requires stronger confirmation, an emergency local full backup first, and the expected DB owner role before recreation.
  - Added and documented an executable downtime-based rollback / restore runbook in the deployment guide.
- Files involved:
  - `deploy/backup.sh`
  - `deploy/backup-restore.sh`
  - `DEPLOYMENT.md`
- How it was verified:
  - Reviewed the patched backup and restore flow directly in repository code.
  - Ran `git diff --check -- deploy/backup.sh deploy/backup-restore.sh DEPLOYMENT.md` successfully aside from CRLF normalization warnings in the Windows worktree.
  - Verified the staged set contained only the approved Slice B files before commit.
  - Committed the slice as `b6749d20e0c76d0059b07a851a099443c95b6e8b` with message:
    - `deploy(backup): harden backup restore flow and add rollback runbook`
- Resulting status:
  - Verified at patch/content level.
  - Blocker 4 Slice B is now closed.
  - Full Blocker 4 is now closed at the patch/content level.
  - Linux shell syntax validation remains a separate operational check only.

## 2026-03-19 - Production routing mode blocker verified at patch/content level

- What was done:
  - Removed silent fallback to `mock` routing when `ROUTING_PROVIDER` is missing or invalid.
  - Made routing provider selection explicit: only `mock` or `osrm` are accepted.
  - Enforced production fail-closed behavior so production requires `ROUTING_PROVIDER="osrm"`.
  - Required `OSRM_BASE_URL` when `ROUTING_PROVIDER="osrm"`.
  - Prevented production OSRM failures from degrading to straight-line/mock routing.
  - Updated env and deployment guidance so `mock` remains local/dev-only.
- Files involved:
  - `.env.example`
  - `DEPLOYMENT.md`
  - `artifacts/api-server/src/lib/routing.ts`
- How it was verified:
  - Reviewed the patched routing provider selection and OSRM failure behavior directly in repository code.
  - Ran `npx.cmd tsc -p artifacts/api-server/tsconfig.json --noEmit` successfully.
  - Ran `git diff --check -- artifacts/api-server/src/lib/routing.ts .env.example DEPLOYMENT.md` successfully aside from CRLF normalization warnings in the Windows worktree.
  - Verified the staged set contained only the approved routing blocker files before commit.
  - Committed the slice as `0b3b40e2f11b3209c27ec8b5151d885604488ead` with message:
    - `fix(routing): fail closed for production routing mode`
- Resulting status:
  - Verified at patch/content level.
  - The production routing mode blocker is now closed.
  - The tracked deploy-blocker set is now closed at patch/content level.
  - Linux shell syntax validation remains a separate operational check only.

## 2026-03-19 - Backup artifact no-overwrite guard verified

- What was done:
  - Added an explicit no-overwrite guard before final backup artifact promotion.
  - `deploy/backup.sh` now aborts if the final archive path already exists.
  - `deploy/backup.sh` now aborts if the final checksum path already exists.
  - Preserved the existing temp-file -> verify -> move publication flow.
- Files involved:
  - `deploy/backup.sh`
- How it was verified:
  - Reviewed the patched final-path guard logic directly in repository code.
  - Ran `git diff --check -- deploy/backup.sh` successfully aside from CRLF normalization warnings in the Windows worktree.
  - Verified the staged set contained only the approved sub-slice file before commit.
  - Committed the sub-slice as `3033b2f89d3f4c89e293f6c81cace06655ff0960` with message:
    - `fix(backup): prevent overwrite of final backup artifacts`
- Resulting status:
  - Verified at patch/content level.
  - The remaining reviewed `backup.sh` overwrite-safety gap is now closed.
  - Real Linux shell syntax validation for deploy and backup/restore scripts still remains a separate operational check only.

## 2026-03-19 - Deploy backup invocation/auth model alignment verified

- What was done:
  - Aligned local backup invocation with the repository's local PostgreSQL auth model.
  - `deploy/backup.sh` now obtains local PostgreSQL access through the `postgres` OS user context.
  - Root/manual, update-time backup gate, and restore-time emergency backup paths now use one consistent local backup invocation model.
  - Deployment-facing documentation now matches that invocation truth.
- Files involved:
  - `DEPLOYMENT.md`
  - `deploy/backup.sh`
- How it was verified:
  - Reviewed the patched local backup invocation flow directly in repository code.
  - Confirmed the backup script now supports the intended `root` and `postgres` operator contexts while routing local PostgreSQL access through the `postgres` OS user.
  - Ran `git diff --check -- deploy/backup.sh DEPLOYMENT.md` successfully aside from CRLF normalization warnings in the Windows worktree.
  - Verified the staged set contained only the approved files before commit.
  - Committed the slice as `bc1601f285e20e31ce857f41c06c59d8dc873ae0` with message:
    - `fix(deploy): align backup invocation with local postgres auth`
- Resulting status:
  - Verified at patch/content level.
  - Local backup invocation/auth truth is now aligned across setup-time auth assumptions, update-time backup gate, manual/root backup use, and restore-time emergency backup use.
  - Real Linux shell syntax validation for deploy and backup/restore scripts still remains a separate operational check only.

## 2026-03-19 - Real Ubuntu deploy-script shell validation verified

- What was done:
  - Ran real Ubuntu shell syntax validation from `~/gnncab-deploy`.
  - Confirmed `bash -n` passed with no syntax error output for:
    - `deploy/setup.sh`
    - `deploy/update.sh`
    - `deploy/backup.sh`
    - `deploy/backup-restore.sh`
  - Installed `shellcheck` on Ubuntu and ran `shellcheck deploy/*.sh`.
- Files involved:
  - `deploy/setup.sh`
  - `deploy/update.sh`
  - `deploy/backup.sh`
  - `deploy/backup-restore.sh`
  - `deploy/security-hardening.sh`
- How it was verified:
  - Real Ubuntu commands executed:
    - `bash -n deploy/setup.sh`
    - `bash -n deploy/update.sh`
    - `bash -n deploy/backup.sh`
    - `bash -n deploy/backup-restore.sh`
    - `sudo apt install shellcheck -y`
    - `shellcheck deploy/*.sh`
  - Confirmed all four `bash -n` checks passed with no syntax error output.
  - Preserved the reported `shellcheck` findings exactly:
    - `deploy/backup.sh`:
      - `SC2317` info on cleanup lines for temporary backup/checksum removal
      - `SC2015` info on the remote-sync `A && B || C` pattern
    - `deploy/security-hardening.sh`:
      - `SC2034` warning for unused `EMAIL`
      - multiple `SC2015` infos on `A && B || C` status-check patterns
    - `deploy/setup.sh`:
      - `SC2046` warning on unquoted command substitution in the SSH config backup path
- Resulting status:
  - Verified at operational-validation level on real Ubuntu.
  - Real Linux shell syntax validation is now complete for the tracked deploy and backup/restore scripts.
  - Shell syntax validation is no longer the immediate open operational check.
  - Narrow shellcheck hardening remains open for:
    - `deploy/setup.sh`
    - `deploy/backup.sh`
    - `deploy/security-hardening.sh`

## 2026-03-19 - Deploy shellcheck hardening verified

- What was done:
  - Applied the narrow shellcheck-hardening slice for the remaining Ubuntu-reported deploy-script findings.
  - Fixed the quoted command-substitution warning in `deploy/setup.sh`.
  - Replaced pseudo-if/else `A && B || C` status-check patterns with explicit `if ...; then ...; else ...; fi` blocks where needed.
  - Preserved the cleanup trap behavior in `deploy/backup.sh` and documented the indirect trap invocation with a narrow `SC2317` suppression at the exact location.
  - Preserved the legacy second positional argument shape in `deploy/security-hardening.sh` without leaving an unused variable binding.
- Files involved:
  - `deploy/setup.sh`
  - `deploy/backup.sh`
  - `deploy/security-hardening.sh`
- How it was verified:
  - Committed the slice on `master` as `bd2773c072020ac189af9d89918fb01267c4867e` with message:
    - `fix(deploy): harden shellcheck findings in deploy scripts`
  - Real Ubuntu shellcheck is now clean for the patched target files:
    - `deploy/setup.sh`
    - `deploy/backup.sh`
    - `deploy/security-hardening.sh`
- Resulting status:
  - Verified at patch/content and Ubuntu static-analysis level.
  - The narrow deploy shellcheck-hardening slice is now complete.
  - Health/readiness depth is now the next safe follow-up.

## Verification Scope Note

- Entries in this file reflect repository/code/config verification.
- They do not imply that full production deployment or live PM2 runtime validation has already been performed.
