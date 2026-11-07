import { solve } from './solver.js';

// No page/content-script access to the API key.
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const jobs = new Map();
const lastRequest = new Map();

async function active(tabId, windowId) {
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  const window = await chrome.windows.get(windowId);
  return tab?.id === tabId && window.focused;
}

async function handle(message, sender) {
  const tab = sender.tab;
  if (!tab || sender.frameId !== 0) throw new Error('This request must come from the enabled tab.');
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
  const settings = await chrome.storage.local.get(['apiKey', 'model', 'backendURL', 'studentToken']);
  if (!(settings.backendURL && settings.studentToken) && !settings.apiKey) throw new Error('Connect your student access link in Settings first.');
  const remaining = (lastRequest.get(tab.id) || 0) - Date.now();
  if (remaining > 0) return { error: 'Waiting before the next request.', retryMs: remaining };
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
    return { error: error.name === 'AbortError' ? 'Scan stopped or timed out.' : error.message, retryMs };
  } finally {
    clearTimeout(timeout);
    if (jobs.get(tab.id) === controller) jobs.delete(tab.id);
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!['CAPTURE', 'SOLVE', 'CANCEL'].includes(message.type)) return;
  handle(message, sender).then(reply, error => reply({ error: error.message, retryMs: 10000 }));
  return true;
});
chrome.tabs.onRemoved.addListener(id => {
  jobs.get(id)?.abort(); jobs.delete(id); lastRequest.delete(id);
});
