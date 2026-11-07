import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 }, bypassCSP: true });
  await page.goto('https://mcq-lens.pages.dev/test?src=dom-reading-qa');
  for (let i = 0; i < 6; i++) await page.locator('#next').click();
  await page.evaluate(() => {
    window.listeners = []; window.scans = [];
    window.chrome = { runtime: { onMessage: { addListener: fn => window.listeners.push(fn) }, sendMessage: async message => {
      if (message.type === 'CAPTURE') { const canvas = document.createElement('canvas'); canvas.width = innerWidth; canvas.height = innerHeight; return { image: canvas.toDataURL() }; }
      if (message.type === 'SOLVE') { window.scans.push(message); return { questions: [] }; }
      return { ok: true };
    } } };
    window.scan = () => new Promise(resolve => window.listeners[0]({ type: 'SCAN' }, {}, resolve));
  });
  await page.addScriptTag({ content: await readFile(new URL('../content.js', import.meta.url), 'utf8') });
  await page.evaluate(() => new Promise(resolve => window.listeners[0]({ type: 'TOGGLE', enabled: true }, {}, resolve)));
  await page.waitForFunction(() => window.scans.length === 1);
  const questions = await page.evaluate(() => window.scans[0].extractedQuestions);
  assert.match(questions[0].question, /least-recently-used/);
  assert.match(questions[0].question, /7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2/);
  assert.equal(questions[0].options.length, 4);
  console.log('PASS full Q7 prompt, reference string and four options extracted; short control legend is not the question.');
  await page.evaluate(async () => { document.querySelectorAll('#options label')[3].style.transform = 'translateY(1500px)'; await window.scan(); });
  await page.waitForFunction(() => window.scans.length === 2);
  assert.equal(await page.evaluate(() => window.scans[1].extractedQuestions), undefined);
  console.log('PASS clipped fourth option refuses partial page-text extraction.');
  await page.evaluate(async () => { document.querySelectorAll('#options label')[3].style.transform = ''; const canvas = document.createElement('canvas'); document.querySelector('section').append(canvas); await window.scan(); });
  await page.waitForFunction(() => window.scans.length === 3);
  assert.equal(await page.evaluate(() => window.scans[2].extractedQuestions), undefined);
  console.log('PASS image/canvas question keeps screenshot fallback.');
} finally { await browser.close(); }
