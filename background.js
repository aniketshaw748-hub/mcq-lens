import { solve, sendReport } from './solver.js';

// No page/content-script access to the API key.
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const jobs = new Map();
const lastRequest = new Map();
const recentReports = new Map();

async function clientSettings() {
  const settings = await chrome.storage.local.get(['clientId', 'groqKey', 'geminiKey', 'zaiKey', 'apiKey', 'autoReports']);
  // A random install ID keeps this browser's daily allowance; no account or link is needed.
  if (!settings.clientId) { settings.clientId = crypto.randomUUID(); await chrome.storage.local.set({ clientId: settings.clientId }); }
  return settings;
}
// Automatic reports respect the Settings switch and send each kind of error at most once per 10 minutes.
async function fileReport(report) {
  const settings = await clientSettings();
  if (report.kind !== 'user') {
    if (settings.autoReports === false) return { skipped: true };
    const key = `${report.stage}|${report.reason}|${String(report.message).replace(/\d+/g, 'n')}`;
    if (Date.now() - (recentReports.get(key) || 0) < 600000) return { skipped: true };
    recentReports.set(key, Date.now());
  }
  const brands = navigator.userAgentData?.brands || [];
  const brand = brands.find(b => !/Not.?A.?Brand|Chromium/i.test(b.brand)) || brands.find(b => /Chromium/i.test(b.brand));
  return sendReport(settings, { ...report, version: chrome.runtime.getManifest().version, browser: brand ? `${brand.brand} ${brand.version}` : navigator.userAgent.slice(0, 80), ownKeys: Boolean(settings.groqKey || settings.geminiKey || settings.zaiKey || settings.apiKey) });
}
// Crashes in the background worker itself.
self.addEventListener('unhandledrejection', event => { fileReport({ kind: 'auto', stage: 'background', reason: 'exception', message: String(event.reason?.message || event.reason).slice(0, 300), events: [] }).catch(() => {}); });

async function active(tabId, windowId) {
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  const window = await chrome.windows.get(windowId);
  return tab?.id === tabId && window.focused;
}

async function handle(message, sender) {
  const tab = sender.tab;
  if (!tab || sender.frameId !== 0) throw new Error('This request must come from the enabled tab.');
  if (message.type === 'REPORT') return fileReport(message.report || {});
  if (message.type === 'CANCEL') {
    jobs.get(tab.id)?.abort(); jobs.delete(tab.id); return { ok: true };
  }
  if (!['CAPTURE', 'SOLVE'].includes(message.type)) return;
  if (!await active(tab.id, tab.windowId)) return { paused: true };
  if (message.type === 'CAPTURE') {
    const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!await active(tab.id, tab.windowId)) return { paused: true };
    return { image };
  }
  if (typeof message.image !== 'string' || message.image.length > 12000000) throw new Error('Invalid screenshot.');
  const settings = await clientSettings();
  const remaining = (lastRequest.get(tab.id) || 0) - Date.now();
  if (remaining > 0) return { error: 'Queued. Checking this question in a moment…', retryMs: remaining, reason: 'throttle' };
  jobs.get(tab.id)?.abort();
  const controller = new AbortController();
  jobs.set(tab.id, controller);
  lastRequest.set(tab.id, Date.now() + 6000);
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    return { questions: await solve(settings, message.image, controller.signal, message.extractedQuestions) };
  } catch (error) {
    const retryMs = error.retryMs || (error.status === 429 ? 60000 : 10000);
    if (error.status === 429) lastRequest.set(tab.id, Date.now() + retryMs);
    if (error.name === 'AbortError') return { error: 'Scan stopped or timed out.', retryMs, reason: controller.signal.aborted && jobs.get(tab.id) !== controller ? 'cancelled' : 'timeout' };
    return { error: error.message, retryMs, reason: error.reason || (error.status ? `http_${error.status}` : 'network'), stage: error.stage, status: error.status };
  } finally {
    clearTimeout(timeout);
    if (jobs.get(tab.id) === controller) jobs.delete(tab.id);
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!['CAPTURE', 'SOLVE', 'CANCEL', 'REPORT'].includes(message.type)) return;
  handle(message, sender).then(reply, error => reply({ error: error.message, retryMs: 10000 }));
  return true;
});
chrome.tabs.onRemoved.addListener(id => {
  jobs.get(id)?.abort(); jobs.delete(id); lastRequest.delete(id);
});
