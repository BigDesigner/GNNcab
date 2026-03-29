# ARCHITECTURE_NOTES

Last updated: 2026-03-17

## 1) Purpose of this document

Capture non-blocking architectural observations for future planning without changing current stabilization priorities, task order, or active workflow.

## 2) Dispatch Engine Observation

The current dispatch engine is process-centric.

- Dispatch orchestration depends on a single running process.
- Restart continuity is repaired through boot-time recovery logic.
- Safe horizontal scaling requires Redis/pubsub before cluster mode can be enabled.

## 3) Current Safe Operating Model

The current model is stable for present scale and operating assumptions:

- Production default is single-worker safe mode.
- Boot-time cleanup and continuity recovery protect restart-sensitive dispatch paths.
- This observation is not a bug report and does not indicate current instability.

## 4) Potential Future Evolution

If scale or availability requirements increase, likely evolution paths include:

- Making cross-worker realtime guarantees explicit with Redis/pubsub and validated operational wiring.
- Moving more dispatch continuity from process-local timers toward durable orchestration primitives.

These are future architecture considerations, not current implementation requests.

## 5) Why this is NOT a current task

- The current stabilization lane is production hardening and verified risk reduction, not architecture redesign.
- No immediate runtime blocker requires widening scope now.
- Recording this note preserves context for future architecture work while keeping current execution disciplined.
