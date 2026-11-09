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
  assert.equal(await page.locator('#access-link').count(), 0);
  await page.locator('#groq').fill('gsk_test-key-not-real');
  await page.locator('#interval').fill('8');
  await page.getByRole('button', { name: 'Save keys' }).click();
  await page.locator('#status').filter({ hasText: 'Saved.' }).waitFor();
  await page.locator('#interval').dispatchEvent('change');
  await page.locator('#interval-status').filter({ hasText: 'Saved.' }).waitFor();
  const settings = await page.evaluate(() => chrome.storage.local.get(['groqKey', 'geminiKey', 'interval']));
  assert.equal(settings.groqKey, 'gsk_test-key-not-real'); assert.equal(settings.geminiKey, undefined); assert.equal(settings.interval, 8);
  await page.getByRole('button', { name: 'Show keys' }).click();
  assert.equal(await page.locator('#groq').getAttribute('type'), 'text');
  await page.screenshot({ path: path.join(extension, 'test-results/settings.png'), fullPage: true });
  await page.getByRole('button', { name: 'Delete saved keys' }).click();
  assert.equal((await page.evaluate(() => chrome.storage.local.get('groqKey'))).groqKey, undefined);
  console.log('PASS real unpacked extension loads with no access link; own keys save, reveal, delete');
  // Exercise the packaged module from an extension page; service workers
  // support static imports but prohibit dynamic import().
  const workerResult = await page.evaluate(async () => {
    const { SERVICE_URL } = await import(chrome.runtime.getURL('solver.js'));
    return SERVICE_URL;
  });
  assert.equal(workerResult, 'https://mcq-lens.pages.dev');
  assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().manifest_version), 3);
  assert.deepEqual(errors, []);
  const shortcut = await page.evaluate(async () => (await chrome.commands.getAll()).find(c => c.name === 'toggle-reasoning')?.shortcut);
  assert.equal(shortcut, 'Alt+Shift+Y');
  console.log('PASS Manifest V3 worker and solver load without browser errors');
  console.log(`PASS reasoning shortcut registered as ${shortcut}`);
} finally { await context.close(); }
