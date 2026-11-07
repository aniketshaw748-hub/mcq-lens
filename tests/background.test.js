import { test } from 'node:test';
import assert from 'node:assert/strict';

test('background restricts capture to the active focused tab, needs no setup, and throttles requests', async () => {
  let listener, focused = true, currentTab = 17, captures = 0, fetches = 0, stored = {};
  const originalFetch = globalThis.fetch;
  globalThis.self = { addEventListener: () => {} };
  globalThis.chrome = {
    storage: { local: { setAccessLevel: () => {}, get: async () => ({ ...stored }), set: async values => { Object.assign(stored, values); } } },
    tabs: { query: async () => [{ id: currentTab }], captureVisibleTab: async () => { captures++; return 'data:image/png;base64,test'; }, onRemoved: { addListener: () => {} } },
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
    assert.deepEqual(await send({ type: 'CAPTURE' }), { paused: true });
    assert.equal(captures, 1);
    focused = true; currentTab = 18;
    assert.deepEqual(await send({ type: 'CAPTURE' }), { paused: true });
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
    storage: { local: { setAccessLevel: () => {}, get: async () => ({ ...stored }), set: async values => { Object.assign(stored, values); } } },
    tabs: { query: async () => [{ id: 1 }], onRemoved: { addListener: () => {} } },
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
