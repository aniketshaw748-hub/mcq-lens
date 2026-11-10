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
  await page.setContent(`<html><head><style>body{font:20px Arial;padding:60px;background:#fff;min-height:2400px}label{display:block;padding:20px;margin:10px;background:#f2f2f2;max-width:700px}button{padding:16px}</style></head><body><h1 id="q">What is 2 + 2?</h1><label><input type="radio" name="a"> 3</label><label><input type="radio" name="a"> 4</label><label><input type="radio" name="a"> 5</label><label><input type="radio" name="a"> 6</label><button id="next">Next question</button></body></html>`);
  await page.evaluate(() => {
    window.testRoots = [];
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); window.testRoots.push(root); return root; };
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1100, 800);
    window.image1 = canvas.toDataURL(); ctx.fillStyle = 'black'; ctx.fillRect(50, 50, 900, 80); window.image2 = canvas.toDataURL(); ctx.fillStyle = 'blue'; ctx.fillRect(50, 300, 900, 300); window.image3 = canvas.toDataURL();
    window.calls = []; window.reports = []; window.listeners = []; window.delay = 0; window.failure = null;
    window.chrome = { runtime: {
      onMessage: { addListener(fn) { window.listeners.push(fn); } },
      async sendMessage(message) {
        window.calls.push(message.type);
        if (message.type === 'CAPTURE') return window.unfocused ? { paused: true } : { image: window.imageOverride || (document.querySelector('#q').textContent.includes('capital') ? window.image2 : document.querySelector('#q').textContent.includes('appeared') ? window.image3 : window.image1) };
        if (message.type === 'REPORT') { window.reports.push(message.report); return { received: true, id: window.reports.length }; }
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

  // The mark is a dot on the option's radio button; after scrolling it must still sit on that radio.
  const dotOnRadio = () => page.evaluate(() => {
    const dot = window.testRoots[0].querySelector('.box').getBoundingClientRect(), radio = document.querySelectorAll('label')[1].querySelector('input').getBoundingClientRect();
    return Math.hypot(dot.left + dot.width / 2 - radio.left - radio.width / 2, dot.top + dot.height / 2 - radio.top - radio.height / 2) < 2;
  });
  await page.mouse.wheel(0, 150); await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length), initialRequests);
  assert.equal(await boxCount(), 1); assert.ok(await dotOnRadio(), 'the dot stays on the option’s radio button');
  console.log('PASS scrolling moves the highlight with its option and does not re-read');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
  await page.evaluate(() => { window.capturesBefore = window.calls.filter(x => x === 'CAPTURE').length; window.unfocused = true; });
  await page.waitForFunction(() => window.calls.filter(x => x === 'CAPTURE').length > window.capturesBefore + 1);
  assert.equal(await boxCount(), 1);
  assert.match(await page.evaluate(() => window.testRoots[0].querySelector('.status').textContent), /1 suggested/, 'no pause message while the tab is off screen');
  await page.evaluate(() => { window.unfocused = false; });
  assert.equal(await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length), initialRequests);
  console.log('PASS an off-screen tab keeps its highlight quietly and does not re-read on return');

  await page.evaluate(() => { document.querySelector('#q').textContent = 'What is the capital of France?'; document.querySelectorAll('label').forEach((label, i) => { label.lastChild.textContent = [' London', ' Paris', ' Rome', ' Berlin'][i]; }); });
  await page.waitForFunction(() => window.testRoots[0].querySelector('.reason').textContent.includes('Paris'));
  assert.equal(await boxCount(), 1);
  console.log('PASS question changes trigger automatic fresh answers');
  // The page shows only the highlight; the reasoning panel opens with the shortcut and hides with ×.
  const panel = () => page.evaluate(() => { const r = window.testRoots[0], hud = r.querySelector('.hud'); return { open: !hud.hidden && getComputedStyle(hud).display !== 'none', boxes: r.querySelectorAll('.box').length, buttons: [...hud.querySelectorAll('button')].filter(b => !b.closest('.report')).map(b => b.id), reason: r.querySelector('.reason').textContent }; });
  let view = await panel();
  assert.equal(view.open, false); assert.ok(view.boxes > 0); assert.match(view.reason, /Paris/);
  assert.deepEqual(await page.evaluate(() => window.dispatchExtension({ type: 'PANEL' })), { open: true });
  view = await panel(); assert.equal(view.open, true); assert.deepEqual(view.buttons, ['hide']);
  await page.evaluate(() => window.testRoots[0].querySelector('#hide').click());
  assert.equal((await panel()).open, false);
  assert.equal((await state()).enabled, true, 'hiding the panel does not turn MCQ Lens off');
  console.log('PASS no window by default: highlight only; the shortcut shows the reasoning and the hide button hides it');

  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../test-results/highlight.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  await page.evaluate(() => window.dispatchExtension({ type: 'AREA' }));
  await page.mouse.move(70, 80); await page.mouse.down(); await page.mouse.move(850, 620); await page.mouse.up();
  await waitStatus('1 suggested');
  assert.ok(await page.evaluate(() => parseFloat(window.testRoots[0].querySelector('.box').style.left) >= 70));
  console.log('PASS question-area selection and crop coordinate mapping');
  assert.equal((await state()).cropped, true);
  await page.evaluate(() => window.dispatchExtension({ type: 'FULL' }));
  assert.equal((await state()).cropped, false);
  console.log('PASS popup can switch back from a selected area to the full page');

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

  await page.evaluate(() => { window.delay = 1500; window.imageOverride = null; window.dispatchExtension({ type: 'TOGGLE', enabled: true, interval: 6 }); });
  await waitStatus('Reading');
  await page.evaluate(() => { document.querySelector('#q').textContent = 'A new question appeared before the result'; });
  await waitStatus('changed while reading'); assert.equal(await boxCount(), 0);
  console.log('PASS stale question response rejected');
  await page.evaluate(() => window.dispatchExtension({ type: 'TOGGLE', enabled: false }));

  await page.evaluate(() => { window.delay = 0; window.failure = { error: 'Screenshot reading is unavailable right now.', reason: 'provider_unavailable', stage: 'reading', retryMs: 6000 }; window.dispatchExtension({ type: 'TOGGLE', enabled: true, interval: 6 }); });
  await waitStatus('unavailable right now');
  await page.waitForFunction(() => window.reports.length === 1);
  const autoReport = await page.evaluate(() => window.reports[0]);
  assert.equal(autoReport.kind, 'auto'); assert.equal(autoReport.stage, 'reading'); assert.equal(autoReport.site, '');
  assert.ok(autoReport.events.some(e => e.type === 'ask') && autoReport.events.some(e => e.type === 'error'));
  assert.ok(!/capital|France|2 \+ 2|appeared/.test(JSON.stringify(autoReport)));
  console.log('PASS a real error sends an automatic report with the extension steps and no question text');

  await page.evaluate(() => { window.dispatchExtension({ type: 'REPORT_FORM' }); window.testRoots[0].querySelector('#note').value = 'Highlighted the wrong option'; window.testRoots[0].querySelector('#shot').checked = true; window.testRoots[0].querySelector('#send').click(); });
  await waitStatus('report #2 sent');
  const userReport = await page.evaluate(() => window.reports[1]);
  assert.equal(userReport.kind, 'user'); assert.equal(userReport.note, 'Highlighted the wrong option'); assert.ok(userReport.screenshot.length > 1000);
  await page.evaluate(() => { window.dispatchExtension({ type: 'REPORT_FORM' }); window.testRoots[0].querySelector('#note').value = 'No screenshot please'; window.testRoots[0].querySelector('#send').click(); });
  await waitStatus('report #3 sent');
  assert.equal(await page.evaluate(() => window.reports[2].screenshot), '');
  console.log('PASS Report a problem sends the note, and a screenshot only when ticked');
  await page.evaluate(() => window.dispatchExtension({ type: 'TOGGLE', enabled: false }));

  await page.evaluate(() => { window.delay = 0; window.failure = { error: 'API quota reached. Paused for 60 seconds', reason: 'daily', retryMs: 60000 }; window.dispatchExtension({ type: 'TOGGLE', enabled: true, interval: 6 }); });
  await waitStatus('quota reached');
  const quotaCalls = await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length);
  await page.waitForTimeout(6500);
  assert.equal(await page.evaluate(() => window.calls.filter(x => x === 'SOLVE').length), quotaCalls);
  assert.equal(await boxCount(), 0); assert.equal(await page.evaluate(() => window.reports.length), 3);
  console.log('PASS quota error pauses requests and is not reported as a bug');
  assert.deepEqual(errors, []);
  console.log('PASS no browser runtime errors');
} finally { await browser.close(); }
