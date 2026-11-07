import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { signAccess } from '../src/auth.js';
import assert from 'node:assert/strict';

await build({ entryPoints: ['tests/runtime-entry.js'], bundle: true, format: 'esm', platform: 'browser', external: ['cloudflare:workers'], outfile: '.local/cancel-runtime-test.mjs' });
let readers = 0;
let beganFirst;
const firstStarted = new Promise(resolve => { beganFirst = resolve; });
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, scriptPath: '.local/cancel-runtime-test.mjs', compatibilityDate: '2026-11-07', durableObjects: { QUOTA: { className: 'Quota', useSQLite: true } }, bindings: { ACCESS_SECRET: 'test-owner', GEMINI_API_KEY: 'fake-reader', GROQ_API_KEY: 'fake-reasoner' }, outboundService: async request => {
  if (request.url.includes('googleapis')) {
    readers++;
    if (readers === 1) { beganFirst(); await new Promise(resolve => setTimeout(resolve, 5000)); }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ questions: [{ question: 'What is 2 + 2?', selectionMode: 'single', options: [{ text: 'A. 3', box: [100, 100, 150, 300] }, { text: 'B. 4', box: [200, 100, 250, 300] }] }] }) }] } }], usageMetadata: { promptTokenCount: 100 } });
  }
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ decisions: [{ questionIndex: 0, selectedOptionIndices: [1], explanation: '2 + 2 = 4.', confidence: 'high' }] }) } }], usage: { total_tokens: 100 } });
} }));
try {
  const token = await signAccess('test-owner', 'student-next', Date.now() + 60000);
  const ask = image => mf.dispatchFetch('http://localhost/api/answer', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ question: 'Solve visible MCQ.', image, mode: 'mcq' }) });
  const first = ask('AAAA');
  await firstStarted;
  const second = await ask('BBBB');
  assert.equal(second.status, 200);
  const result = await second.json();
  assert.equal(result.questions[0].answers.length, 1);
  assert.equal(result.questions[0].answers[0].text, 'B. 4');
  assert.equal((await first).status, 409);
  const usage = await mf.dispatchFetch('http://localhost/api/me', { headers: { Authorization: `Bearer ${token}` } }).then(response => response.json());
  assert.equal(usage.used, 1);
  console.log('PASS actual Worker + Durable Objects: a second MCQ cancels obsolete in-flight work, answers without the busy error, rejects the stale result, and charges only one successful question.');
} finally { await mf.dispose(); }
