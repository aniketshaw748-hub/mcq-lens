import { chromium } from '../../node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { signAccess } from '../src/auth.js';
import assert from 'node:assert/strict';
const secret = (await readFile('.dev.vars', 'utf8')).match(/^ACCESS_SECRET=(.+)$/m)?.[1].trim();
const token = await signAccess(secret, `mcq-qa-${Date.now()}`, Date.now() + 3600000);
const base = process.argv[2] || 'http://127.0.0.1:8787';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.setContent('<html><head><style>body{font:24px Arial;padding:60px;background:white}label{display:block;padding:20px;margin:12px 0;background:#eee;max-width:700px}</style></head><body><h1>What is 2 + 2?</h1><label>A. 3</label><label id="correct">B. 4</label><label>C. 5</label><label>D. 6</label></body></html>');
  await page.evaluate(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); window.testRoot = root; return root; };
    window.listeners = [];
    window.chrome = { runtime: { onMessage: { addListener: fn => window.listeners.push(fn) }, sendMessage: message => window.transport(message) } };
  });
  let result;
  await page.exposeFunction('transport', async message => {
    if (message.type === 'CAPTURE') return { image: `data:image/png;base64,${(await page.screenshot()).toString('base64')}` };
    if (message.type === 'SOLVE') {
      const response = await fetch(`${base}/api/answer`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Solve the visible MCQ.', image: message.image, mode: 'mcq' }), signal: AbortSignal.timeout(40000) });
      result = await response.json();
      return response.ok ? result : { error: result.error, retryMs: result.retryMs };
    }
    return { ok: true };
  });
  await page.addScriptTag({ content: await readFile('../content.js', 'utf8') });
  await page.evaluate(() => new Promise(resolve => window.listeners[0]({ type: 'TOGGLE', enabled: true, interval: 60 }, {}, resolve)));
  await page.waitForFunction(() => window.testRoot.querySelector('.box'), null, { timeout: 50000 });
  assert.ok(result.questions.some(q => q.answers.some(a => /\b4\b/.test(a.text))));
  const overlap = await page.evaluate(() => {
    const a = window.testRoot.querySelector('.box').getBoundingClientRect(), b = document.querySelector('#correct').getBoundingClientRect();
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / b.height;
  });
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/live-mcq.png' });
  await writeFile('.local/live-mcq-result.json', JSON.stringify(result, null, 2));
  assert.ok(overlap > 0.5, `Answer overlay misses the correct row (${overlap}).`);
  console.log(JSON.stringify({ test: 'real screenshot → live provider → extension highlight', provider: result.provider, correctAnswer: true, correctRowOverlap: overlap }));
} finally { await browser.close(); }
