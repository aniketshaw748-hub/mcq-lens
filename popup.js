const $ = id => document.getElementById(id);
let tab;
let enabled = false;
async function send(type, extra = {}) {
  return chrome.tabs.sendMessage(tab.id, { type, ...extra });
}
async function refresh() {
  try {
    const state = await send('STATE');
    enabled = state.enabled;
    $('toggle').textContent = enabled ? 'Turn off on this tab' : 'Enable on this tab';
    $('mode').textContent = enabled ? 'WATCHING' : 'OFF';
    $('mode').classList.toggle('on', enabled);
    $('status').textContent = state.status;
    $('area').disabled = $('scan').disabled = !enabled;
  } catch { $('status').textContent = 'Enable to start watching this tab.'; $('area').disabled = $('scan').disabled = true; }
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
$('area').onclick = async () => { await send('AREA'); window.close(); };
$('scan').onclick = async () => { await send('SCAN'); await refresh(); };
chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => { tab = tabs[0]; refresh(); });
