import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/calculator.js';
import { signAccess, verifyAccess } from '../src/auth.js';
import { routes, solveWith } from '../src/providers.js';

test('student tokens reject tampering, expiry, and wrong owners', async () => {
  const token = await signAccess('secret-a', 'student-001', Date.now() + 60000);
  assert.equal(await verifyAccess('secret-a', token), 'student-001');
  assert.equal(await verifyAccess('secret-b', token), null);
  assert.equal(await verifyAccess('secret-a', `${token}x`), null);
  assert.equal(await verifyAccess('secret-a', await signAccess('secret-a', 'student-001', Date.now() - 1)), null);
});
test('calculator evaluates math without allowing code execution', () => {
  assert.equal(calculate('2 + 3 * 4'), 14);
  assert.equal(calculate('2^3^2'), 512);
  assert.equal(calculate('-2^2'), -4);
  assert.equal(calculate('sqrt(81) + abs(-4)'), 13);
  assert.ok(Math.abs(calculate('sin(pi / 2)') - 1) < 1e-10);
  for (const expression of ['process.exit()', '1/0', 'sqrt(-1)', 'constructor(1)', 'a=3', '('.repeat(40) + '1' + ')'.repeat(40)]) assert.throws(() => calculate(expression));
});
test('routing never sends screenshots to text-only Groq, or search to non-search providers', () => {
  const env = { ZAI_API_KEY: 'a', GROQ_API_KEY: 'b', GEMINI_API_KEY: 'c' };
  assert.equal(routes(env, {}).length, 4);
  assert.deepEqual(routes(env, { image: 'image' }).map(x => x.name), ['zai', 'gemini']);
  assert.deepEqual(routes(env, { webSearch: true }).map(x => x.name), ['gemini']);
});
test('model uses calculator results and each upstream turn gets a quota reservation', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = []; let reserves = 0, releases = 0;
  const env = { MAX_OUTPUT_TOKENS: '1000', QUOTA: { getByName: () => ({ reserve: async () => { reserves++; return { id: String(reserves) }; }, release: async () => { releases++; } }) } };
  globalThis.fetch = async (url, request) => {
    bodies.push(JSON.parse(request.body));
    return Response.json(bodies.length === 1 ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'calculate', arguments: '{"expression":"12*12"}' } }] }, finish_reason: 'tool_calls' }] } : { choices: [{ message: { content: 'The answer is 144.' }, finish_reason: 'stop' }], usage: { total_tokens: 500 } });
  };
  try {
    const result = await solveWith(env, { name: 'groq120', model: 'openai/gpt-oss-120b', key: 'secret', url: 'https://example.com' }, { question: '12 squared?', mode: 'study' }, undefined);
    assert.equal(result.answer, 'The answer is 144.'); assert.equal(result.calculations[0].result, '144');
    assert.equal(reserves, 2); assert.equal(releases, 2);
    assert.equal(bodies[1].messages.at(-1).content, '144');
    assert.equal(bodies[0].messages.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
