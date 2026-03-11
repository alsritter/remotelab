# Remote Capability Monitor (Prompt-First Local Rollout)

This document is the contract for asking an AI agent to set up the recurring product-intelligence watcher on the local machine.

The human should usually only approve missing logins or decide the source and notification policy. Everything else should stay inside the conversation with the AI.

## Copy this prompt

```text
I want you to set up the RemoteLab capability monitor on this machine.

Follow `docs/remote-capability-monitor.md` in this repository as the rollout contract.
Keep the workflow inside this chat.
Do every automatable step yourself.
Only stop for missing inputs or `[HUMAN]` steps.
When you stop, tell me exactly what I need to decide or authorize, and how you'll validate the result afterward.
```

## What the monitor answers

The monitor continuously answers a narrow question set:

- what new signals are appearing around phone-first control of coding agents
- what adjacent tools like `Claude Code` and `Codex` are shipping
- which capability patterns are worth copying into RemoteLab

## [HUMAN] steps

1. Decide which competitors, source feeds, or adjacent surfaces matter if the AI cannot infer them confidently.
2. Approve or finish notification-provider auth if the notifier depends on a browser or external login.
3. Confirm whether the rollout should remain dry-run only or move to scheduled notifications.

## AI execution contract

- keep shared logic in `scripts/remote-capability-monitor.mjs`
- write machine-local config to `~/.config/remotelab/remote-capability-monitor/config.json`
- tune `sources`, `bootstrapHours`, `reportDir`, and `notification` locally rather than hardcoding operator details in the repo
- run a bootstrap dry-run first:

```bash
node scripts/remote-capability-monitor.mjs \
  --config ~/.config/remotelab/remote-capability-monitor/config.json \
  --bootstrap-hours 336 \
  --dry-run \
  --verbose
```

- review the first report in chat, then run normal mode or `--force-notify` if needed
- if recurring rollout is wanted, create a small local wrapper plus scheduler instead of embedding machine-local scheduling inside the repo

## Local config contract

Shared logic lives in `scripts/remote-capability-monitor.mjs`. Machine-local schedule, channels, and source tuning live outside the repo.

Config shape:

```json
{
  "bootstrapHours": 168,
  "reportDir": "~/.remotelab/research/remote-capability-monitor",
  "notification": {
    "notifierPath": "~/.remotelab/scripts/send-multi-channel-reminder.mjs",
    "channels": []
  },
  "sources": []
}
```

Supported source types:

- `google_news_rss` with `query`
- `rss` with `url`
- `atom` with `url`

Per-source tuning can include:

- `lookbackHours`
- `maxItems`
- `baseWeight`
- `target`
- `mustMatchAny`
- `mustMatchAll`
- `lowConfidence`

## Outputs and success state

Typical machine-local outputs are:

- state in `~/.config/remotelab/remote-capability-monitor/`
- reports in `~/.remotelab/research/remote-capability-monitor/`
- optional notifications via the operator's local notifier config

Each healthy run writes:

- a timestamped Markdown report
- a timestamped JSON summary
- `latest.md`
- `latest.json`

## Tuning note

Some competitor names may be ambiguous in public search feeds. When that happens, keep them in a low-confidence bucket and rely on stronger product-specific or official feed sources until the exact site or repo anchor is known.
