import { readFile, writeFile } from 'node:fs/promises';
import { signAccess } from '../src/auth.js';
const config = await readFile('.dev.vars', 'utf8');
const secret = config.match(/^ACCESS_SECRET=(.+)$/m)?.[1].trim();
const base = process.argv[2] || 'http://127.0.0.1:8787';
const token = await signAccess(secret, `qa-${Date.now()}`, Date.now() + 3600000);
for (const [label, body] of [
  ['worked math', { question: 'Find the derivative of x^2 sin(x). Explain the product rule in 3 short steps.' }],
  ['web search', { question: 'Find the official Python documentation for the math.sqrt function. Give its URL and what it returns.', webSearch: true }]
]) {
  const response = await fetch(`${base}/api/answer`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(75000) });
  const data = await response.json();
  console.log(JSON.stringify({ test: label, status: response.status, provider: data.provider, answerLength: data.answer?.length || 0, sources: data.sources?.length || 0, searchUsed: data.searchUsed, error: data.error }));
  await writeFile(`.local/${label.replaceAll(' ', '-')}-result.json`, JSON.stringify(data, null, 2));
}
const visit = await fetch(`${base}/api/visit?src=setup-test`, { method: 'POST' });
console.log('Analytics test:', await visit.text());
const me = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
console.log('Student allowance:', await me.text());
