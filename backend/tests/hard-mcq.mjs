import { chromium } from '../../node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { signAccess } from '../src/auth.js';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const secret = (await readFile('.dev.vars', 'utf8')).match(/^ACCESS_SECRET=(.+)$/m)?.[1].trim();
const token = await signAccess(secret, `hard-mcq-qa-${Date.now()}`, Date.now() + 3600000);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 }, bypassCSP: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://mcq-lens.pages.dev/test.html?src=hard-mcq-qa');
  await page.locator('#options label').first().waitFor();
  const q7 = process.argv.includes('--q7');
  if (q7) for (let i = 0; i < 6; i++) await page.locator('#next').click();
  await page.evaluate(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); window.testRoot = root; return root; };
    window.listeners = [];
    window.chrome = { runtime: { onMessage: { addListener: fn => window.listeners.push(fn) }, sendMessage: message => window.transport(message) } };
  });
  await page.exposeFunction('transport', async message => {
    if (message.type === 'CAPTURE') return { image: `data:image/png;base64,${(await page.screenshot()).toString('base64')}` };
    if (message.type === 'SOLVE') {
      const started = Date.now();
      const response = await fetch(`${base}/api/answer`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Solve the visible multiple-choice questions.', image: message.image, extractedQuestions: message.extractedQuestions, mode: 'mcq' }), signal: AbortSignal.timeout(40000) });
      const data = await response.json();
      results.push({ status: response.status, elapsedMs: Date.now() - started, result: data });
      await mkdir('.local', { recursive: true });
      await writeFile('.local/hard-mcq-results.json', JSON.stringify(results, null, 2));
      return response.ok ? data : { error: data.error, retryMs: data.retryMs };
    }
    return { ok: true };
  });
  await page.addScriptTag({ content: await readFile('../content.js', 'utf8') });
  await page.evaluate(() => new Promise(resolve => window.listeners[0]({ type: 'TOGGLE', enabled: true, interval: 60 }, {}, resolve)));
  const cases = q7 ? [{ number: 7, correctOption: 2, expected: /9/ }, { number: 8, correctOption: 0, expected: /P0 requests 3/ }] : [{ number: 1, correctOption: 1, expected: /6\.5/ }, { number: 2, correctOption: 2, expected: /16\s*\/\s*3/ }];
  for (const item of cases) {
    await page.waitForFunction(() => window.testRoot.querySelectorAll('.box').length > 0 || window.testRoot.querySelector('.status').textContent.includes('not deducted'), null, { timeout: 60000 });
    const last = results.at(-1);
    assert.equal(last.status, 200, JSON.stringify(last.result));
    assert.equal(last.result.pipeline, 'read-then-solve');
    assert.equal(last.result.reader, 'page-text', 'Text quiz must not spend a vision request.');
    assert.equal(last.result.questions.length, 1);
    assert.equal(last.result.questions[0].answers.length, 1, 'Single-answer question must never highlight an option list.');
    assert.match(last.result.questions[0].answers[0].text, item.expected);
    assert.equal(await page.evaluate(() => window.testRoot.querySelectorAll('.box').length), 1);
    const overlap = await page.evaluate(option => {
      const box = window.testRoot.querySelector('.box').getBoundingClientRect();
      const row = document.querySelectorAll('#options label')[option].getBoundingClientRect();
      return Math.max(0, Math.min(box.bottom, row.bottom) - Math.max(box.top, row.top)) / row.height;
    }, item.correctOption);
    assert.ok(overlap > 0.9, 'Highlight must be on the calculated correct row.');
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: `test-results/hard-mcq-q${item.number}.png`, fullPage: true });
    console.log(JSON.stringify({ question: item.number, status: 'PASS', provider: last.result.provider, model: last.result.model, selected: last.result.questions[0].answers[0].text, highlightedOptions: 1, rowOverlap: overlap, elapsedMs: last.elapsedMs }));
    if (item === cases[0]) {
      await page.locator('#next').click();
      await page.waitForFunction(() => !window.testRoot.querySelector('.box'), null, { timeout: 3000 });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS automatic Next clears the old answer and highlights exactly one correct option using page text.');
} finally { await browser.close(); }
