import { browsers, detect, downloadUrl, visit } from './browsers.js';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let current = browsers[params.get('browser')] ? params.get('browser') : detect();

function show(key) {
  current = key;
  const b = browsers[key];
  document.querySelectorAll('[role=tab]').forEach(tab => {
    const on = tab.dataset.browser === key;
    tab.setAttribute('aria-selected', on); tab.tabIndex = on ? 0 : -1;
  });
  $('panel').setAttribute('aria-labelledby', `tab-${key}`);
  $('panel').innerHTML = `${b.lead ? `<p class="note">${b.lead}</p>` : ''}
    <ol class="steps">
      <li>Download <a class="file" href="${downloadUrl(key)}" data-file>${b.file}</a>.</li>
      ${b.steps.map(step => `<li>${step}</li>`).join('')}
    </ol>
    <div class="copy"><code>${b.page}</code><button type="button" id="copy">Copy address</button></div>
    <p class="note">${b.note}</p>`;
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(b.page); $('copy').textContent = 'Copied'; }
    catch { $('copy').textContent = 'Select and copy it'; }
  };
  $('panel').querySelector('[data-file]').onclick = () => visit(`download-${key}`);
}

document.querySelectorAll('[role=tab]').forEach(tab => {
  tab.onclick = () => show(tab.dataset.browser);
  tab.onkeydown = event => {
    const tabs = [...document.querySelectorAll('[role=tab]')];
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
    next.focus(); show(next.dataset.browser);
  };
});
show(current);

// Arriving from a Download button: start the download once and say so.
if (params.get('download') === '1') {
  $('title').textContent = 'Your download has started';
  $('lead').innerHTML = `<b>${browsers[current].file}</b> is downloading. Follow the steps for ${browsers[current].name} below. Didn’t start? <a href="${downloadUrl(current)}">Download it again</a>.`;
  params.delete('download');
  history.replaceState(null, '', `${location.pathname}?${params}`);
  visit(`download-${current}`);
  setTimeout(() => { location.href = downloadUrl(current); }, 400);
} else visit('install-guide');
