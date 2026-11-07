import { chromium } from 'playwright';
import { readdir, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const extension = fileURLToPath(new URL('..', import.meta.url));
const cache = path.join(homedir(), 'AppData/Local/ms-playwright');
const installed = (await readdir(cache)).filter(x => /^chromium-\d+$/.test(x)).sort().at(-1);
const executablePath = process.env.CHROMIUM_PATH || path.join(cache, installed, 'chrome-win64/chrome.exe');
const profile = path.join(extension, 'test-results/extension-profile');
await mkdir(profile, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  executablePath, headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.locator('summary').click();
  await page.locator('#key').fill('test-key-not-real');
  await page.locator('#interval').fill('8');
  await page.getByRole('button', { name: 'Save personal key' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
  await page.getByRole('button', { name: 'Save check interval' }).click();
  const settings = await page.evaluate(() => chrome.storage.local.get(['apiKey', 'interval']));
  assert.equal(settings.apiKey, 'test-key-not-real'); assert.equal(settings.interval, 8);
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  assert.equal(await page.locator('#key').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Delete saved key' }).click();
  assert.equal((await page.evaluate(() => chrome.storage.local.get('apiKey'))).apiKey, undefined);
  console.log('PASS real unpacked extension loads; settings save, reveal, delete');
  // Exercise the packaged module from an extension page; service workers
  // support static imports but prohibit dynamic import().
  const workerResult = await page.evaluate(async () => {
    const { parseResult } = await import(chrome.runtime.getURL('solver.js'));
    return parseResult({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"questions":[]}' }] } }] });
  });
  assert.deepEqual(workerResult, []);
  assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().manifest_version), 3);
  await page.screenshot({ path: path.join(extension, 'test-results/settings.png') });
  assert.deepEqual(errors, []);
  console.log('PASS Manifest V3 worker and solver load without browser errors');
} finally { await context.close(); }
