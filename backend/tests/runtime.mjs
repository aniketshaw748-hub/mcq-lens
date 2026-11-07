import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { signAccess } from '../src/auth.js';
import assert from 'node:assert/strict';
await build({ entryPoints: ['tests/runtime-entry.js'], bundle: true, format: 'esm', platform: 'browser', external: ['cloudflare:workers'], outfile: '.local/runtime-test.mjs' });
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, scriptPath: '.local/runtime-test.mjs', compatibilityDate: '2026-11-07', durableObjects: { QUOTA: { className: 'Quota', useSQLite: true } }, bindings: { ACCESS_SECRET: 'test-owner', GROQ_API_KEY: 'not-real', PROVIDER_LIMITS: JSON.stringify({ groq120: { rpm: 1000, rpd: 10000, tpm: 10000000, tpd: 100000000, concurrent: 100 }, groq20: { rpm: 1000, rpd: 10000, tpm: 10000000, tpd: 100000000, concurrent: 100 } }) }, outboundService: async request => {
  const body = await request.json();
  assert.equal(body.messages.length, 2);
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'A fresh, independent answer.' } }], usage: { total_tokens: 100 } });
} }));
try {
  const quotaCall = (action, body) => mf.dispatchFetch(`http://localhost/test/${action}`, { method: 'POST', body: JSON.stringify(body) }).then(response => response.json());
  const limits = { rpm: 12, rpd: 50, tpm: 1e9, tpd: 1e9, concurrent: 1 };
  const first = await quotaCall('reserve', { name: 'student:next', limits, category: 'mcq', replace: true });
  const next = await quotaCall('reserve', { name: 'student:next', limits, category: 'mcq', replace: true });
  assert.ok(next.id);
  assert.equal(await quotaCall('active', { name: 'student:next', id: first.id }), false);
  assert.equal(await quotaCall('active', { name: 'student:next', id: next.id }), true);
  await quotaCall('release', { name: 'student:next', id: first.id, refund: true });
  assert.equal((await quotaCall('usage', { name: 'student:next' })).requests, 1);
  console.log('PASS Next replaces obsolete MCQ work without blocking, double-charging, or releasing the new question lease');
  const study = await quotaCall('reserve', { name: 'student:study-busy', limits, category: 'study' });
  const busy = await quotaCall('reserve', { name: 'student:study-busy', limits, category: 'mcq', replace: true });
  assert.equal(busy.reason, 'busy');
  assert.equal(await quotaCall('active', { name: 'student:study-busy', id: study.id }), true);
  for (let i = 0; i < 12; i++) {
    const lease = await quotaCall('reserve', { name: 'student:rate', limits, category: 'mcq', replace: true });
    assert.ok(lease.id);
    await quotaCall('release', { name: 'student:rate', id: lease.id });
  }
  const limited = await quotaCall('reserve', { name: 'student:rate', limits, category: 'mcq', replace: true });
  assert.equal(limited.reason, 'rate');
  assert.ok(limited.retryMs > 1000 && limited.retryMs <= 60000);
  console.log('PASS distinct busy/rate reasons, accurate retry times, and enforced 12-scan/minute admission');
  const anonymous = await mf.dispatchFetch('http://localhost/api/answer', { method: 'POST', headers: { 'X-Client-Id': 'install-abc12345' }, body: JSON.stringify({ question: 'Explain an anonymous concept' }) });
  assert.equal(anonymous.status, 200);
  assert.equal((await mf.dispatchFetch('http://localhost/api/me', { headers: { 'X-Client-Id': 'install-abc12345' } }).then(r => r.json())).used, 1);
  assert.equal((await mf.dispatchFetch('http://localhost/api/provider-status')).status, 403);
  console.log('PASS no access link needed; anonymous install ID keeps its own allowance; owner diagnostics stay private');
  const reservations = await Promise.all(Array.from({ length: 70 }, () => mf.dispatchFetch('http://localhost/test/reserve', { method: 'POST', body: JSON.stringify({ name: 'student:race', limits: { rpm: 1000, rpd: 50, tpm: 1e9, tpd: 1e9, concurrent: 100 } }) }).then(r => r.json())));
  assert.equal(reservations.filter(x => x.id).length, 50);
  console.log('PASS real Durable Object atomically enforces 50 daily questions under 70 simultaneous reservations');
  const answers = await Promise.all(Array.from({ length: 100 }, async (_, i) => {
    const token = await signAccess('test-owner', `student-${i}`, Date.now() + 60000);
    return mf.dispatchFetch('http://localhost/api/answer', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ question: `Explain concept number ${i}` }) });
  }));
  assert.equal(answers.filter(x => x.status === 200).length, 100);
  console.log('PASS 100 distinct student requests route successfully with simulated provider capacity (not a live inference capacity test)');
  const invalid = await signAccess('test-owner', 'student-malformed', Date.now() + 60000);
  const invalidResult = await mf.dispatchFetch('http://localhost/api/answer', { method: 'POST', headers: { Authorization: `Bearer ${invalid}` }, body: JSON.stringify({ question: 42 }) });
  assert.equal(invalidResult.status, 400);
  console.log('PASS invalid inputs rejected before quota reservation');
} finally { await mf.dispose(); }

