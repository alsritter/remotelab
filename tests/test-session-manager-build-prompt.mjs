#!/usr/bin/env node
import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'remotelab-build-prompt-'));
process.env.HOME = tempHome;

const { buildPrompt } = await import('../chat/session-manager.mjs');

const baseSession = {
  systemPrompt: '',
  visitorId: '',
  claudeSessionId: null,
  codexThreadId: null,
};

const freshPrompt = await buildPrompt(
  'session-test-1',
  baseSession,
  '聊一下产品方向。',
  'codex',
  'codex',
  null,
  { skipSessionContinuation: true },
);

assert.match(freshPrompt, /Manager turn policy reminder/);
assert.match(freshPrompt, /User message:/);
assert.match(freshPrompt, /do not mirror its headings, bullets, or checklist structure back to the user/);

const resumedPrompt = await buildPrompt(
  'session-test-1',
  {
    ...baseSession,
    codexThreadId: 'thread-test-1',
  },
  '继续。',
  'codex',
  'codex',
  null,
  {},
);

assert.match(resumedPrompt, /Manager turn policy reminder/);
assert.match(resumedPrompt, /Current user message:/);
assert.doesNotMatch(resumedPrompt, /Memory System — Pointer-First Activation/);

console.log('test-session-manager-build-prompt: ok');
