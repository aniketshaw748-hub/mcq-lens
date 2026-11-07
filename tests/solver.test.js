import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, SERVICE_URL } from '../solver.js';

const ok = questions => ({ ok: true, json: async () => ({ questions }) });
test('works with no setup: calls the MCQ Lens service with only an install ID', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, request) => {
      assert.equal(url, `${SERVICE_URL}/api/answer`);
      assert.deepEqual(Object.keys(request.headers).sort(), ['Content-Type', 'X-Client-Id']);
      assert.equal(request.headers['X-Client-Id'], 'install-1');
      assert.equal(JSON.parse(request.body).image, 'image');
      return ok([]);
    };
    assert.deepEqual(await solve({ clientId: 'install-1' }, 'image'), []);
  } finally { globalThis.fetch = original; }
});
test('own keys travel only in headers; a pre-1.2 Gemini key still works; page text skips the image', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, request) => {
      assert.ok(!url.includes('secret') && !request.body.includes('secret'));
      assert.equal(request.headers['X-Groq-Key'], 'groq-secret');
      assert.equal(request.headers['X-Gemini-Key'], 'old-gemini-secret');
      assert.equal(request.headers['X-Zai-Key'], undefined);
      const body = JSON.parse(request.body);
      assert.equal(body.image, undefined); assert.equal(body.extractedQuestions.length, 1);
      return ok([{ answers: [] }]);
    };
    assert.equal((await solve({ clientId: 'i', groqKey: 'groq-secret', apiKey: 'old-gemini-secret' }, 'image', undefined, [{ question: 'q' }])).length, 1);
  } finally { globalThis.fetch = original; }
});
test('service errors keep their message and retry time', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: 'Scan limit reached.', retryMs: 9000 }) });
    await assert.rejects(solve({ clientId: 'i' }, 'image'), error => error.status === 429 && error.retryMs === 9000 && error.message === 'Scan limit reached.');
  } finally { globalThis.fetch = original; }
});
