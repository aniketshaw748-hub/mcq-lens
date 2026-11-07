import { marked } from './vendor/marked.esm.js';
const $ = id => document.getElementById(id);
fetch(`/api/visit?src=${encodeURIComponent(new URLSearchParams(location.search).get('src') || 'direct')}`, { method: 'POST' }).catch(() => {});
let token = sessionStorage.getItem('mcq-access') || '', busy = false;
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('access')) { token = fragment.get('access'); history.replaceState(null, '', location.pathname); sessionStorage.setItem('mcq-access', token); }
$('access').value = token;
const status = text => { $('status').textContent = text; };
async function call(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { retryMs: data.retryMs });
  return data;
}
async function connect() {
  try {
    const me = await call('/api/me'); $('allowance').textContent = `${Math.max(0, me.dailyLimit - me.used)} of ${me.dailyLimit} questions left today`;
    $('access-form').hidden = true; status('Connected. Ask your next question.'); return true;
  } catch (error) { $('access-form').hidden = false; status(error.message); return false; }
}
$('access-form').onsubmit = async event => { event.preventDefault(); token = $('access').value.trim(); sessionStorage.setItem('mcq-access', token); await connect(); };
$('image').onchange = () => { $('filename').textContent = $('image').files[0]?.name || ''; $('clear-image').hidden = !$('image').files.length; };
$('clear-image').onclick = () => { $('image').value = ''; $('filename').textContent = ''; $('clear-image').hidden = true; };
async function readImage(file) {
  if (file.size > 12000000) throw new Error('Choose an image smaller than 12 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  if (data.length > 4000000) throw new Error('Image is too large. Crop it to the question first.');
  return data;
}
function show(data) {
  $('answer').hidden = false;
  const math = [];
  const markdown = data.answer.replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[^\n$]+?(?<!\\)\$(?!\$)/g, value => { math.push(value); return `MCQMATHPLACEHOLDER${math.length - 1}TOKEN`; });
  $('answer-text').innerHTML = window.DOMPurify.sanitize(marked.parse(markdown), { USE_PROFILES: { html: true } });
  const walker = document.createTreeWalker($('answer-text'), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) walker.currentNode.textContent = walker.currentNode.textContent.replace(/MCQMATHPLACEHOLDER(\d+)TOKEN/g, (match, n) => math[Number(n)] || match);
  $('provider').textContent = `${data.provider}${data.cached ? ' · reused answer' : ''}`;
  $('calculations').replaceChildren();
  for (const calculation of data.calculations || []) { const line = document.createElement('div'); line.textContent = `${calculation.expression} = ${calculation.result}`; $('calculations').append(line); }
  $('sources').replaceChildren();
  for (const source of data.sources || []) {
    if (!/^https?:\/\//.test(source.url)) continue;
    const link = document.createElement('a'); link.href = source.url; link.textContent = source.title || source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; $('sources').append(link);
  }
  if (data.searchSuggestions) {
    const frame = document.createElement('iframe'); frame.title = 'Google Search suggestions'; frame.sandbox = 'allow-popups allow-popups-to-escape-sandbox'; frame.srcdoc = data.searchSuggestions; frame.style.cssText = 'width:100%;height:130px;border:0;margin-top:14px'; $('sources').append(frame);
  }
  window.renderMathInElement?.($('answer-text'), { delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false, trust: false, maxExpand: 500 });
  $('allowance').textContent = `${data.remaining} of 50 questions left today`;
}
$('question-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  if (!token) { status('Open your student access link first.'); $('access').focus(); return; }
  const question = $('question').value.trim(), file = $('image').files[0];
  if (!question && !file) { status('Enter a question or attach an image.'); $('question').focus(); return; }
  busy = true; $('ask').disabled = true; $('answer').hidden = true;
  status('Working through your question. This can take up to a minute…');
  try {
    const body = JSON.stringify({ question, image: file ? await readImage(file) : '', webSearch: $('search').checked });
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { data = await call('/api/answer', { method: 'POST', body }); break; }
      catch (error) {
        if (!error.retryMs || attempt === 2) throw error;
        let seconds = Math.ceil(Math.min(60000, Math.max(5000, error.retryMs)) / 1000);
        while (seconds > 0) { status(`Waiting for free capacity. Retrying in ${seconds--} seconds…`); await new Promise(resolve => setTimeout(resolve, 1000)); }
        status('Retrying your question…');
      }
    }
    show(data); status($('search').checked && !data.searchUsed ? 'Answer received. The provider supplied no web sources; this answer is not verified by web search.' : 'Answer ready. Check the explanation below.');
  } catch (error) { status(`${error.message}${error.retryMs ? ` Retry in about ${Math.ceil(error.retryMs / 1000)} seconds.` : ''}`); }
  finally { busy = false; $('ask').disabled = false; }
};
call('/api/health').then(health => {
  if (!health.ready) status('The service is set up, but the owner still needs to connect a free AI provider.');
  else if (token) connect(); else status('Open your student access link to get started.');
}).catch(() => status('Could not reach the study service. Try reloading.'));
