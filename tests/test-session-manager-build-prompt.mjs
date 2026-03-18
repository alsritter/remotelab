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
  activeAgreements: [
    '默认用自然连贯的段落表达，不要自己起标题和列表。',
    'Agent 更像执行器，Manager 负责统一任务语义和边界。',
  ],
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

assert.match(freshPrompt, /Manager note: RemoteLab remains the manager for this turn/);
assert.match(freshPrompt, /User message:/);
assert.match(freshPrompt, /do not mirror its headings, bullets, or checklist structure back to the user/);
assert.match(freshPrompt, /active working agreements/);
assert.match(freshPrompt, /默认用自然连贯的段落表达，不要自己起标题和列表/);

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

assert.match(resumedPrompt, /Manager note: RemoteLab remains the manager for this turn/);
assert.match(resumedPrompt, /Current user message:/);
assert.doesNotMatch(resumedPrompt, /Memory System — Pointer-First Activation/);
assert.match(resumedPrompt, /Agent 更像执行器，Manager 负责统一任务语义和边界/);

console.log('test-session-manager-build-prompt: ok');
