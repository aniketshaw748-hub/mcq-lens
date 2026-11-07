const $ = id => document.getElementById(id);
chrome.storage.local.get(['apiKey', 'model', 'interval', 'backendURL', 'studentToken']).then(s => {
  $('key').value = s.apiKey || ''; $('model').value = s.model || 'gemini-2.5-flash-lite'; $('interval').value = s.interval || 10;
  if (s.backendURL && s.studentToken) $('access-link').value = `${s.backendURL}/#access=${s.studentToken}`;
});
$('shared-form').onsubmit = async event => {
  event.preventDefault();
  try {
    const url = new URL($('access-link').value.trim());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('Use a secure HTTPS student link.');
    const studentToken = new URLSearchParams(url.hash.slice(1)).get('access');
    if (!studentToken) throw new Error('The link needs its complete #access= code.');
    const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (!granted) throw new Error('Allow access to your study service to connect.');
    const response = await fetch(`${url.origin}/api/me`, { headers: { Authorization: `Bearer ${studentToken}` } });
    if (!response.ok) throw new Error('Access link rejected. Check it is complete and has not expired.');
    await chrome.storage.local.set({ backendURL: url.origin, studentToken });
    $('shared-status').textContent = 'Connected. Enable MCQ Lens on a question tab.';
  } catch (error) { $('shared-status').textContent = error.message; }
};
$('reveal').onclick = () => { const hidden = $('key').type === 'password'; $('key').type = hidden ? 'text' : 'password'; $('reveal').textContent = hidden ? 'Hide' : 'Show'; };
$('form').onsubmit = async event => {
  event.preventDefault();
  const apiKey = $('key').value.trim(); if (!apiKey) return;
  await chrome.storage.local.set({ apiKey, model: $('model').value.trim() });
  await chrome.storage.local.remove(['backendURL', 'studentToken']);
  $('status').textContent = 'Saved. Personal key mode is active.';
};
$('remove').onclick = async () => { await chrome.storage.local.remove('apiKey'); $('key').value = ''; $('status').textContent = 'Saved key deleted.'; };
$('save-interval').onclick = async () => {
  const interval = Number($('interval').value);
  if (!Number.isFinite(interval) || interval < 6 || interval > 60) { $('interval-status').textContent = 'Choose 6–60 seconds.'; return; }
  await chrome.storage.local.set({ interval }); $('interval-status').textContent = 'Saved. Re-enable the tab to use this interval.';
};
