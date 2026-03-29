# DECISIONS

Last updated: 2026-03-19

## D-001: Preserve the existing backend-first monorepo architecture during stabilization

- Status: active
- Decision:
  - Keep the current Node.js + TypeScript + Express + WebSocket + Drizzle/PostgreSQL structure.
  - Prefer narrow production-safety fixes over refactors.
- Why:
  - Existing documentation and repository structure already establish this direction.
  - Current work is stabilization, not redesign.
- Revisit when:
  - a confirmed runtime blocker cannot be fixed safely within the current structure
  - or an explicit architecture change is requested

## D-002: PM2 readiness must be honored by the backend bootstrap

- Status: active
- Decision:
  - Keep `wait_ready: true` in PM2 and make the backend send `process.send?.("ready")` only after `server.listen(...)` succeeds.
- Why:
  - The repository already uses PM2 readiness semantics.
  - Sending the signal from the bootstrap is the smallest safe fix.
- Revisit when:
  - PM2 readiness semantics are intentionally removed from deployment
  - or a different process manager/runtime model replaces PM2

## D-003: Production default must remain single-worker until Redis-backed cross-worker realtime is guaranteed

- Status: active
- Decision:
  - Run the API with a single PM2 worker by default.
- Why:
  - WebSocket client registries are worker-local.
  - Cross-worker realtime delivery depends on Redis/pubsub.
  - Redis is not provisioned or guaranteed by the current default deployment path.
  - Silent realtime correctness loss is worse than reduced throughput.
- Revisit when:
  - Redis is provisioned by default
  - `REDIS_URL` is required and verified in deployment
  - and cross-worker realtime delivery is validated end-to-end

## D-004: Boot-time continuity should resume retryable dispatch states for `DRIVER_NO_RESPONSE` and `DRIVER_REJECTED`

- Status: active
- Decision:
  - Treat persisted trips in `DRIVER_NO_RESPONSE` and `DRIVER_REJECTED` as restart-recoverable.
  - Reuse existing `tryRedispatch(tripId)` at startup rather than introducing new orchestration.
- Why:
  - The dispatcher already defines both statuses as retryable inputs to `tryRedispatch(...)`.
  - Both states can be left behind if the process restarts after the trip status is updated but before the async redispatch continuation runs.
  - Deferring them leaves non-terminal trips stranded and can preserve stale `trip.driverId` linkage to the previous driver until some later manual intervention.
  - Reusing the existing bounded redispatch flow preserves current attempt limits and timeout behavior, which is the narrowest production-safe fix.
- Revisit when:
  - dispatch orchestration is moved to a durable queue/job system
  - or trip/driver ownership semantics are intentionally redesigned

## D-005: Production routing must fail closed to explicit OSRM configuration

- Status: active
- Decision:
  - `ROUTING_PROVIDER` must be explicitly configured as `mock` or `osrm`.
  - Production must use `ROUTING_PROVIDER="osrm"`.
  - Production must not silently fall back to `mock` routing when config is missing, invalid, or OSRM is unavailable.
- Why:
  - Silent routing degradation changes dispatch ranking and fare estimation behavior in ways that are unsafe for production.
  - The smallest safe fix is explicit provider selection plus production fail-closed behavior.
  - `mock` still remains useful for intentional local/dev testing, but should never be treated as a safe production default.
- Revisit when:
  - a different production-safe routing backend is intentionally introduced
  - or routing accuracy/availability semantics are intentionally redesigned
