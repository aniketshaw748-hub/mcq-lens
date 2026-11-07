import { test } from 'node:test';
import assert from 'node:assert/strict';

test('background restricts capture to the active focused tab, protects the key, and throttles requests', async () => {
  let listener, focused = true, currentTab = 17, captures = 0, fetches = 0, key = 'test-secret';
  const originalFetch = globalThis.fetch;
  globalThis.chrome = {
    storage: { local: { setAccessLevel: () => {}, get: async () => ({ apiKey: key }) } },
    tabs: { query: async () => [{ id: currentTab }], captureVisibleTab: async () => { captures++; return 'data:image/png;base64,test'; }, onRemoved: { addListener: () => {} } },
    windows: { get: async () => ({ focused }) },
    runtime: { onMessage: { addListener: fn => { listener = fn; } } }
  };
  globalThis.fetch = async () => { fetches++; return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"questions":[]}' }] } }] }) }; };
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
    key = '';
    assert.match((await send({ type: 'SOLVE', image: 'fake' })).error, /access link/);
    key = 'test-secret';
    assert.deepEqual(await send({ type: 'SOLVE', image: 'fake' }), { questions: [] });
    assert.equal(fetches, 1);
    assert.ok((await send({ type: 'SOLVE', image: 'fake' })).retryMs > 0);
    assert.equal(fetches, 1);
    assert.deepEqual(await send({ type: 'CANCEL' }), { ok: true });
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});
