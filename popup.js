const $ = id => document.getElementById(id);
let tab;
let enabled = false, cropped = false;
async function send(type, extra = {}) {
  return chrome.tabs.sendMessage(tab.id, { type, ...extra });
}
function show(state) {
  enabled = Boolean(state?.enabled); cropped = Boolean(state?.cropped);
  $('toggle').textContent = enabled ? 'Turn off on this tab' : 'Enable on this tab';
  $('toggle').classList.toggle('primary', !enabled);
  $('mode').textContent = enabled ? 'On' : 'Off';
  $('mode').classList.toggle('on', enabled);
  $('status').textContent = state?.status || 'It reads each question by itself once it’s on.';
  // Area and reports only make sense while the tab is being watched.
  $('area').disabled = $('report').disabled = !enabled;
  $('area').textContent = cropped ? 'Use full page' : 'Select area';
}
async function refresh() {
  try { show(await send('STATE')); } catch { show(null); }
}
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('toggle').onclick = async () => {
  $('toggle').disabled = true;
  try {
    const settings = await chrome.storage.local.get(['interval']);
    if (!/^https?:/.test(tab.url || '')) throw new Error('Open a regular website first. Browser system pages and PDFs are not supported.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await send('TOGGLE', { enabled: !enabled, interval: settings.interval || 10 });
    await refresh();
  } catch (error) { $('status').textContent = error.message; }
  finally { $('toggle').disabled = false; }
};
// Selecting an area and reporting happen on the page itself, so the popup closes.
$('area').onclick = async () => { await send(cropped ? 'FULL' : 'AREA'); window.close(); };
$('report').onclick = async () => { await send('REPORT_FORM'); window.close(); };
chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => { tab = tabs[0]; refresh(); });
