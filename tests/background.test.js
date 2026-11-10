import { test } from 'node:test';
import assert from 'node:assert/strict';

test('background captures only the tab on screen (focus not needed), needs no setup, and throttles requests', async () => {
  let listener, focused = true, currentTab = 17, captures = 0, fetches = 0, stored = {};
  const originalFetch = globalThis.fetch;
  globalThis.self = { addEventListener: () => {} };
  globalThis.chrome = {
    storage: { onChanged: { addListener: () => {} }, local: { setAccessLevel: () => {}, get: async () => ({ ...stored }), set: async values => { Object.assign(stored, values); } } },
    tabs: { query: async () => [{ id: currentTab }], captureVisibleTab: async () => { captures++; return 'data:image/png;base64,test'; }, onRemoved: { addListener: () => {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    commands: { onCommand: { addListener: () => {} } },
    windows: { get: async () => ({ focused }) },
    runtime: { onMessage: { addListener: fn => { listener = fn; } } }
  };
  globalThis.fetch = async (url, request) => { fetches++; assert.equal(request.headers['X-Client-Id'], stored.clientId); return { ok: true, json: async () => ({ questions: [] }) }; };
  try {
    await import('../background.js');
    const send = (message, sender = { tab: { id: 17, windowId: 1 }, frameId: 0 }) => new Promise(resolve => listener(message, sender, resolve));
    assert.deepEqual(await send({ type: 'CAPTURE' }), { image: 'data:image/png;base64,test' });
    assert.equal(captures, 1);
    focused = false;
    assert.deepEqual(await send({ type: 'CAPTURE' }), { image: 'data:image/png;base64,test' });
    assert.equal(captures, 2);
    currentTab = 18;
    assert.deepEqual(await send({ type: 'CAPTURE' }), { paused: true });
    assert.equal(captures, 2);
    currentTab = 17;
    assert.match((await send({ type: 'CAPTURE' }, { tab: { id: 17, windowId: 1 }, frameId: 2 })).error, /enabled tab/);
    // No link or key needed: the first solve creates an install ID.
    assert.deepEqual(await send({ type: 'SOLVE', image: 'fake' }), { questions: [] });
    assert.equal(fetches, 1);
    assert.match(stored.clientId, /^[0-9a-f-]{36}$/);
    assert.ok((await send({ type: 'SOLVE', image: 'fake' })).retryMs > 0);
    assert.equal(fetches, 1);
    assert.deepEqual(await send({ type: 'CANCEL' }), { ok: true });
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; delete globalThis.self; }
});

test('bug reports: automatic ones respect the switch and are not repeated; user reports always go', async () => {
  let listener, stored = { clientId: 'install-1' };
  const sent = [], originalFetch = globalThis.fetch;
  globalThis.self = { addEventListener: () => {} };
  globalThis.chrome = {
    storage: { onChanged: { addListener: () => {} }, local: { setAccessLevel: () => {}, get: async () => ({ ...stored }), set: async values => { Object.assign(stored, values); } } },
    tabs: { query: async () => [{ id: 1 }], onRemoved: { addListener: () => {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    commands: { onCommand: { addListener: () => {} } },
    windows: { get: async () => ({ focused: true }) },
    runtime: { getManifest: () => ({ version: '9.9.9' }), onMessage: { addListener: fn => { listener = fn; } } }
  };
  globalThis.fetch = async (url, request) => { sent.push({ url, headers: request.headers, body: JSON.parse(request.body) }); return { ok: true, json: async () => ({ received: true, id: sent.length }) }; };
  try {
    await import('../background.js?reports');
    const send = message => new Promise(resolve => listener(message, { tab: { id: 1, windowId: 1 }, frameId: 0 }, resolve));
    const auto = { kind: 'auto', stage: 'reading', reason: 'provider_unavailable', message: 'Screenshot reading failed after 1200 ms', events: [{ t: 1, type: 'ask', detail: 'screenshot' }] };
    assert.deepEqual(await send({ type: 'REPORT', report: auto }), { received: true, id: 1 });
    assert.match(sent[0].url, /\/api\/report$/); assert.equal(sent[0].headers['X-Client-Id'], 'install-1');
    assert.equal(sent[0].body.version, '9.9.9'); assert.equal(sent[0].body.ownKeys, false);
    assert.deepEqual(await send({ type: 'REPORT', report: { ...auto, message: 'Screenshot reading failed after 900 ms' } }), { skipped: true });
    stored.autoReports = false;
    assert.deepEqual(await send({ type: 'REPORT', report: { ...auto, stage: 'solving' } }), { skipped: true });
    assert.equal((await send({ type: 'REPORT', report: { kind: 'user', note: 'Wrong option highlighted', events: [] } })).id, 2);
    assert.equal(sent.length, 2);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; delete globalThis.self; }
});

test('toolbar badge shows reading, answered, error and off for the tab, and the shortcut asks the tab to toggle its reasoning', async () => {
  let listener, command, reply = { ok: true, status: 200, body: { questions: [{ answers: [{ text: 'B' }] }] } };
  const badges = [], tabMessages = [], originalFetch = globalThis.fetch;
  globalThis.self = { addEventListener: () => {} };
  globalThis.chrome = {
    storage: { onChanged: { addListener: () => {} }, local: { setAccessLevel: () => {}, get: async () => ({ clientId: 'install-badge' }), set: async () => {} } },
    tabs: { query: async () => [{ id: 5 }], sendMessage: async (id, message) => { tabMessages.push([id, message.type]); }, onRemoved: { addListener: () => {} } },
    action: { setBadgeText: async ({ tabId, text }) => { badges.push([tabId, text]); }, setBadgeBackgroundColor: async () => {} },
    commands: { onCommand: { addListener: fn => { command = fn; } } },
    windows: { get: async () => ({ focused: true }) },
    runtime: { getManifest: () => ({ version: '9.9.9' }), onMessage: { addListener: fn => { listener = fn; } } }
  };
  globalThis.fetch = async () => ({ ok: reply.ok, status: reply.status, json: async () => reply.body });
  try {
    await import('../background.js?badge');
    const send = message => new Promise(resolve => listener(message, { tab: { id: 5, windowId: 1 }, frameId: 0 }, resolve));
    await send({ type: 'SOLVE', image: 'abc' });
    assert.deepEqual(badges.slice(-2), [[5, '…'], [5, '✓']]);
    await new Promise(resolve => setTimeout(resolve, 6100)); // the per-tab throttle
    reply = { ok: false, status: 429, body: { error: 'Daily limit reached.', reason: 'daily', retryMs: 60000 } };
    await send({ type: 'SOLVE', image: 'abc' });
    assert.deepEqual(badges.at(-1), [5, '!']);
    await send({ type: 'CANCEL' });
    assert.deepEqual(badges.at(-1), [5, '']);
    await command('toggle-reasoning', { id: 5 });
    assert.deepEqual(tabMessages, [[5, 'PANEL']]);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; delete globalThis.self; }
});
