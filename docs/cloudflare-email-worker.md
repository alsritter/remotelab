# Cloudflare Email Worker (Prompt-First Deploy Contract)

This document is the operator contract for asking an AI agent to deploy the thin Cloudflare email edge while keeping RemoteLab's business logic local.

## Copy this prompt

```text
I want you to deploy or update the RemoteLab Cloudflare Email Worker.

Follow `docs/cloudflare-email-worker.md` in this repository as the deployment contract.
Keep the workflow inside this chat.
Do every automatable step yourself.
Only stop for missing inputs or `[HUMAN]` steps.
When you stop, tell me exactly what I need to do in Cloudflare and how you'll validate it afterward.
```

## Architecture

`Cloudflare Email Routing -> Cloudflare Email Worker(email) -> mailbox bridge -> local agent-mail-worker -> RemoteLab -> completion target -> Cloudflare Email Worker(fetch) -> Cloudflare send_email`

## Thin-edge rule

- Cloudflare only does inbound receive and outbound send.
- RemoteLab and the local mailbox stack keep filtering, review, automation, session routing, and replies.
- Edge config stays thin so provider migration remains easy.

## [HUMAN] steps

1. Authenticate Wrangler or Cloudflare if the machine is not already logged in.
2. Create or confirm the Cloudflare Email Routing rule that sends the mailbox alias to the Worker.
3. Provide any mailbox identity values the AI cannot infer, such as sender address, worker URL, or mailbox bridge URL.

## AI execution contract

- copy `cloudflare/email-worker/wrangler.example.jsonc` to the gitignored local `cloudflare/email-worker/wrangler.jsonc`
- keep only `MAILBOX_FROM` and `MAILBOX_BRIDGE_URL` in Worker config
- read or confirm the local mailbox tokens from `~/.config/remotelab/agent-mailbox/outbound.json` and `~/.config/remotelab/agent-mailbox/bridge.json`
- deploy with `cloudflare/email-worker/deploy.sh`
- return the Worker URL, confirm `GET /healthz`, and validate the mailbox bridge path after deploy

## Worker config contract

Local `wrangler.jsonc` should only carry:

- `MAILBOX_FROM`
- `MAILBOX_BRIDGE_URL`

Secrets uploaded during deploy:

- `OUTBOUND_API_TOKEN`
- `MAILBOX_BRIDGE_TOKEN`

The Worker should not carry RemoteLab login or session-orchestration config. That logic stays in the local mailbox stack.

## Local outbound config contract

```json
{
  "provider": "cloudflare_worker",
  "workerBaseUrl": "https://remotelab-email-worker.example.workers.dev",
  "from": "agent@example.com",
  "workerToken": "<same token uploaded as OUTBOUND_API_TOKEN>"
}
```

## Success state

- inbound routing sends the mailbox alias to the Worker
- RemoteLab completion targets can call `POST /api/send-email`
- `curl https://.../healthz` succeeds
- mailbox bridge and reply tests pass when the AI runs them

## Validation examples

```bash
curl https://remotelab-email-worker.example.workers.dev/healthz
curl https://mailhook.example.com/healthz
node tests/test-agent-mail-http-bridge.mjs
node tests/test-agent-mail-reply.mjs
node tests/test-agent-mail-worker.mjs
```

## Notes

- No Forward Email dependency
- No SMTP setup
- `apple_mail` remains as a local fallback outbound provider for manual testing
