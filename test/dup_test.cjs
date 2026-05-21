const assert = require('assert');

// Copied/simplified dedupe state from bot.js
const processingMessageIds = new Set();
const recentMessageIds = new Map();
const recentCommandInvocations = new Map();
const recentSentMessages = new Map();
const DUPLICATE_SEND_WINDOW_MS = 5000;

// Mock send function that records calls
const sent = [];
async function send(channelId, content) {
  const now = Date.now();
  const key = `${channelId}:${content}`;
  const lastSent = recentSentMessages.get(key);
  if (lastSent && now - lastSent < DUPLICATE_SEND_WINDOW_MS) {
    console.log('[Test Send] Suppressed duplicate send');
    return;
  }
  recentSentMessages.set(key, now);
  sent.push({ channelId, content, time: now });
}

async function handleMessage(msg, selfId) {
  const now = Date.now();
  if (recentMessageIds.has(msg.id)) {
    const lastProcessedTime = recentMessageIds.get(msg.id);
    if (now - lastProcessedTime < 60000) return;
  }
  if (processingMessageIds.has(msg.id)) return;
  processingMessageIds.add(msg.id);

  try {
    const content = (msg.content ?? '').trim();
    if (msg.author.bot && msg.author.id !== selfId) return;
    if (msg.author.id === selfId) {
      const prefix = content.startsWith('s!') ? 's!' : content.startsWith('!') ? '!' : null;
      if (prefix) {
        const commandKey = `${msg.author.id}:${msg.channel_id}:${content}`;
        const lastInvocation = recentCommandInvocations.get(commandKey);
        if (lastInvocation && now - lastInvocation < 5000) return;
        recentCommandInvocations.set(commandKey, now);
        const withoutPrefix = content.slice(prefix.length).trim();
        if (!withoutPrefix) return;
        const [cmdName] = withoutPrefix.split(/\s+/);
        await send(msg.channel_id, `SELF:${cmdName}`);
      }
      return;
    }

    const prefix = content.startsWith('s!') ? 's!' : content.startsWith('!') ? '!' : null;
    if (prefix) {
      const commandKey = `${msg.author.id}:${msg.channel_id}:${content}`;
      const lastInvocation = recentCommandInvocations.get(commandKey);
      if (lastInvocation && now - lastInvocation < 5000) return;
      recentCommandInvocations.set(commandKey, now);
      const withoutPrefix = content.slice(prefix.length).trim();
      if (!withoutPrefix) return;
      const [cmdName] = withoutPrefix.split(/\s+/);
      await send(msg.channel_id, `EXEC:${cmdName}`);
      return;
    }

    // auto reply
    await send(msg.channel_id, 'AUTOREPLY');
  } finally {
    processingMessageIds.delete(msg.id);
    recentMessageIds.set(msg.id, now);
  }
}

(async () => {
  // Simulate a user sending a command
  const msg = { id: 'abc123', channel_id: 'chan1', content: 's!ping', author: { id: 'user1', username: 'u', bot: false } };
  await handleMessage(msg, 'botid');
  // Simulate duplicate delivery shortly after
  await handleMessage(msg, 'botid');

  // Check that only one send happened (EXEC:ping)
  assert.strictEqual(sent.length, 1, `Expected 1 send, got ${sent.length}`);
  assert.strictEqual(sent[0].content, 'EXEC:ping');
  console.log('PASS: Duplicate MESSAGE_CREATE suppressed (user command)');

  // Reset sent
  sent.length = 0;

  // Simulate bot sending self command delivered twice
  const selfMsg = { id: 'self1', channel_id: 'chan1', content: 's!status me', author: { id: 'botid', username: 'bot', bot: true } };
  await handleMessage(selfMsg, 'botid');
  await handleMessage(selfMsg, 'botid');
  assert.strictEqual(sent.length, 1, `Expected 1 send for self command, got ${sent.length}`);
  console.log('PASS: Duplicate MESSAGE_CREATE suppressed (self command)');

  // Test duplicate send suppression: two different messages with same content to same channel
  sent.length = 0;
  const msg2 = { id: 'm1', channel_id: 'chan1', content: 'hello', author: { id: 'user2', bot: false } };
  await handleMessage(msg2, 'botid'); // sends AUTOREPLY
  await handleMessage({ ...msg2, id: 'm2' }, 'botid'); // triggers another autoreply with same content
  // Because send dedupe window is 5s, second autoreply suppressed
  assert.strictEqual(sent.length, 1, `Expected 1 send for duplicate autoreply, got ${sent.length}`);
  console.log('PASS: Outgoing duplicate send suppressed');

  console.log('All tests passed');
})();
