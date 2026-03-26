import { readFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { CHAT_PORT, INSTANCE_ROOT } from '../lib/config.mjs';
import { loadMailboxRuntimeRegistry } from '../lib/mailbox-runtime-registry.mjs';

import { BASIC_CHAT_APP_ID, WELCOME_APP_ID, getApp } from './apps.mjs';
import { publishLocalFileAssetFromPath } from './file-assets.mjs';
import { appendEvents } from './history.mjs';
import { messageEvent } from './normalizer.mjs';
import {
  applyAppTemplateToSession,
  createSession,
  getSession,
  listSessions,
  setSessionPinned,
  updateSessionGrouping,
  updateSessionLastReviewedAt,
} from './session-manager.mjs';

export const OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID = 'owner_bootstrap:welcome';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_ASSETS_DIR = join(MODULE_DIR, 'bootstrap-assets');
const RAW_SPREADSHEET_ASSET_PATH = join(BOOTSTRAP_ASSETS_DIR, 'sales-march.raw.xlsx');
const CLEANED_SPREADSHEET_ASSET_PATH = join(BOOTSTRAP_ASSETS_DIR, 'sales-march.cleaned.xlsx');
const CLEANUP_NOTES_ASSET_PATH = join(BOOTSTRAP_ASSETS_DIR, 'sales-march.notes.md');
const DIGEST_SHOWCASE_ASSET_PATH = join(BOOTSTRAP_ASSETS_DIR, 'ai-coding-agent-digest.sample.md');

function safeReadJson(filePath, fallbackValue = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallbackValue;
  }
}

function normalizeMailboxName(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
    : '';
}

function buildGuestMailboxAddress(instanceName, ownerIdentity) {
  const normalizedInstanceName = normalizeMailboxName(instanceName);
  const localPart = typeof ownerIdentity?.localPart === 'string' ? ownerIdentity.localPart.trim() : '';
  const domain = typeof ownerIdentity?.domain === 'string' ? ownerIdentity.domain.trim() : '';
  const addressMode = typeof ownerIdentity?.instanceAddressMode === 'string' ? ownerIdentity.instanceAddressMode.trim() : '';
  if (!normalizedInstanceName || !localPart || !domain) return '';
  if (addressMode === 'local_part') {
    return `${normalizedInstanceName}@${domain}`;
  }
  return `${localPart}+${normalizedInstanceName}@${domain}`;
}

function resolveCurrentMailboxAddress() {
  const normalizedPort = Number.parseInt(`${CHAT_PORT || 0}`, 10) || 0;
  const registry = loadMailboxRuntimeRegistry({ homeDir: homedir() });
  const matchedRuntime = registry.find((record) => Number.parseInt(`${record?.port || 0}`, 10) === normalizedPort) || null;
  const runtimeMailboxAddress = typeof matchedRuntime?.mailboxAddress === 'string'
    ? matchedRuntime.mailboxAddress.trim()
    : '';
  if (runtimeMailboxAddress) return runtimeMailboxAddress;

  const ownerIdentity = safeReadJson(join(homedir(), '.config', 'remotelab', 'agent-mailbox', 'identity.json'), null);
  const guestMailboxAddress = buildGuestMailboxAddress(basename(INSTANCE_ROOT || ''), ownerIdentity);
  if (guestMailboxAddress) return guestMailboxAddress;
  const ownerMailboxAddress = typeof ownerIdentity?.address === 'string' ? ownerIdentity.address.trim() : '';
  return ownerMailboxAddress;
}

function buildInboundEmailSetupHint(mailboxAddress) {
  if (mailboxAddress) {
    return [
      '补充一个和邮件相关的提示：如果你想测试“发邮件到这个实例会自动开新会话”这条能力，先把你会用来发送的邮箱告诉我，我会先把它设成允许发件人；不然安全机制会先把邮件拦掉。',
      `这个实例当前的收件地址是 \`${mailboxAddress}\`。`,
    ].join('\n\n');
  }

  return '补充一个和邮件相关的提示：如果你想测试“发邮件到这个实例会自动开新会话”这条能力，先把你会用来发送的邮箱告诉我，我会先把它设成允许发件人；不然安全机制会先把邮件拦掉。';
}

function buildDigestShowcaseIntro() {
  return [
    '这是一个已经实测跑通过的样例。',
    '这个流程不是只展示“能做摘要”或“能发邮件”其中一项，而是把两件事接成一条真实交付链路：先整理最近行业热点，再把结果发到指定邮箱。',
  ].join('\n\n');
}

function getOwnerBootstrapSessionDefinitions() {
  const mailboxAddress = resolveCurrentMailboxAddress();

  return [
    {
      appId: WELCOME_APP_ID,
      externalTriggerId: OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID,
      name: 'Welcome',
      pinned: true,
      sidebarOrder: 1,
      extraMessages: [
        {
          role: 'assistant',
          content: buildInboundEmailSetupHint(mailboxAddress),
        },
      ],
    },
    {
      appId: BASIC_CHAT_APP_ID,
      externalTriggerId: 'owner_bootstrap:showcase:file_cleanup',
      name: '[示例] 上传一份表格，我把清洗后的文件回给你',
      pinned: true,
      sidebarOrder: 2,
      messages: [
        {
          role: 'assistant',
          content: [
            '这是一个已经实测跑通过的样例。',
            '你可以直接点附件看交付长什么样：上面是用户上传的原始表，下面是我回给用户的结果文件。',
          ].join('\n\n'),
        },
        {
          role: 'user',
          content: '我先上传一份样例销售表。你可以把它理解成用户真实会发来的那种“日期混乱、联系人和电话混在一起、还有重复客户”的表。',
          attachments: [
            {
              localPath: RAW_SPREADSHEET_ASSET_PATH,
              originalName: 'sales-march.raw.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              renderAs: 'file',
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            '这条链路我已经实际跑通过了。下面两个附件可以直接下载：一个是清洗后的表，一个是清洗说明。',
            '你把自己的表发来后，我会先按同样方式跑第一版，再决定有没有必要固化成重复流程。',
          ].join('\n\n'),
          attachments: [
            {
              localPath: CLEANED_SPREADSHEET_ASSET_PATH,
              originalName: 'sales-march.cleaned.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              renderAs: 'file',
            },
            {
              localPath: CLEANUP_NOTES_ASSET_PATH,
              originalName: '清洗说明.md',
              mimeType: 'text/markdown',
              renderAs: 'file',
            },
          ],
        },
      ],
    },
    {
      appId: BASIC_CHAT_APP_ID,
      externalTriggerId: 'owner_bootstrap:showcase:digest_email_delivery',
      name: '[示例] 汇总最近行业热点，并把摘要发到指定邮箱',
      pinned: true,
      sidebarOrder: 3,
      messages: [
        {
          role: 'assistant',
          content: buildDigestShowcaseIntro(),
        },
        {
          role: 'user',
          content: '我想跟踪 AI 编程助手 / remote agent 这类行业热点。先给我一版今天的摘要，并发到我的收件邮箱；如果格式合适，再改成每天早上 8 点。',
        },
        {
          role: 'assistant',
          content: [
            '这条链路我已经实际跑通过了。我先把今天这份摘要发到指定邮箱，同时把同一份正文放成附件供你直接看。',
            '如果你确认格式和收件都没问题，我再把它固化成每天自动发。',
          ].join('\n\n'),
          attachments: [
            {
              localPath: DIGEST_SHOWCASE_ASSET_PATH,
              originalName: 'AI 编程助手热点摘要（样例）.md',
              mimeType: 'text/markdown',
              renderAs: 'file',
            },
          ],
        },
      ],
    },
  ];
}

const LEGACY_WELCOME_SHOWCASE_HINT = [
  '另外，左侧已经给你放了 2 个真实跑通过的示例会话。',
  '你可以按兴趣点开看看，主要是参考：用户通常怎么开头、我会怎么交付，以及结果会长什么样。',
  '觉得哪个最像你的情况，就直接照着那个方式把你的版本发给我。',
].join('\n\n');

async function publishMessageAttachments(sessionId, attachments = []) {
  const publishedAttachments = [];
  for (const attachment of attachments) {
    if (!(attachment && typeof attachment === 'object')) continue;
    const published = await publishLocalFileAssetFromPath({
      sessionId,
      localPath: attachment.localPath,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      createdBy: 'assistant',
    });
    publishedAttachments.push({
      assetId: published.id,
      originalName: attachment.originalName || published.originalName,
      mimeType: attachment.mimeType || published.mimeType,
      ...(Number.isInteger(published?.sizeBytes) && published.sizeBytes > 0 ? { sizeBytes: published.sizeBytes } : {}),
      ...(attachment.renderAs ? { renderAs: attachment.renderAs } : {}),
    });
  }
  return publishedAttachments;
}

async function buildMessageEvents(sessionId, messages = []) {
  const events = [];
  for (const message of messages) {
    if (!(message && typeof message.content === 'string' && message.content.trim())) continue;
    const attachments = Array.isArray(message.attachments) && message.attachments.length > 0
      ? await publishMessageAttachments(sessionId, message.attachments)
      : [];
    events.push(messageEvent(
      message.role === 'user' ? 'user' : 'assistant',
      message.content,
      attachments,
    ));
  }
  return events;
}

async function createOwnerBootstrapSession(definition, { appendLegacyWelcomeHint = false } = {}) {
  const app = await getApp(definition.appId);
  if (!app?.id) return null;

  let session = await createSession('~', app.tool || 'codex', definition.name || app.name || 'Session', {
    appId: app.id,
    appName: app.name || '',
    sourceId: 'chat',
    sourceName: 'Chat',
    externalTriggerId: definition.externalTriggerId,
  });
  session = await applyAppTemplateToSession(session.id, app.id) || session;
  session = await getSession(session.id) || session;

  if (Number(session?.messageCount || 0) === 0) {
    const starterMessages = Array.isArray(definition.messages) && definition.messages.length > 0
      ? definition.messages
      : (app.welcomeMessage ? [{ role: 'assistant', content: app.welcomeMessage }] : []);
    const extraMessages = Array.isArray(definition.extraMessages) ? definition.extraMessages : [];
    const starterEvents = await buildMessageEvents(session.id, [...starterMessages, ...extraMessages]);
    if (starterEvents.length > 0) {
      await appendEvents(session.id, starterEvents);
      session = await getSession(session.id) || session;
    }
  } else if (appendLegacyWelcomeHint && definition.externalTriggerId === OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID) {
    const appendedEvents = await buildMessageEvents(session.id, [
      { role: 'assistant', content: LEGACY_WELCOME_SHOWCASE_HINT },
      ...(Array.isArray(definition.extraMessages) ? definition.extraMessages : []),
    ]);
    if (appendedEvents.length > 0) {
      await appendEvents(session.id, appendedEvents);
      session = await getSession(session.id) || session;
    }
  }

  if (Number.isInteger(definition.sidebarOrder) && definition.sidebarOrder > 0) {
    session = await updateSessionGrouping(session.id, { sidebarOrder: definition.sidebarOrder }) || session;
  }
  if (definition.pinned === true) {
    session = await setSessionPinned(session.id, true) || session;
  }
  if (session?.updatedAt) {
    session = await updateSessionLastReviewedAt(session.id, session.updatedAt) || session;
  }

  return session;
}

export async function ensureOwnerBootstrapSessions() {
  const ownerBootstrapSessions = getOwnerBootstrapSessionDefinitions();
  const ownerSessions = (await listSessions({
    includeVisitor: true,
    includeArchived: true,
  })).filter((session) => !session?.visitorId);

  const activeOwnerSessions = ownerSessions.filter((session) => session?.archived !== true);
  const hasLegacyBlankWelcomeOnly = activeOwnerSessions.length === 1
    && activeOwnerSessions[0]?.externalTriggerId === OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID
    && Number(activeOwnerSessions[0]?.messageCount || 0) <= 1;

  if (activeOwnerSessions.length > 0 && !hasLegacyBlankWelcomeOnly) {
    return activeOwnerSessions[0];
  }

  let welcomeSession = null;
  for (const definition of ownerBootstrapSessions) {
    const session = await createOwnerBootstrapSession(definition, {
      appendLegacyWelcomeHint: hasLegacyBlankWelcomeOnly,
    });
    if (definition.externalTriggerId === OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID) {
      welcomeSession = session;
    }
  }

  return welcomeSession || activeOwnerSessions[0] || null;
}
