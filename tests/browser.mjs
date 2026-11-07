import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Browser integration test of the real content script with a simulated Chrome
// transport and screenshot/solver responses. Does not consume paid/free API quota.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent(`<html><head><style>body{font:20px Arial;padding:60px;background:#fff}label{display:block;padding:20px;margin:10px;background:#f2f2f2;max-width:700px}button{padding:16px}</style></head><body><h1 id="q">What is 2 + 2?</h1><label><input type="radio" name="a"> 3</label><label><input type="radio" name="a"> 4</label><label><input type="radio" name="a"> 5</label><label><input type="radio" name="a"> 6</label><button id="next">Next question</button></body></html>`);
  await page.evaluate(() => {
    window.testRoots = [];
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); window.testRoots.push(root); return root; };
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1100, 800);
    window.image1 = canvas.toDataURL(); ctx.fillStyle = 'black'; ctx.fillRect(50, 50, 900, 80); window.image2 = canvas.toDataURL();
    window.calls = []; window.listeners = []; window.delay = 0; window.failure = null;
    window.chrome = { runtime: {
      onMessage: { addListener(fn) { window.listeners.push(fn); } },
      async sendMessage(message) {
        window.calls.push(message.type);
        if (message.type === 'CAPTURE') return { image: window.imageOverride || (document.querySelector('#q').textContent.includes('capital') ? window.image2 : window.image1) };
        if (message.type === 'SOLVE') {
          const question = document.querySelector('#q').textContent;
          if (window.delay) await new Promise(resolve => setTimeout(resolve, window.delay));
          if (window.failure) return window.failure;
          const rect = document.querySelectorAll('label')[1].getBoundingClientRect();
          const box = [rect.top / 800 * 1000, rect.left / 1100 * 1000, rect.bottom / 800 * 1000, rect.right / 1100 * 1000];
          return { questions: [{ question, confidence: 'high', explanation: question.includes('capital') ? 'Paris is the capital of France.' : 'Two plus two equals four.', answers: [{ text: question.includes('capital') ? 'Paris' : '4', box }] }] };
        }
        return { ok: true };
      }
    } };
    window.dispatchExtension = message => new Promise(resolve => window.listeners[0](message, {}, resolve));
  });
  await page.addScriptTag({ content: await readFile(new URL('../content.js', import.meta.url), 'utf8') });
  const state = () => page.evaluate(() => window.dispatchExtension({ type: 'STATE' }));
  const boxCount = () => page.evaluate(() => window.testRoots[0].querySelectorAll('.box').length);
  const waitStatus = text => page.waitForFunction(text => window.testRoots[0].querySelector('.status').textContent.includes(text), text);
  await page.evaluate(() => window.dispatchExtension({ type: 'TOGGLE', enabled: true, interval: 6 }));
  await waitStatus('1 suggested'); assert.equal(await boxCount(), 1);
  assert.equal(await page.locator('input:checked').count(), 0);
  console.log('PASS enable, screenshot scan, highlight, no auto-click');

  const initialRequests = await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length);
  await page.waitForTimeout(6500);
  assert.equal(await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length), initialRequests);
  console.log('PASS unchanged screenshots use no new API request');

  await page.evaluate(() => { document.querySelector('#q').textContent = 'What is the capital of France?'; document.querySelectorAll('label').forEach((label, i) => { label.lastChild.textContent = [' London', ' Paris', ' Rome', ' Berlin'][i]; }); });
  await page.waitForFunction(() => window.testRoots[0].querySelector('.reason').textContent.includes('Paris'));
  assert.equal(await boxCount(), 1);
  console.log('PASS question changes trigger automatic fresh answers');

  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../test-results/highlight.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  await page.evaluate(() => window.dispatchExtension({ type: 'AREA' }));
  await page.mouse.move(70, 80); await page.mouse.down(); await page.mouse.move(850, 620); await page.mouse.up();
  await waitStatus('1 suggested');
  assert.ok(await page.evaluate(() => parseFloat(window.testRoots[0].querySelector('.box').style.left) >= 70));
  console.log('PASS question-area selection and crop coordinate mapping');

  const beforeImageChange = await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length);
  await page.evaluate(() => { window.imageOverride = window.image1; });
  await page.waitForFunction(n => window.calls.filter(x => x === 'SOLVE').length > n, beforeImageChange, { timeout: 12000 });
  await waitStatus('1 suggested');
  console.log('PASS image-only screen changes trigger a scan without DOM changes');

  await page.evaluate(() => { window.delay = 1500; window.dispatchExtension({ type: 'SCAN' }); });
  await waitStatus('Reading');
  await page.evaluate(() => window.dispatchExtension({ type: 'TOGGLE', enabled: false }));
  await page.waitForTimeout(1900);
  assert.equal(await boxCount(), 0); assert.equal((await state()).enabled, false);
  assert.equal(await page.locator('#mcq-lens-overlay').count(), 0);
  console.log('PASS disabling cancels the scan and rejects late results');

  await page.evaluate(() => { window.delay = 1500; window.dispatchExtension({ type: 'TOGGLE', enabled: true, interval: 6 }); });
  await waitStatus('Reading');
  await page.evaluate(() => { document.querySelector('#q').textContent = 'A new question appeared before the result'; });
  await waitStatus('changed while reading'); assert.equal(await boxCount(), 0);
  console.log('PASS stale question response rejected');
  await page.evaluate(() => window.dispatchExtension({ type: 'TOGGLE', enabled: false }));

  await page.evaluate(() => { window.delay = 0; window.failure = { error: 'API quota reached. Paused for 60 seconds', retryMs: 60000 }; window.dispatchExtension({ type: 'TOGGLE', enabled: true, interval: 6 }); });
  await waitStatus('quota reached');
  const quotaCalls = await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length);
  await page.waitForTimeout(6500);
  assert.equal(await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length), quotaCalls);
  assert.equal(await boxCount(), 0);
  console.log('PASS quota error pauses requests');
  assert.deepEqual(errors, []);
  console.log('PASS no browser runtime errors');
} finally { await browser.close(); }
