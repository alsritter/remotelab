# Documentation Map

This repo now keeps documentation in four layers:

- `README.md` / `README.zh.md` — top-level product overview, setup path, and daily operations
- `docs/` — current, shareable documentation for humans and contributors
- `notes/` — internal design notes, grouped by status so current truth does not get mixed with future direction or historical rationale
- `AGENTS.md` — repo-local operating rules and high-signal context for coding agents

## Canonical Spine

Read these first when you need the current truth:

1. `../AGENTS.md` — repo rules, constraints, active priorities
2. `../README.md` / `../README.zh.md` — product framing, setup path, operator-facing expectations
3. `project-architecture.md` — current shipped architecture and code map
4. `../notes/current/core-domain-contract.md` — current domain/refactor baseline
5. `setup.md` / `external-message-protocol.md` / other focused guides as needed

## Keep These In Sync

When the system changes, update the matching surface instead of letting discussion notes carry the only truth:

- product positioning, setup flow, or user-visible workflow changes → `../README.md` and `../README.zh.md`
- runtime topology, persistence model, code map, or request flow changes → `project-architecture.md`
- repo rules, self-hosting workflow, or protected surfaces change → `../AGENTS.md`
- domain/refactor baseline changes → `../notes/current/core-domain-contract.md`
- outdated or conflicting notes → trim them, archive them, or rewrite them to point at the canonical doc

## Configuration Docs Principle

For setup, deployment, and connector docs, assume the operator is human but the configured system is an AI toolchain.

- the default human action is to copy a prompt into their own AI coding agent
- the main execution should stay inside that chat, not in the document
- the document should explicitly mark only the steps that truly require a human with `[HUMAN]`
- a good config doc includes the prompt, required inputs, target state, exact config artifacts or paths, and concise validation
- avoid full command-by-command walkthroughs for steps the AI can execute or repair on its own

## What Lives In `docs/`

### Current Core

- `project-architecture.md` — top-down map of the shipped system
- `setup.md` — prompt-first setup contract, human checkpoints, and target state
- `external-message-protocol.md` — canonical integration contract for external channels
- `creating-apps.md` — user/developer guide for Apps

### Focused Integrations

- `cloudflare-email-worker.md` — prompt-first Cloudflare Email Worker deployment contract
- `feishu-bot-setup.md` — prompt-first operator + console contract for the RemoteLab Feishu connector
- `github-auto-triage.md` — prompt-first GitHub intake and auto-reply rollout contract
- `remote-capability-monitor.md` — prompt-first local rollout contract for remote-agent capability monitoring

## What Lives In `notes/`

See `../notes/README.md` for the note taxonomy.

Short version:

- `../notes/current/` — current baseline notes that still matter operationally
- `../notes/directional/` — future-facing design direction
- `../notes/archive/` — historical RFCs, investigations, and superseded merge notes
- `../notes/local/` — machine/operator-specific state that should not be treated as shared architecture truth

## Authoring Rule

Before adding a new doc, ask:

1. Is this current truth or a discussion artifact?
2. Does a shorter update to an existing canonical doc solve it better?
3. Is it for users/operators, or for internal design work?
4. Will it still be true after the next refactor, or is it historical rationale?

If the answer is unclear, prefer:

- `README.md` / `README.zh.md` for user-facing overview and setup
- `docs/` for current operational truth
- `notes/directional/` for future design
- `notes/archive/` for investigation history
