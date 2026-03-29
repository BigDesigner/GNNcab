# AI_GUARDRAILS

Last updated: 2026-03-17

## Purpose

Define mandatory operational safety rules for AI-driven development in this repository.

## 1) Scope Guardrail

AI must not widen task scope without explicit user instruction. If a broader path is needed, stop and request confirmation.

## 2) Minimal Patch Rule

All fixes must follow the smallest safe fix principle: solve the required problem with minimal surface-area change.

## 3) Architecture Protection

Core architecture must not be modified unless the task explicitly requests architectural change.

## 4) Dirty Worktree Protection

When the worktree is dirty, AI must stage only approved task files. AI must never stage the entire worktree and must never use `git add .`.

## 5) Commit Discipline

Each commit must contain one logical, coherent change set that matches the verified task outcome.

## 6) Repository Truth Rule

Repository code is the source of truth. If documentation and code disagree, resolve against current repository state and record corrections explicitly.

## 7) Verification Requirement

Security-sensitive or runtime-impacting patches must pass explicit verification before acceptance (for example targeted type checks/tests or equivalent runtime validation).

## 8) Operational Memory Discipline

Operational memory files must record verified outcomes only. Do not record assumptions, intended changes, or unverified claims as complete.

## 9) Snapshot Discipline

`agents/SESSION_SNAPSHOT.md` must be refreshed only when handoff state is clean: verified outcomes are recorded, open risks are explicit, and next task is precise.

## 10) Production Safety

AI must avoid changes that can break realtime dispatch behavior, worker correctness, or boot-time continuity without explicit review and approval.
