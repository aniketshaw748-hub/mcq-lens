const $ = id => document.getElementById(id);
// Ring colour: a preset or any custom colour. Saved at once and applied to tabs where MCQ Lens is on.
const showRing = color => {
  let preset = false;
  for (const swatch of document.querySelectorAll('.swatch[data-color]')) { const on = swatch.dataset.color === color; preset ||= on; swatch.setAttribute('aria-pressed', on); }
  $('ring-custom').parentElement.classList.toggle('on', !preset);
  if (!preset) { $('ring-custom').value = color; $('ring-custom').parentElement.style.setProperty('--c', color); }
};
const saveRing = async color => { await chrome.storage.local.set({ ringColor: color }); showRing(color); $('ring-status').textContent = 'Saved.'; };
document.querySelectorAll('.swatch[data-color]').forEach(swatch => { swatch.onclick = () => saveRing(swatch.dataset.color); });
$('ring-custom').onchange = () => saveRing($('ring-custom').value);
const fields = { groq: 'groqKey', gemini: 'geminiKey', zai: 'zaiKey' };
chrome.storage.local.get(['groqKey', 'geminiKey', 'zaiKey', 'apiKey', 'interval', 'autoReports', 'ringColor']).then(s => {
  showRing(s.ringColor || '');
  $('auto-reports').checked = s.autoReports !== false;
  $('groq').value = s.groqKey || ''; $('gemini').value = s.geminiKey || s.apiKey || ''; $('zai').value = s.zaiKey || ''; $('interval').value = s.interval || 10;
});
$('keys-form').onsubmit = async event => {
  event.preventDefault();
  const values = Object.fromEntries(Object.entries(fields).map(([id, name]) => [name, $(id).value.trim()]));
  if (Object.values(values).some(value => value && !/^[\x21-\x7e]{10,300}$/.test(value))) { $('status').textContent = 'A key looks incomplete. Paste the whole key without spaces.'; return; }
  await chrome.storage.local.set(Object.fromEntries(Object.entries(values).filter(([, value]) => value)));
  await chrome.storage.local.remove(['apiKey', ...Object.entries(values).filter(([, value]) => !value).map(([name]) => name)]);
  $('status').textContent = Object.values(values).some(Boolean) ? 'Saved. Your questions now use your own keys.' : 'No keys saved. Using the shared service.';
};
$('reveal').onclick = () => {
  const hidden = $('groq').type === 'password';
  for (const id of Object.keys(fields)) $(id).type = hidden ? 'text' : 'password';
  $('reveal').textContent = hidden ? 'Hide keys' : 'Show keys';
};
$('remove').onclick = async () => {
  await chrome.storage.local.remove(['apiKey', ...Object.values(fields)]);
  for (const id of Object.keys(fields)) $(id).value = '';
  $('status').textContent = 'Saved keys deleted. Using the shared service.';
};
$('auto-reports').onchange = async () => {
  await chrome.storage.local.set({ autoReports: $('auto-reports').checked });
  $('reports-status').textContent = $('auto-reports').checked ? 'Automatic error reports are on.' : 'Automatic error reports are off. You can still send a report yourself.';
};
// Saves as soon as the value changes; there is no separate save button.
$('interval').onchange = async () => {
  const interval = Number($('interval').value);
  if (!Number.isFinite(interval) || interval < 6 || interval > 60) { $('interval-status').textContent = 'Choose 6–60 seconds.'; return; }
  await chrome.storage.local.set({ interval }); $('interval-status').textContent = 'Saved. Applies the next time you turn MCQ Lens on.';
};
